export type TKeyboardShortcut = {
  keys: string[];
  description: string;
};

// Single source of truth consumed by the shortcuts dialog. The hotkeys
// themselves are registered at their call sites via useHotkey.
export const KEYBOARD_SHORTCUTS: TKeyboardShortcut[] = [
  { keys: ["Mod", "B"], description: "Toggle the sidebar" },
  { keys: ["Mod", "/"], description: "Show keyboard shortcuts" },
];
