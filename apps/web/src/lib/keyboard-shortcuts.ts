export type TKeyboardShortcut = {
  keys: string[];
  description: string;
};

// Single source of truth consumed by the shortcuts dialog. The hotkeys
// themselves are registered at their call sites via useHotkey.
export const KEYBOARD_SHORTCUTS: TKeyboardShortcut[] = [
  { keys: ["Mod", "/"], description: "Show keyboard shortcuts" },
  { keys: ["Mod", "B"], description: "Show or hide the sidebar" },
  { keys: ["Alt"], description: "Start or stop dictation (from any app)" },
];
