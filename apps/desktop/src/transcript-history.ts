import { app, BrowserWindow } from "electron";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { IpcChannels, type TranscriptHistoryEntry } from "@app/contracts";

const AUDIO_MIME_TYPES: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  webm: "audio/webm",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  caf: "audio/x-caf",
};

interface SaveTranscriptHistoryInput {
  text: string;
  locale: string;
  sourceAppName?: string | null;
  sourceAppBundleId?: string | null;
  sourceProcessId?: number | null;
  durationMs?: number | null;
  audioPath?: string | null;
  audioFormat?: string | null;
  audioByteSize?: number | null;
  inserted: boolean;
}

interface TranscriptHistoryRow {
  id: string;
  text: string;
  locale: string;
  source_app_name: string | null;
  source_app_bundle_id: string | null;
  source_process_id: number | null;
  duration_ms: number | null;
  audio_path: string | null;
  audio_format: string | null;
  audio_byte_size: number | null;
  inserted: 0 | 1;
  created_at: string;
}

let database: DatabaseSync | undefined;

function getDatabase(): DatabaseSync {
  if (database) return database;

  const databasePath = join(app.getPath("userData"), "murmur.sqlite");
  mkdirSync(dirname(databasePath), { recursive: true });

  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS transcript_history (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      locale TEXT NOT NULL,
      source_app_name TEXT,
      source_app_bundle_id TEXT,
      source_process_id INTEGER,
      duration_ms INTEGER,
      audio_path TEXT,
      audio_format TEXT,
      audio_byte_size INTEGER,
      inserted INTEGER NOT NULL DEFAULT 0 CHECK (inserted IN (0, 1)),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_transcript_history_created_at
      ON transcript_history(created_at DESC);
  `);
  migrateTranscriptHistory(database);

  return database;
}

function migrateTranscriptHistory(db: DatabaseSync): void {
  const columns = new Set(
    (db.prepare("PRAGMA table_info(transcript_history)").all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

  if (!columns.has("audio_path")) {
    db.exec("ALTER TABLE transcript_history ADD COLUMN audio_path TEXT");
  }
  if (!columns.has("audio_format")) {
    db.exec("ALTER TABLE transcript_history ADD COLUMN audio_format TEXT");
  }
  if (!columns.has("audio_byte_size")) {
    db.exec("ALTER TABLE transcript_history ADD COLUMN audio_byte_size INTEGER");
  }
}

function mapRow(row: TranscriptHistoryRow): TranscriptHistoryEntry {
  return {
    id: row.id,
    text: row.text,
    locale: row.locale,
    sourceAppName: row.source_app_name,
    sourceAppBundleId: row.source_app_bundle_id,
    sourceProcessId: row.source_process_id,
    durationMs: row.duration_ms,
    audioPath: row.audio_path,
    audioFormat: row.audio_format,
    audioByteSize: row.audio_byte_size,
    inserted: row.inserted === 1,
    createdAt: row.created_at,
  };
}

function broadcastHistoryChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IpcChannels.ON_TRANSCRIPT_HISTORY_CHANGED);
  }
}

export function saveTranscriptHistory(
  input: SaveTranscriptHistoryInput,
): TranscriptHistoryEntry {
  const entry: TranscriptHistoryEntry = {
    id: randomUUID(),
    text: input.text,
    locale: input.locale,
    sourceAppName: input.sourceAppName ?? null,
    sourceAppBundleId: input.sourceAppBundleId ?? null,
    sourceProcessId: input.sourceProcessId ?? null,
    durationMs: input.durationMs ?? null,
    audioPath: input.audioPath ?? null,
    audioFormat: input.audioFormat ?? null,
    audioByteSize: input.audioByteSize ?? null,
    inserted: input.inserted,
    createdAt: new Date().toISOString(),
  };

  getDatabase()
    .prepare(
      `INSERT INTO transcript_history (
        id,
        text,
        locale,
        source_app_name,
        source_app_bundle_id,
        source_process_id,
        duration_ms,
        audio_path,
        audio_format,
        audio_byte_size,
        inserted,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.id,
      entry.text,
      entry.locale,
      entry.sourceAppName,
      entry.sourceAppBundleId,
      entry.sourceProcessId,
      entry.durationMs,
      entry.audioPath,
      entry.audioFormat,
      entry.audioByteSize,
      entry.inserted ? 1 : 0,
      entry.createdAt,
    );

  broadcastHistoryChanged();
  return entry;
}

export function listTranscriptHistory(limit = 100): TranscriptHistoryEntry[] {
  const boundedLimit = Math.max(1, Math.min(limit, 500));
  const rows = getDatabase()
    .prepare(
      `SELECT
        id,
        text,
        locale,
        source_app_name,
        source_app_bundle_id,
        source_process_id,
        duration_ms,
        audio_path,
        audio_format,
        audio_byte_size,
        inserted,
        created_at
      FROM transcript_history
      ORDER BY created_at DESC
      LIMIT ?`,
    )
    .all(boundedLimit) as unknown as TranscriptHistoryRow[];

  return rows.map(mapRow);
}

export function restoreTranscriptHistoryEntries(entries: TranscriptHistoryEntry[]): void {
  const statement = getDatabase().prepare(
    `INSERT OR REPLACE INTO transcript_history (
      id,
      text,
      locale,
      source_app_name,
      source_app_bundle_id,
      source_process_id,
      duration_ms,
      audio_path,
      audio_format,
      audio_byte_size,
      inserted,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const entry of entries) {
    statement.run(
      entry.id,
      entry.text,
      entry.locale,
      entry.sourceAppName,
      entry.sourceAppBundleId,
      entry.sourceProcessId,
      entry.durationMs,
      entry.audioPath,
      entry.audioFormat,
      entry.audioByteSize,
      entry.inserted ? 1 : 0,
      entry.createdAt,
    );
  }

  broadcastHistoryChanged();
}

export function deleteTranscriptHistoryEntry(id: string): TranscriptHistoryEntry | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT
        id,
        text,
        locale,
        source_app_name,
        source_app_bundle_id,
        source_process_id,
        duration_ms,
        audio_path,
        audio_format,
        audio_byte_size,
        inserted,
        created_at
      FROM transcript_history
      WHERE id = ?`,
    )
    .get(id) as TranscriptHistoryRow | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM transcript_history WHERE id = ?").run(id);
  broadcastHistoryChanged();
  return mapRow(row);
}

export function clearTranscriptHistory(): TranscriptHistoryEntry[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT
        id,
        text,
        locale,
        source_app_name,
        source_app_bundle_id,
        source_process_id,
        duration_ms,
        audio_path,
        audio_format,
        audio_byte_size,
        inserted,
        created_at
      FROM transcript_history`,
    )
    .all() as unknown as TranscriptHistoryRow[];
  db.exec("DELETE FROM transcript_history");
  broadcastHistoryChanged();
  return rows.map(mapRow);
}

export function getTranscriptAudioFile(id: string): { bytes: Buffer; mimeType: string } | null {
  const row = getDatabase()
    .prepare("SELECT audio_path, audio_format FROM transcript_history WHERE id = ?")
    .get(id) as { audio_path: string | null; audio_format: string | null } | undefined;

  if (!row?.audio_path) return null;

  try {
    const bytes = readFileSync(row.audio_path);
    const mimeType = AUDIO_MIME_TYPES[row.audio_format ?? ""] ?? "audio/wav";
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

export function readTranscriptAudio(id: string): string | null {
  const file = getTranscriptAudioFile(id);
  if (!file) return null;
  return `data:${file.mimeType};base64,${file.bytes.toString("base64")}`;
}

function deleteAudioFile(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    unlinkSync(filePath);
  } catch {
    // History deletion should not fail if the recording was already removed.
  }
}

export function closeTranscriptHistoryStore(): void {
  database?.close();
  database = undefined;
}
