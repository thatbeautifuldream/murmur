import { BrowserWindow, clipboard } from "electron";
import { execFile } from "node:child_process";
import { IpcChannels, type DictationStatus, type DictationStopResult } from "@app/contracts";

const SPEECHD_URL = "http://127.0.0.1:8722";

let status: DictationStatus = "idle";

function setStatus(next: DictationStatus): void {
  status = next;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_DICTATION_STATUS_CHANGED, status);
  }
}

function broadcastTranscript(text: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_DICTATION_TRANSCRIPT, text);
  }
}

export function getDictationStatus(): DictationStatus {
  return status;
}

export async function startDictation(locale = "en-US"): Promise<{ ok: boolean; error?: string }> {
  if (status === "listening") return { ok: true };
  try {
    const response = await fetch(`${SPEECHD_URL}/start?locale=${encodeURIComponent(locale)}`, {
      method: "POST",
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus("error");
      return { ok: false, error: body.error ?? `HTTP ${response.status}` };
    }
    setStatus("listening");
    return { ok: true };
  } catch (error) {
    setStatus("error");
    return { ok: false, error: `murmur-speechd unreachable: ${String(error)}` };
  }
}

export async function stopDictation(): Promise<DictationStopResult> {
  if (status !== "listening") return { text: "" };
  try {
    const response = await fetch(`${SPEECHD_URL}/stop`, { method: "POST" });
    const body = (await response.json()) as { text?: string };
    const text = body.text ?? "";
    if (text) {
      setStatus("inserting");
      await insertAtCursor(text);
      broadcastTranscript(text);
    }
    setStatus("idle");
    return { text };
  } catch {
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
