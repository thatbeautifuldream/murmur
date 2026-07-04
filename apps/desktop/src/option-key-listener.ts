import { GlobalKeyboardListener } from "node-global-key-listener";

const ALT_KEYS = new Set(["LEFT ALT", "RIGHT ALT"]);

/**
 * Fires `onTap` when Option is pressed and released on its own — not as part
 * of a combo (Option+something) the user is actually using for its usual
 * purpose (special characters, other app shortcuts, etc).
 */
export function listenForOptionTap(onTap: () => void): () => void {
  const listener = new GlobalKeyboardListener();
  let comboUsed = false;

  listener.addListener((event) => {
    if (ALT_KEYS.has(event.name ?? "")) {
      if (event.state === "DOWN") {
        comboUsed = false;
      } else if (event.state === "UP" && !comboUsed) {
        onTap();
      }
      return;
    }
    if (event.state === "DOWN") {
      comboUsed = true;
    }
  });

  return () => listener.kill();
}
