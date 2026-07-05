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

/**
 * Fires `onTap` when Option is pressed and released on its own — not as part
 * of a combo (Option+something) the user is actually using for its usual
 * purpose (special characters, other app shortcuts, etc).
 */
export function listenForOptionTap(onTap: () => void): () => void {
  let comboUsed = false;

  const onKeyDown = (event: UiohookKeyboardEvent) => {
    if (ALT_KEYS.has(event.keycode)) {
      comboUsed = false;
      return;
    }
    if (event.altKey) {
      comboUsed = true;
    }
  };

  const onKeyUp = (event: UiohookKeyboardEvent) => {
    if (ALT_KEYS.has(event.keycode) && !comboUsed) {
      onTap();
    }
  };

  uIOhook.on("keydown", onKeyDown);
  uIOhook.on("keyup", onKeyUp);
  uIOhook.start();

  return () => {
    uIOhook.off("keydown", onKeyDown);
    uIOhook.off("keyup", onKeyUp);
    uIOhook.stop();
  };
}
