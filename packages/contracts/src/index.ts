export const IpcChannels = {
  GET_APP_VERSION: "app:get-version",
  PICK_FOLDER: "dialog:pick-folder",
  OPEN_EXTERNAL: "shell:open-external",
  SET_THEME: "theme:set",
  ON_THEME_CHANGED: "theme:changed",
  DICTATION_START: "dictation:start",
  DICTATION_STOP: "dictation:stop",
  ON_DICTATION_STATUS_CHANGED: "dictation:status-changed",
  ON_DICTATION_TRANSCRIPT: "dictation:transcript",
  ON_DICTATION_PARTIAL_TRANSCRIPT: "dictation:partial-transcript",
  TRANSCRIPT_HISTORY_LIST: "transcript-history:list",
  TRANSCRIPT_HISTORY_DELETE: "transcript-history:delete",
  TRANSCRIPT_HISTORY_CLEAR: "transcript-history:clear",
  TRANSCRIPT_HISTORY_READ_AUDIO: "transcript-history:read-audio",
  ON_TRANSCRIPT_HISTORY_CHANGED: "transcript-history:changed",
  WINDOW_GET_FULLSCREEN: "window:get-fullscreen",
  ON_WINDOW_FULLSCREEN_CHANGED: "window:fullscreen-changed",
} as const;

/** Port for the localhost HTTP API the desktop app exposes so a plain
 *  browser tab (no `window.desktopBridge`) can read/manage the same
 *  transcript history — see apps/desktop/src/local-server.ts. */
export const LOCAL_HTTP_PORT = 47850;

export type Theme = "light" | "dark" | "system";
export type Platform = "darwin" | "win32" | "linux";

/** `processing` is the window after the mic stops and before the final
 *  transcript comes back; `inserting` is the brief window after that where
 *  the transcript is being pasted into the frontmost app. */
export type DictationStatus = "idle" | "listening" | "processing" | "inserting" | "error";

export interface DictationStartResult {
  ok: boolean;
  error?: string;
}

export interface DictationStopResult {
  text: string;
}

export interface TranscriptHistoryEntry {
  id: string;
  text: string;
  locale: string;
  sourceAppName: string | null;
  sourceAppBundleId: string | null;
  sourceProcessId: number | null;
  durationMs: number | null;
  audioPath: string | null;
  audioFormat: string | null;
  audioByteSize: number | null;
  inserted: boolean;
  createdAt: string;
}

export interface DesktopBridge {
  readonly platform: Platform;
  getAppVersion(): Promise<string>;
  pickFolder(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  onThemeChanged(listener: (theme: Theme) => void): () => void;
  /** Starts mic capture + live recognition in murmur-speechd. */
  startDictation(locale?: string): Promise<DictationStartResult>;
  /** Stops capture, pastes the transcript into the frontmost app, and
   *  returns the final transcript text. */
  stopDictation(): Promise<DictationStopResult>;
  /** Current state, and pushed updates — also driven by the global shortcut
   *  (a tap of Option), which the dictation button has no other way to see. */
  onDictationStatusChanged(listener: (status: DictationStatus) => void): () => void;
  /** Fires with the final transcript whenever dictation stops — including
   *  when stopped via the global shortcut, where there's no IPC caller
   *  around to receive `stopDictation`'s return value. */
  onDictationTranscript(listener: (text: string) => void): () => void;
  /** Fires repeatedly while listening with the live transcript as it's
   *  recognized, and once more with the final sentence right before
   *  `onDictationTranscript` fires. Fires with `""` when the caption should
   *  clear. */
  onDictationPartialTranscript(listener: (text: string) => void): () => void;
  listTranscriptHistory(limit?: number): Promise<TranscriptHistoryEntry[]>;
  deleteTranscriptHistoryEntry(id: string): Promise<void>;
  clearTranscriptHistory(): Promise<void>;
  /** Reads a transcript's recorded audio off disk and returns it as a data
   *  URL for local playback — `null` if the entry has no audio or the file
   *  is missing. */
  readTranscriptAudio(id: string): Promise<string | null>;
  onTranscriptHistoryChanged(listener: () => void): () => void;
  /** Whether the app window is currently native macOS full screen — the OS
   *  hides the traffic-light controls in that state. */
  isFullScreen(): Promise<boolean>;
  onFullScreenChanged(listener: (isFullScreen: boolean) => void): () => void;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
