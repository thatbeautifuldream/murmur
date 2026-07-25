import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { app } from "electron";
import { SPEECHD_PORT } from "@app/contracts";

const execFileAsync = promisify(execFile);

let child: ChildProcess | undefined;

/** Packaged: the binary is bundled as an extraResource (see
 *  electron-builder.config.cjs). Dev: built in place at native/speechd via
 *  `bun run native:build` — MURMUR_SPEECHD_PATH overrides both for testing
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

/** Finds any `murmur-speechd` process already listening on our port. Returns
 *  its PID, or null if the port is free or held by something we don't own.
 *
 *  Single-instance lock (main.ts) already guarantees we're the only Electron,
 *  so any murmur-speechd squatting here is either our own leak from a crashed
 *  previous session, or a stale binary from a parallel git worktree — the
 *  exact thing that silently broke interim/final transcripts by serving
 *  degraded recognition results to a fresh app. Something NOT named
 *  murmur-speechd on the port is some unrelated dev tool and is left alone. */
async function findMurmurSpeechdOnPort(port: number): Promise<number | null> {
  let pids: string[];
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-tiTCP:" + port,
      "-sTCP:LISTEN",
      "-P",
      "-n",
    ]);
    pids = stdout.trim().split("\n").filter(Boolean);
  } catch {
    return null; // lsof exits non-zero when nothing matches → port is free
  }
  for (const pidStr of pids) {
    const pid = Number(pidStr);
    if (!Number.isFinite(pid)) continue;
    try {
      const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "comm="]);
      // `ps -o comm=` returns the full executable path on macOS (e.g.
      // /Applications/Murmur.app/Contents/Resources/murmur-speechd/murmur-speechd),
      // so match on the basename — never the full string.
      if (path.basename(stdout.trim()) === "murmur-speechd") return pid;
    } catch {
      // process exited between lsof and ps — nothing to do.
    }
  }
  return null;
}

/** SIGTERMs any stale murmur-speechd squatting on our port and waits up to
 *  ~1s for it to release. Reusing a "healthy"-looking squatter is unsafe: it
 *  may be from an older build, or its SFSpeechRecognizer may have degraded
 *  over hours of uptime — both present as dictation silently producing no
 *  text. Killing + spawning fresh is the only state we can reason about. */
async function reclaimPortIfNeeded(): Promise<void> {
  const squatter = await findMurmurSpeechdOnPort(SPEECHD_PORT);
  if (!squatter) return;

  console.warn(
    `[speechd] stale murmur-speechd (PID ${squatter}) is still listening on port ${SPEECHD_PORT}; reclaiming.`,
  );
  try {
    process.kill(squatter, "SIGTERM");
  } catch {
    return; // already gone — port should be free momentarily
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!(await findMurmurSpeechdOnPort(SPEECHD_PORT))) return;
  }
  // If SIGTERM didn't take, give up — our own spawn will fail fast (Server.swift
  // exits 1 + the early-death log below points the user at the conflict).
  console.error(
    `[speechd] PID ${squatter} didn't release port ${SPEECHD_PORT} after SIGTERM.`,
  );
}

/** Spawns murmur-speechd as a child process so the app is self-contained —
 *  no separately-launched terminal needed. Failure is non-fatal: dictation
 *  just reports "murmur-speechd unreachable" (see dictation.ts) until it's
 *  built and the app is restarted. */
export async function startSpeechd(): Promise<void> {
  const binaryPath = resolveBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    console.error(
      `murmur-speechd not found at ${binaryPath}. Run "bun run native:build" (or "swift build" in the murmur-speechd repo) and restart.`,
    );
    return;
  }

  // Pre-flight before spawn: otherwise a stale squatter holds the port, our
  // new child fails to bind, and we're back to the silent "talking to a
  // zombie" failure mode. See reclaimPortIfNeeded above.
  await reclaimPortIfNeeded();

  child = spawn(binaryPath, [], { stdio: "pipe" });
  const startedAt = Date.now();
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[speechd] ${chunk}`));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[speechd] ${chunk}`));
  child.on("exit", (code, signal) => {
    child = undefined;
    const uptimeMs = Date.now() - startedAt;
    // A death within the first few seconds is almost always a port conflict
    // that reclaimPortIfNeeded couldn't resolve (a non-murmur process squatting
    // on 8722, or a SIGTERM that didn't take). Surface it loudly instead of
    // silently dropping `child` and leaving dictation forever "unreachable".
    if (uptimeMs < 3000) {
      console.error(
        `[speechd] exited after ${uptimeMs}ms (code ${code}, signal ${signal}). ` +
          `Port ${SPEECHD_PORT} is likely already in use — run \`lsof -nP -iTCP:${SPEECHD_PORT}\` and kill the squatter, then restart Murmur.`,
      );
    } else {
      console.log(`[speechd] exited (code ${code}, signal ${signal})`);
    }
  });
}

export function stopSpeechd(): void {
  child?.kill();
  child = undefined;
}
