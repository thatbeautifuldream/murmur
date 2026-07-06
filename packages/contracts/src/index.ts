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
  WINDOW_SET_PILL_INTERACTIVE: "window:set-pill-interactive",
  WINDOW_MOVE_PILL: "window:move-pill",
  TRANSCRIPT_HISTORY_RESTORE: "transcript-history:restore",
  MENU_TOGGLE_SIDEBAR: "menu:toggle-sidebar",
  MENU_SHOW_KEYBOARD_SHORTCUTS: "menu:show-keyboard-shortcuts",
  SETTINGS_GET_ACTIVATION_SHORTCUT: "settings:get-activation-shortcut",
  SETTINGS_SET_ACTIVATION_SHORTCUT: "settings:set-activation-shortcut",
  SETTINGS_GET_MODES: "settings:get-modes",
  SETTINGS_SET_MODES: "settings:set-modes",
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

/** The gesture that toggles dictation from any app. `option-tap` is the default
 *  — a lone tap of the Option key, caught by a system-wide key hook (needs macOS
 *  Accessibility). `combo` is any user-recorded accelerator (e.g. `Mod+Shift+D`)
 *  registered as an Electron global shortcut. `hotkey` is a portable
 *  `@tanstack/hotkeys` string. */
export type ActivationShortcut = { kind: "option-tap" } | { kind: "combo"; hotkey: string };

export const DEFAULT_ACTIVATION_SHORTCUT: ActivationShortcut = { kind: "option-tap" };

export interface SetActivationShortcutResult {
  ok: boolean;
  error?: string;
}

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

/** A find/replace applied to the final transcript before it's inserted,
 *  e.g. `{ from: "my email", to: "you@example.com" }`. Matching is
 *  case-insensitive and substring by default; `wholeWord` requires word
 *  boundaries and `caseSensitive` an exact-case match. */
export interface ReplacementRule {
  from: string;
  to: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

/** A per-context dictation profile. Auto-selected when the frontmost app's
 *  bundle id is in `appBundleIds`; falls back to the config's default mode.
 *  `vocabulary` biases Apple Speech recognition (contextual strings) and
 *  `replacements` post-process the final transcript. */
export interface DictationMode {
  id: string;
  name: string;
  appBundleIds: string[];
  locale?: string;
  vocabulary: string[];
  replacements: ReplacementRule[];
}

export interface ModesConfig {
  modes: DictationMode[];
  /** Id of the mode used when no app matches, always present in `modes`. */
  defaultModeId: string;
  /** When set, this mode is forced regardless of the frontmost app. `null`
   *  means auto-select by app. */
  overrideModeId: string | null;
}

export const DEFAULT_MODE_ID = "default";

export const DEFAULT_MODES_CONFIG: ModesConfig = {
  modes: [
    {
      id: DEFAULT_MODE_ID,
      name: "Default",
      appBundleIds: [],
      vocabulary: [],
      replacements: [],
    },
  ],
  defaultModeId: DEFAULT_MODE_ID,
  overrideModeId: null,
};

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
  deleteTranscriptHistoryEntry(id: string): Promise<TranscriptHistoryEntry | null>;
  clearTranscriptHistory(): Promise<TranscriptHistoryEntry[]>;
  restoreTranscriptHistoryEntries(entries: TranscriptHistoryEntry[]): Promise<void>;
  /** Reads a transcript's recorded audio off disk and returns it as a data
   *  URL for local playback — `null` if the entry has no audio or the file
   *  is missing. */
  readTranscriptAudio(id: string): Promise<string | null>;
  onTranscriptHistoryChanged(listener: () => void): () => void;
  /** Whether the app window is currently native macOS full screen — the OS
   *  hides the traffic-light controls in that state. */
  isFullScreen(): Promise<boolean>;
  onFullScreenChanged(listener: (isFullScreen: boolean) => void): () => void;
  /** While idle the pill window ignores the mouse so clicks fall through to
   *  whatever's underneath. The pill flips this on while the cursor is over it
   *  so it stays clickable and draggable. Only honored in the idle state. */
  setPillInteractive(interactive: boolean): void;
  /** Nudges the pill window by a screen-pixel delta — the renderer drives the
   *  drag itself (rather than a native `-webkit-app-region`) so the pill keeps
   *  its own cursor and the drag can't fight the click-through capture. */
  movePillBy(dx: number, dy: number): void;
  onMenuToggleSidebar(listener: () => void): () => void;
  onMenuShowKeyboardShortcuts(listener: () => void): () => void;
  /** The gesture that toggles dictation from any app. */
  getActivationShortcut(): Promise<ActivationShortcut>;
  /** Persists and re-registers the activation shortcut. Fails (without changing
   *  the live shortcut) if a `combo` can't be registered — e.g. already claimed
   *  by another app. */
  setActivationShortcut(shortcut: ActivationShortcut): Promise<SetActivationShortcutResult>;
  /** The custom dictation modes and which one is active/forced. */
  getModes(): Promise<ModesConfig>;
  /** Persists the full modes config (modes list, default, and override). */
  setModes(config: ModesConfig): Promise<void>;
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}
