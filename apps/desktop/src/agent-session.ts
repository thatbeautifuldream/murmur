import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import type {
  AgentSession,
  ExtensionFactory,
  ModelRuntime,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { IpcChannels, SPEECHD_URL, type AgentStatus, type AgentToolApprovalRequest } from "@app/contracts";
import { getAgentConfig } from "./settings-store";
import { SpeechStreamer } from "./speech-stream";

// `@earendil-works/pi-coding-agent` is ESM-only (its package.json `exports`
// has no `require` condition), but the desktop main process is bundled to
// CJS (see tsdown.config.ts) — a static import here would compile to a
// `require()` that throws ERR_PACKAGE_PATH_NOT_EXPORTED at startup. A
// dynamic `import()` works from CJS and fits naturally since session setup
// is already async and lazy (see ensureSession).
function loadPi() {
  return import("@earendil-works/pi-coding-agent");
}

// GPT-5.6 Luna on the ChatGPT Codex backend (provider id "openai-codex" in
// pi-ai's built-in registry — auth via `pi auth` against that provider).
const DEFAULT_MODEL_PROVIDER = "openai-codex";
const DEFAULT_MODEL_ID = "gpt-5.6-luna";
const DEFAULT_THINKING_LEVEL = "low";

let status: AgentStatus = "idle";
let session: AgentSession | undefined;
let modelRuntime: ModelRuntime | undefined;
const statusListeners = new Set<(status: AgentStatus) => void>();
const approvalListeners = new Set<(pending: boolean) => void>();
const pendingApprovals = new Map<string, (approved: boolean) => void>();
let responseBuffer = "";
let speechStreamer: SpeechStreamer | undefined;
/** Bumped by every barge-in and every new turn; speech work carrying a stale
 *  generation is dropped instead of being spoken over the next turn. */
let speechGeneration = 0;
/** Serializes the /speak posts so chunks reach speechd in the order they were
 *  produced — the daemon appends to its utterance queue, so an out-of-order
 *  arrival would be spoken out of order. */
let speechQueue: Promise<void> = Promise.resolve();

function setStatus(next: AgentStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_AGENT_STATUS_CHANGED, status);
  }
  for (const listener of statusListeners) listener(status);
}

/** Pushes approval-pending transitions to subscribers — the main process uses
 *  this to grow the pill window tall enough to fit the inline approval card
 *  (the default expanded footprint is too short for it). */
function setApprovalPending(pending: boolean): void {
  for (const listener of approvalListeners) listener(pending);
}

function broadcastTextDelta(delta: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_AGENT_TEXT_DELTA, delta);
  }
}

function broadcastMessageComplete(text: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_AGENT_MESSAGE_COMPLETE, text);
  }
}

function broadcastToolApprovalRequest(request: AgentToolApprovalRequest): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_AGENT_TOOL_APPROVAL_REQUEST, request);
  }
}

export function getAgentStatus(): AgentStatus {
  return status;
}

export function onAgentStatusChanged(listener: (status: AgentStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function onAgentApprovalPendingChanged(listener: (pending: boolean) => void): () => void {
  approvalListeners.add(listener);
  return () => approvalListeners.delete(listener);
}

/** Gates every tool call behind an explicit user approve/deny, round-tripped
 *  over IPC to the renderer — voice-triggered bash/edit/write must never run
 *  unattended. Registered via `extensionFactories` since `createAgentSession`
 *  itself exposes no tool-call interception hook. */
const approvalGateExtension: ExtensionFactory = (pi) => {
  pi.on("tool_call", async (event): Promise<ToolCallEventResult | void> => {
    const id = randomUUID();
    const wasEmpty = pendingApprovals.size === 0;
    const approved = await new Promise<boolean>((resolve) => {
      pendingApprovals.set(id, resolve);
      if (wasEmpty) setApprovalPending(true);
      broadcastToolApprovalRequest({ id, toolName: event.toolName, input: event.input });
    });
    if (!approved) {
      return { block: true, reason: "User denied" };
    }
  });
};

export function respondToolApproval(id: string, approved: boolean): void {
  const resolve = pendingApprovals.get(id);
  if (!resolve) return;
  pendingApprovals.delete(id);
  if (pendingApprovals.size === 0) setApprovalPending(false);
  resolve(approved);
}

async function ensureSession(): Promise<AgentSession> {
  if (session) return session;
  const { cwd } = getAgentConfig();
  const resolvedCwd = cwd ?? process.cwd();

  const pi = await loadPi();
  modelRuntime ??= await pi.ModelRuntime.create();

  const resourceLoader = new pi.DefaultResourceLoader({
    cwd: resolvedCwd,
    agentDir: pi.getAgentDir(),
    extensionFactories: [approvalGateExtension],
  });
  await resourceLoader.reload();

  const defaultModel = modelRuntime.getModel(DEFAULT_MODEL_PROVIDER, DEFAULT_MODEL_ID);
  if (!defaultModel) {
    console.warn(
      `murmur: model ${DEFAULT_MODEL_PROVIDER}/${DEFAULT_MODEL_ID} not found in registry — falling back to the SDK's default.`,
    );
  }

  const { session: created } = await pi.createAgentSession({
    cwd: resolvedCwd,
    model: defaultModel,
    thinkingLevel: DEFAULT_THINKING_LEVEL,
    modelRuntime,
    resourceLoader,
    // Persist sessions to ~/.pi/agent/sessions/<encoded-cwd>/ so a conversation
    // started by voice can later be resumed from the `pi` TUI (`pi --continue`,
    // `pi --resume`, or `pi --session <id>` in the same cwd).
    sessionManager: pi.SessionManager.create(resolvedCwd),
  });
  session = created;

  session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      responseBuffer += event.assistantMessageEvent.delta;
      broadcastTextDelta(event.assistantMessageEvent.delta);
      // Only `text_delta` feeds speech — `thinking_delta` is deliberately not
      // subscribed to, so reasoning is never read aloud.
      speechStreamer?.push(event.assistantMessageEvent.delta);
    }
  });

  return session;
}

export function initAgentSessionManager(): void {
  // Session creation is deliberately lazy (first prompt) — startup shouldn't
  // pay for spinning up a model runtime + resource loader if agent mode is
  // never used this run.
}

function enqueueSpeech(chunk: string, generation: number): void {
  speechQueue = speechQueue.then(async () => {
    if (generation !== speechGeneration) return;
    try {
      await fetch(`${SPEECHD_URL}/speak?${new URLSearchParams({ text: chunk }).toString()}`, {
        method: "POST",
      });
    } catch (error) {
      console.error("murmur: speak request failed", error);
    }
  });
}

/** Resolves once speechd has drained its utterance queue, so `speaking` lasts
 *  as long as the audio does rather than ending when the last chunk is posted. */
async function waitForSpeechToFinish(generation: number): Promise<void> {
  while (generation === speechGeneration) {
    try {
      const response = await fetch(`${SPEECHD_URL}/speak/status`);
      const body = (await response.json()) as { speaking?: string };
      if (body.speaking !== "true") return;
    } catch {
      return; // speechd gone — don't strand the UI in `speaking`
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/** Sends `text` as a prompt and speaks the reply as it streams: each sentence
 *  is handed to speechd the moment it is complete, so the agent starts talking
 *  while the model is still writing instead of after the whole turn. */
export async function sendAgentPrompt(text: string): Promise<void> {
  setStatus("thinking");
  responseBuffer = "";
  const generation = ++speechGeneration;
  speechStreamer = new SpeechStreamer((chunk) => {
    if (generation !== speechGeneration) return;
    if (status !== "speaking") setStatus("speaking");
    enqueueSpeech(chunk, generation);
  });

  try {
    const activeSession = await ensureSession();
    await activeSession.prompt(text);
  } catch (error) {
    speechStreamer = undefined;
    // A cancelled turn surfaces here as a rejected `prompt()`; that's the user
    // getting what they asked for, not a failure to report as one.
    if (generation !== speechGeneration) return;
    console.error("murmur: agent prompt failed", error);
    setStatus("error");
    return;
  }

  speechStreamer.end();
  speechStreamer = undefined;
  // Cancelled mid-turn: the reply that did arrive stays on screen, but nothing
  // further gets spoken and the status is already back to idle.
  if (generation !== speechGeneration) return;
  broadcastMessageComplete(responseBuffer.trim());

  await speechQueue;
  await waitForSpeechToFinish(generation);
  if (generation === speechGeneration) setStatus("idle");
}

/** Aborts an in-flight turn and any playing speech — used when the agent
 *  shortcut is tapped again mid-`thinking`/`speaking` (barge-in). */
export async function abortAgentTurn(): Promise<void> {
  speechGeneration += 1;
  speechStreamer = undefined;
  await session?.abort();
  try {
    await fetch(`${SPEECHD_URL}/speak/stop`, { method: "POST" });
  } catch {
    // best effort — speechd may not be running
  }
  setStatus("idle");
}

/** Stops listening and throws the transcript away instead of prompting with
 *  it — the escape hatch for a mis-fired shortcut. */
async function discardAgentListening(): Promise<void> {
  try {
    await fetch(`${SPEECHD_URL}/stop`, { method: "POST" });
  } catch {
    // best effort — speechd may not be running
  }
  setStatus("idle");
}

/** What Esc does, which depends on what the agent is currently doing. The one
 *  rule is that Esc always backs out of the current step and never destroys
 *  something the user might still want:
 *
 *  - a pending tool approval is denied (Esc on a confirmation means "no"), and
 *    the turn carries on so the agent can respond to the refusal;
 *  - while listening, the recording is dropped rather than sent — otherwise
 *    the only way out of a mis-fired shortcut is to send the transcript;
 *  - while thinking or speaking, the turn and the audio both stop, but the
 *    reply already on screen stays there to be read. */
export async function cancelAgentTurn(): Promise<void> {
  if (pendingApprovals.size > 0) {
    for (const id of [...pendingApprovals.keys()]) respondToolApproval(id, false);
    return;
  }
  if (status === "listening") {
    await discardAgentListening();
    return;
  }
  if (status === "thinking" || status === "speaking") {
    await abortAgentTurn();
  }
}

export function resetAgentConversation(): void {
  session?.dispose();
  session = undefined;
  responseBuffer = "";
  speechGeneration += 1;
  speechStreamer = undefined;
  if (pendingApprovals.size > 0) {
    pendingApprovals.clear();
    setApprovalPending(false);
  }
}

/** Recording orchestration for agent mode — talks to speechd's /start and
 *  /stop directly rather than reusing dictation.ts's startDictation/
 *  stopDictation, which are wired to cursor-paste + transcript history that
 *  agent mode doesn't want. */
async function startAgentListening(): Promise<void> {
  try {
    const response = await fetch(`${SPEECHD_URL}/start`, { method: "POST" });
    if (!response.ok) {
      setStatus("error");
      return;
    }
    setStatus("listening");
  } catch (error) {
    console.error("murmur: agent-mode speechd start failed", error);
    setStatus("error");
  }
}

async function stopAgentListeningAndSend(): Promise<void> {
  try {
    const response = await fetch(`${SPEECHD_URL}/stop`, { method: "POST" });
    const body = (await response.json()) as { text?: string };
    const text = (body.text ?? "").trim();
    if (!text) {
      setStatus("idle");
      return;
    }
    await sendAgentPrompt(text);
  } catch (error) {
    console.error("murmur: agent-mode speechd stop failed", error);
    setStatus("error");
  }
}

/** Bound to the agent global shortcut. `idle` starts listening; `listening`
 *  stops and sends the transcript; `thinking`/`speaking` is barge-in (abort
 *  and return to idle) rather than starting a second overlapping turn. */
export async function toggleAgentMode(): Promise<void> {
  if (status === "idle" || status === "error") {
    await startAgentListening();
  } else if (status === "listening") {
    await stopAgentListeningAndSend();
  } else {
    await abortAgentTurn();
  }
}
