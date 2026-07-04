import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";

let child: ChildProcess | undefined;

/** Packaged: the binary is bundled as an extraResource (see
 *  electron-builder.config.cjs). Dev: built in place at native/speechd via
 *  `bun run speechd:build` — MURMUR_SPEECHD_PATH overrides both for testing
 *  against a different build. */
function resolveBinaryPath(): string {
  if (process.env.MURMUR_SPEECHD_PATH) return process.env.MURMUR_SPEECHD_PATH;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "murmur-speechd", "murmur-speechd");
  }
  // apps/desktop/dist-electron -> apps/desktop -> apps -> murmur (repo root)
  return path.join(
    __dirname,
    "..",
    "..",
    "..",
    "native",
    "speechd",
    ".build",
    "debug",
    "murmur-speechd",
  );
}

/** Spawns murmur-speechd as a child process so the app is self-contained —
 *  no separately-launched terminal needed. Failure is non-fatal: dictation
 *  just reports "murmur-speechd unreachable" (see dictation.ts) until it's
 *  built and the app is restarted. */
export function startSpeechd(): void {
  const binaryPath = resolveBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    console.error(
      `murmur-speechd not found at ${binaryPath}. Run "bun run speechd:build" (or "swift build" in the murmur-speechd repo) and restart.`,
    );
    return;
  }

  child = spawn(binaryPath, [], { stdio: "pipe" });
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[speechd] ${chunk}`));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[speechd] ${chunk}`));
  child.on("exit", (code) => {
    console.log(`murmur-speechd exited (code ${code})`);
    child = undefined;
  });
}

export function stopSpeechd(): void {
  child?.kill();
  child = undefined;
}
