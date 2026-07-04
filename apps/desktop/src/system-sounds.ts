import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SYSTEM_SOUNDS_DIR = "/System/Library/Sounds";
const DICTATION_START_SOUND = "Tink.aiff";
const DICTATION_STOP_SOUND = "Pop.aiff";

function playSystemSound(fileName: string): void {
  if (process.platform !== "darwin") return;

  const filePath = join(SYSTEM_SOUNDS_DIR, fileName);
  if (!existsSync(filePath)) return;

  const child = spawn("afplay", [filePath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

export function playDictationStartSound(): void {
  playSystemSound(DICTATION_START_SOUND);
}

export function playDictationStopSound(): void {
  playSystemSound(DICTATION_STOP_SOUND);
}
