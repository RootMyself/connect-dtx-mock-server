import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

let db: DatabaseSync | null = null;
let closed = true;

const NOT_INITIALIZED = "DB not initialized: call initDb first";

export function initDb(path: string): void {
  closeDb();
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");
  if (path !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL");
  }
  db.exec(
    "CREATE TABLE IF NOT EXISTS clients(client_id TEXT PRIMARY KEY, client_secret TEXT NOT NULL, zone TEXT NOT NULL DEFAULT 'normal', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS tokens(access_token TEXT PRIMARY KEY, client_id TEXT NOT NULL, zone TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)",
  );
  db.exec("CREATE TABLE IF NOT EXISTS scenarios(key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  closed = false;
}

export function getDb(): DatabaseSync {
  if (db === null || closed) {
    throw new Error(NOT_INITIALIZED);
  }
  return db;
}

export function closeDb(): void {
  if (db !== null && !closed) {
    db.close();
  }
  closed = true;
}
