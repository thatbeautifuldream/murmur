import { app, BrowserWindow, clipboard } from "electron";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { IpcChannels, type DictationStatus, type DictationStopResult } from "@app/contracts";
import { saveTranscriptHistory } from "./transcript-history";
import { playDictationStartSound, playDictationStopSound } from "./system-sounds";

const SPEECHD_URL = "http://127.0.0.1:8722";

let status: DictationStatus = "idle";
let activeLocale = "en-US";
let startedAt: number | undefined;
let activeRecordingPath: string | undefined;
let partialPollTimer: NodeJS.Timeout | undefined;
let lastPartialText = "";
const statusListeners = new Set<(status: DictationStatus) => void>();

interface FrontmostAppInfo {
  name: string | null;
  bundleId: string | null;
  processId: number | null;
}

function setStatus(next: DictationStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_DICTATION_STATUS_CHANGED, status);
  }
  for (const listener of statusListeners) {
    listener(status);
  }
}

function broadcastTranscript(text: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_DICTATION_TRANSCRIPT, text);
  }
}

function broadcastPartialTranscript(text: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_DICTATION_PARTIAL_TRANSCRIPT, text);
  }
}

function startPartialPolling(): void {
  lastPartialText = "";
  partialPollTimer = setInterval(() => {
    void fetch(`${SPEECHD_URL}/partial`)
      .then((response) => response.json() as Promise<{ text?: string }>)
      .then((body) => {
        const text = body.text ?? "";
        if (text !== lastPartialText) {
          lastPartialText = text;
          broadcastPartialTranscript(text);
        }
      })
      .catch(() => {});
  }, 120);
}

/** Stops polling for new partial text but deliberately leaves the last
 *  caption broadcast in place — it keeps showing through the `processing`
 *  state until the final transcript replaces or clears it, instead of
 *  vanishing the instant the mic stops. */
function stopPartialPolling(): void {
  if (partialPollTimer) {
    clearInterval(partialPollTimer);
    partialPollTimer = undefined;
  }
  lastPartialText = "";
}

export function getDictationStatus(): DictationStatus {
  return status;
}

export function onDictationStatusChanged(
  listener: (status: DictationStatus) => void,
): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export async function startDictation(locale = "en-US"): Promise<{ ok: boolean; error?: string }> {
  if (status === "listening") return { ok: true };
  try {
    const recordingPath = createRecordingPath();
    const params = new URLSearchParams({ locale, recordingPath });
    const response = await fetch(`${SPEECHD_URL}/start?${params.toString()}`, { method: "POST" });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      return { ok: false, error: body.error ?? `HTTP ${response.status}` };
    }
    activeLocale = locale;
    activeRecordingPath = recordingPath;
    startedAt = Date.now();
    playDictationStartSound();
    setStatus("listening");
    startPartialPolling();
    return { ok: true };
  } catch (error) {
    setStatus("error");
    return { ok: false, error: `murmur-speechd unreachable: ${String(error)}` };
  }
}

export async function stopDictation(): Promise<DictationStopResult> {
  if (status !== "listening") return { text: "" };
  try {
    stopPartialPolling();
    setStatus("processing");
    const sourceApp = await getFrontmostAppInfo();
    const response = await fetch(`${SPEECHD_URL}/stop`, { method: "POST" });
    const body = (await response.json()) as { text?: string; audioPath?: string };
    const text = body.text ?? "";
    const audioPath = body.audioPath || activeRecordingPath || null;
    if (text) {
      broadcastPartialTranscript(text);
      setStatus("inserting");
      await insertAtCursor(text);
      try {
        saveTranscriptHistory({
          text,
          locale: activeLocale,
          sourceAppName: sourceApp.name,
          sourceAppBundleId: sourceApp.bundleId,
          sourceProcessId: sourceApp.processId,
          durationMs: startedAt ? Date.now() - startedAt : null,
          audioPath,
          audioFormat: audioPath ? "wav" : null,
          audioByteSize: getFileSize(audioPath),
          inserted: true,
        });
      } catch (error) {
        console.error("murmur: failed to save transcript history", error);
      }
      broadcastTranscript(text);
      broadcastPartialTranscript("");
    } else {
      deleteFileIfPresent(audioPath);
      broadcastPartialTranscript("");
    }
    activeRecordingPath = undefined;
    startedAt = undefined;
    playDictationStopSound();
    setStatus("idle");
    return { text };
  } catch {
    stopPartialPolling();
    broadcastPartialTranscript("");
    deleteFileIfPresent(activeRecordingPath);
    activeRecordingPath = undefined;
    startedAt = undefined;
    setStatus("idle");
    return { text: "" };
  }
}

/** Bound to the global shortcut, which has no button to reflect state onto —
 *  it just flips whatever `startDictation`/`stopDictation` would otherwise
 *  need a click for. */
export async function toggleDictation(): Promise<void> {
  if (status === "listening") {
    await stopDictation();
  } else if (status === "idle" || status === "error") {
    await startDictation();
  }
}

/** Places `text` on the clipboard and pastes it into the frontmost app —
 *  the same clipboard + synthetic-paste approach most dictation utilities
 *  use to insert text at the user's cursor without a per-app integration.
 *  Requires the Accessibility permission (System Settings → Privacy &
 *  Security → Accessibility) for the paste keystroke to land. */
async function insertAtCursor(text: string): Promise<void> {
  const previousClipboard = clipboard.readText();
  clipboard.writeText(text);
  await new Promise<void>((resolve) => {
    execFile(
      "osascript",
      ["-e", 'tell application "System Events" to keystroke "v" using command down'],
      () => resolve(),
    );
  });
  setTimeout(() => clipboard.writeText(previousClipboard), 2000);
}

function createRecordingPath(): string {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const directory = join(app.getPath("userData"), "recordings", year, month);
  mkdirSync(directory, { recursive: true });
  return join(directory, `${randomUUID()}.wav`);
}

function getFileSize(filePath: string | null): number | null {
  if (!filePath) return null;
  try {
    return statSync(filePath).size;
  } catch {
    return null;
  }
}

function deleteFileIfPresent(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    unlinkSync(filePath);
  } catch {
    // Best effort cleanup for empty/failed dictation recordings.
  }
}

async function getFrontmostAppInfo(): Promise<FrontmostAppInfo> {
  if (process.platform !== "darwin") {
    return { name: null, bundleId: null, processId: null };
  }

  return new Promise((resolve) => {
    execFile(
      "osascript",
      [
        "-e",
        `tell application "System Events"
          set frontApp to first application process whose frontmost is true
          set appName to name of frontApp
          set appPid to unix id of frontApp
          try
            set appBundleId to bundle identifier of frontApp
          on error
            set appBundleId to ""
          end try
        end tell
        return appName & linefeed & appBundleId & linefeed & appPid`,
      ],
      (_error, stdout) => {
        const [name, bundleId, processId] = stdout.trim().split("\n");
        const parsedProcessId = processId ? Number(processId) : NaN;
        resolve({
          name: name || null,
          bundleId: bundleId || null,
          processId: Number.isFinite(parsedProcessId) ? parsedProcessId : null,
        });
      },
    );
  });
}
