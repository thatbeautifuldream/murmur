import { LOCAL_HTTP_PORT, type DesktopBridge, type TranscriptHistoryEntry } from "@app/contracts";

export const isDesktop = typeof window !== "undefined" && !!window.desktopBridge;

export function getDesktopBridge(): DesktopBridge | null {
  return window.desktopBridge ?? null;
}

type HistoryBridge = Pick<
  DesktopBridge,
  | "listTranscriptHistory"
  | "deleteTranscriptHistoryEntry"
  | "clearTranscriptHistory"
  | "restoreTranscriptHistoryEntries"
  | "readTranscriptAudio"
  | "onTranscriptHistoryChanged"
>;

const LOCAL_API_BASE = `http://127.0.0.1:${LOCAL_HTTP_PORT}`;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Talks to the desktop app's localhost HTTP API (apps/desktop/src/local-server.ts)
 *  so a plain browser tab — no `window.desktopBridge` — can read and manage
 *  the same transcript history, as long as the desktop app is running on
 *  this machine. */
function createWebHistoryBridge(): HistoryBridge {
  return {
    listTranscriptHistory: async (limit) => {
      const query = limit ? `?limit=${limit}` : "";
      const response = await fetch(`${LOCAL_API_BASE}/transcript-history${query}`);
      if (!response.ok) throw new Error(`Failed to load history (${response.status})`);
      return (await response.json()) as TranscriptHistoryEntry[];
    },
    deleteTranscriptHistoryEntry: async (id) => {
      const response = await fetch(`${LOCAL_API_BASE}/transcript-history/${id}`, { method: "DELETE" });
      if (!response.ok) return null;
      return (await response.json()) as TranscriptHistoryEntry | null;
    },
    clearTranscriptHistory: async () => {
      const response = await fetch(`${LOCAL_API_BASE}/transcript-history`, { method: "DELETE" });
      if (!response.ok) return [];
      return (await response.json()) as TranscriptHistoryEntry[];
    },
    restoreTranscriptHistoryEntries: async (entries) => {
      await fetch(`${LOCAL_API_BASE}/transcript-history/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entries),
      });
    },
    readTranscriptAudio: async (id) => {
      const response = await fetch(`${LOCAL_API_BASE}/transcript-history/${id}/audio`);
      if (!response.ok) return null;
      return blobToDataUrl(await response.blob());
    },
    onTranscriptHistoryChanged: (listener) => {
      // No push channel from the desktop process to a separate browser tab
      // over plain HTTP, so poll instead.
      const interval = setInterval(listener, 4000);
      return () => clearInterval(interval);
    },
  };
}

/** History operations, available whether this is running inside the
 *  Electron shell (`window.desktopBridge`) or as a plain web page falling
 *  back to the local HTTP API. */
export function getHistoryBridge(): HistoryBridge {
  return window.desktopBridge ?? createWebHistoryBridge();
}

declare module "react" {
  interface CSSProperties {
    WebkitAppRegion?: "drag" | "no-drag";
  }
}
