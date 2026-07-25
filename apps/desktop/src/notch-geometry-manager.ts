import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";

const execFileAsync = promisify(execFile);

export interface NotchGeometry {
  hasNotch: boolean;
  screenWidth: number;
  screenHeight: number;
  notchX: number;
  notchWidth: number;
  notchHeight: number;
}

/** Packaged: the binary is bundled as an extraResource (see
 *  electron-builder.config.cjs). Dev: built in place at native/notch-geometry
 *  via `bun run native:build` — MURMUR_NOTCH_GEOMETRY_PATH overrides both for
 *  testing against a different build. */
function resolveBinaryPath(): string {
  if (process.env.MURMUR_NOTCH_GEOMETRY_PATH) return process.env.MURMUR_NOTCH_GEOMETRY_PATH;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "murmur-notch-geometry", "murmur-notch-geometry");
  }
  // apps/desktop/dist-electron -> apps/desktop -> apps -> murmur (repo root)
  return path.join(
    __dirname,
    "..",
    "..",
    "..",
    "native",
    "notch-geometry",
    ".build",
    "debug",
    "murmur-notch-geometry",
  );
}

let cached: NotchGeometry | undefined;

/** Electron's `screen` module has no notch/safe-area API, so exact notch
 *  geometry comes from a native one-shot helper (`NSScreen.safeAreaInsets`/
 *  `auxiliaryTopLeftArea`/`auxiliaryTopRightArea`), re-run whenever the
 *  display configuration changes. Caches the result (see
 *  `getCachedNotchGeometry`) so the pill's sync window-bounds math and the
 *  `WINDOW_GET_NOTCH_MODE` IPC handler don't need to await a subprocess.
 *  Resolves to undefined on any failure — missing binary, bad JSON — so
 *  callers always have a defined non-notch fallback available. */
export async function refreshNotchGeometry(): Promise<NotchGeometry | undefined> {
  const binaryPath = resolveBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    console.error(
      `murmur-notch-geometry not found at ${binaryPath}. Run "bun run native:build" and restart.`,
    );
    cached = undefined;
    return cached;
  }

  try {
    const { stdout } = await execFileAsync(binaryPath);
    cached = JSON.parse(stdout) as NotchGeometry;
  } catch (error) {
    console.error("murmur-notch-geometry failed:", error);
    cached = undefined;
  }
  return cached;
}

export function getCachedNotchGeometry(): NotchGeometry | undefined {
  return cached;
}
