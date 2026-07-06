import { globalShortcut } from "electron";
import type { ActivationShortcut, SetActivationShortcutResult } from "@app/contracts";
import { toggleDictation } from "./dictation";
import {
  disableOptionTap,
  enableOptionTap,
  hasAccessibilityAccess,
  openAccessibilitySettings,
} from "./option-key-listener";
import { getActivationShortcut, setActivationShortcut } from "./settings-store";

let accessibilityPoll: ReturnType<typeof setInterval> | undefined;
let registeredAccelerator: string | undefined;

// Portable `@tanstack/hotkeys` modifier/key tokens → Electron accelerator tokens.
const MODIFIER_TOKENS: Record<string, string> = {
  Mod: "CommandOrControl",
  CommandOrControl: "CommandOrControl",
  Meta: "Command",
  Command: "Command",
  Cmd: "Command",
  Control: "Control",
  Ctrl: "Control",
  Alt: "Alt",
  Option: "Alt",
  Shift: "Shift",
  Super: "Super",
};

const KEY_TOKENS: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
};

/** Converts a portable hotkey like `Mod+Shift+D` into an Electron accelerator. */
export function hotkeyToAccelerator(hotkey: string): string {
  return hotkey
    .split("+")
    .map((token) => MODIFIER_TOKENS[token] ?? KEY_TOKENS[token] ?? token)
    .join("+");
}

function teardown(): void {
  disableOptionTap();
  if (accessibilityPoll) {
    clearInterval(accessibilityPoll);
    accessibilityPoll = undefined;
  }
  if (registeredAccelerator) {
    globalShortcut.unregister(registeredAccelerator);
    registeredAccelerator = undefined;
  }
}

// The Option-tap hook needs macOS Accessibility. Prompt for it, and since the
// grant can't attach to an already-running tap (and the user grants it out of
// band in System Settings), start the listener only once trusted — polling so
// no app relaunch is needed after the toggle is flipped.
function startOptionTapWhenTrusted(): void {
  if (hasAccessibilityAccess(true)) {
    enableOptionTap(() => void toggleDictation());
    return;
  }
  openAccessibilitySettings();
  accessibilityPoll = setInterval(() => {
    if (hasAccessibilityAccess(false)) {
      clearInterval(accessibilityPoll);
      accessibilityPoll = undefined;
      enableOptionTap(() => void toggleDictation());
    }
  }, 1000);
}

/** Tears down the current trigger and (re)registers `shortcut`. For a `combo`,
 *  a failed registration leaves nothing active — callers should re-apply the
 *  previous shortcut on failure. */
export function applyActivationShortcut(shortcut: ActivationShortcut): SetActivationShortcutResult {
  teardown();

  if (shortcut.kind === "combo") {
    const accelerator = hotkeyToAccelerator(shortcut.hotkey);
    try {
      const ok = globalShortcut.register(accelerator, () => void toggleDictation());
      if (!ok) {
        return { ok: false, error: `“${shortcut.hotkey}” is already in use by another app.` };
      }
      registeredAccelerator = accelerator;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  startOptionTapWhenTrusted();
  return { ok: true };
}

/** Registers the stored (or default) shortcut at startup. */
export function initActivationShortcut(): void {
  applyActivationShortcut(getActivationShortcut());
}

/** Persists and applies a new shortcut, rolling back to the previous one if the
 *  new shortcut can't be registered. */
export function changeActivationShortcut(shortcut: ActivationShortcut): SetActivationShortcutResult {
  const previous = getActivationShortcut();
  const result = applyActivationShortcut(shortcut);
  if (result.ok) {
    setActivationShortcut(shortcut);
  } else {
    applyActivationShortcut(previous);
  }
  return result;
}

export function teardownActivationShortcut(): void {
  teardown();
}
