import { app } from "electron";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// v0.0.2 renamed the app to "Murmur" (see main.ts), which moved Electron's
// userData directory from ~/Library/Application Support/@app/desktop/ to
// ~/Library/Application Support/Murmur/. Anything written there in v0.0.1 —
// the SQLite history DB, settings.json, and the recordings referenced by
// history rows — got orphaned by the rename. On the first run of v0.0.2 we
// copy the legacy files into the new location once, so an upgrade doesn't
// look like "history vanished" + "my shortcut reset".
const LEGACY_NAME = "@app/desktop";
const MIGRATION_MARKER = ".migrated-from-legacy";

// The SQLite DB is opened in WAL mode (transcript-history.ts), so its -wal
// and -shm sidecars must come along too or recent history rows will appear
// missing until the next checkpoint.
const LEGACY_FILES = ["murmur.sqlite", "murmur.sqlite-wal", "murmur.sqlite-shm", "settings.json"];
const LEGACY_DIRS = ["recordings"];

export function migrateLegacyUserData(): void {
  if (process.platform !== "darwin") return;

  const newDataPath = app.getPath("userData");
  const marker = join(newDataPath, MIGRATION_MARKER);
  if (existsSync(marker)) return;

  const legacyPath = join(app.getPath("appData"), LEGACY_NAME);
  if (!existsSync(legacyPath)) {
    writeFileSync(marker, String(Date.now()));
    return;
  }

  try {
    for (const file of LEGACY_FILES) {
      const src = join(legacyPath, file);
      const dest = join(newDataPath, file);
      if (existsSync(src) && !existsSync(dest)) copyFileSync(src, dest);
    }
    for (const dir of LEGACY_DIRS) {
      const src = join(legacyPath, dir);
      const dest = join(newDataPath, dir);
      if (existsSync(src) && !existsSync(dest)) copyDirRecursive(src, dest);
    }
  } catch (error) {
    // Leave the marker unwritten so a transient failure (e.g. a locked DB)
    // retries on the next launch instead of silently abandoning the data.
    console.error("[userdata-migration] failed:", error);
    return;
  }

  // Don't delete the legacy folder — it's cheap insurance for a rollback and
  // lets the user recover manually if anything else about v0.0.2 is wrong.
  writeFileSync(marker, String(Date.now()));
  console.log(`[userdata-migration] migrated ${legacyPath} -> ${newDataPath}`);
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}
