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

// `@earendil-works/pi-coding-agent` is ESM-only (its package.json `exports`
// has no `require` condition), but the desktop main process is bundled to
// CJS (see tsdown.config.ts) — a static import here would compile to a
// `require()` that throws ERR_PACKAGE_PATH_NOT_EXPORTED at startup. A
// dynamic `import()` works from CJS and fits naturally since session setup
// is already async and lazy (see ensureSession).
function loadPi() {
  return import("@earendil-works/pi-coding-agent");
}

// GLM-5.1 on the Z.AI Coding Plan endpoint (api.z.ai/api/coding/paas/v4,
// provider id "zai" in pi-ai's built-in registry — auth via ZAI_API_KEY or
// `pi auth` against that provider).
const DEFAULT_MODEL_PROVIDER = "zai";
const DEFAULT_MODEL_ID = "glm-5.1";

let status: AgentStatus = "idle";
let session: AgentSession | undefined;
let modelRuntime: ModelRuntime | undefined;
const statusListeners = new Set<(status: AgentStatus) => void>();
const approvalListeners = new Set<(pending: boolean) => void>();
const pendingApprovals = new Map<string, (approved: boolean) => void>();
let responseBuffer = "";

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
    }
  });

  return session;
}

export function initAgentSessionManager(): void {
  // Session creation is deliberately lazy (first prompt) — startup shouldn't
  // pay for spinning up a model runtime + resource loader if agent mode is
  // never used this run.
}

/** Sends `text` as a prompt, waits for the full response, then speaks it back
 *  once via speechd's /speak (v1 speaks per-turn, not per-sentence-chunk). */
export async function sendAgentPrompt(text: string): Promise<void> {
  setStatus("thinking");
  responseBuffer = "";
  try {
    const activeSession = await ensureSession();
    await activeSession.prompt(text);
  } catch (error) {
    console.error("murmur: agent prompt failed", error);
    setStatus("error");
    return;
  }
  const reply = responseBuffer.trim();
  broadcastMessageComplete(reply);
  if (!reply) {
    setStatus("idle");
    return;
  }
  setStatus("speaking");
  try {
    await fetch(`${SPEECHD_URL}/speak?${new URLSearchParams({ text: reply }).toString()}`, {
      method: "POST",
    });
  } catch (error) {
    console.error("murmur: speak request failed", error);
  }
  setStatus("idle");
}

/** Aborts an in-flight turn and any playing speech — used when the agent
 *  shortcut is tapped again mid-`thinking`/`speaking` (barge-in). */
export async function abortAgentTurn(): Promise<void> {
  await session?.abort();
  try {
    await fetch(`${SPEECHD_URL}/speak/stop`, { method: "POST" });
  } catch {
    // best effort — speechd may not be running
  }
  setStatus("idle");
}

export function resetAgentConversation(): void {
  session?.dispose();
  session = undefined;
  responseBuffer = "";
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
