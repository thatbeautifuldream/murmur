import { uIOhook, UiohookKey, type UiohookKeyboardEvent } from "uiohook-napi";

const ALT_KEYS = new Set<number>([UiohookKey.Alt, UiohookKey.AltRight]);

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
