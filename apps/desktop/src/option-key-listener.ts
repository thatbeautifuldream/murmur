import { shell, systemPreferences } from "electron";
import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from "uiohook-napi";

const ALT_KEYS = new Set<number>([UiohookKey.Alt, UiohookKey.AltRight]);

/** uiohook's global keyboard tap (CGEventTap) is gated by macOS Accessibility.
 *  In dev the grant is inherited from the launching terminal; the packaged app
 *  is its own TCC identity and has none until the user grants it, so the hook
 *  silently receives no events (and uIOhook.start() can crash when untrusted).
 *  `prompt` triggers the native "grant Accessibility" dialog when not trusted. */
export function hasAccessibilityAccess(prompt: boolean): boolean {
  if (process.platform !== "darwin") return true;
  return systemPreferences.isTrustedAccessibilityClient(prompt);
}

export function openAccessibilitySettings(): void {
  void shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  );
}

// uiohook-napi's start()/stop() lifecycle is unreliable — after a stop() the
// native CGEventTap doesn't reliably detach, so a "torn down" tap keeps firing.
// So the worker is started at most once per session and never stopped; the tap
// is instead gated behind `active`, flipped off when another trigger (a global
// shortcut combo) takes over.
let started = false;
let active = false;
let comboUsed = false;
let tapHandler: (() => void) | undefined;

function onKeyDown(event: UiohookKeyboardEvent): void {
  if (ALT_KEYS.has(event.keycode)) {
    comboUsed = false;
    return;
  }
  if (event.altKey) {
    comboUsed = true;
  }
}

function onKeyUp(event: UiohookKeyboardEvent): void {
  // Fires `tapHandler` when Option is pressed and released on its own — not as
  // part of a combo (Option+something) the user is actually using for its usual
  // purpose (special characters, other app shortcuts, etc).
  if (active && ALT_KEYS.has(event.keycode) && !comboUsed) {
    tapHandler?.();
  }
}

/** Makes a lone Option tap fire `onTap`. Starts the global key hook on first
 *  use and keeps it running; subsequent calls just re-point the handler. */
export function enableOptionTap(onTap: () => void): void {
  tapHandler = onTap;
  active = true;
  if (started) return;
  uIOhook.on("keydown", onKeyDown);
  uIOhook.on("keyup", onKeyUp);
  uIOhook.start();
  started = true;
}

/** Stops the Option tap from firing without tearing down the key hook. */
export function disableOptionTap(): void {
  active = false;
  tapHandler = undefined;
}
