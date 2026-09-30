import { getDb } from "./db.ts";

export interface Client {
  clientId: string;
  clientSecret: string;
  zone: "normal" | "gov";
  createdAt: number;
  updatedAt: number;
}

interface ClientRow {
  client_id: string;
  client_secret: string;
  zone: string;
  created_at: number;
  updated_at: number;
}

export function createClient(
  clientId: string,
  clientSecret: string,
  zone: "normal" | "gov" = "normal",
  now?: number,
): Client | undefined {
  const ts = now ?? Date.now();
  const result = getDb()
    .prepare(
      "INSERT OR IGNORE INTO clients(client_id, client_secret, zone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(clientId, clientSecret, zone, ts, ts);
  if (Number(result.changes) === 0) {
    return undefined;
  }
  return findClient(clientId);
}

export function findClient(clientId: string): Client | undefined {
  const row = getDb()
    .prepare(
      "SELECT client_id, client_secret, zone, created_at, updated_at FROM clients WHERE client_id = ?",
    )
    .get(clientId) as ClientRow | undefined;
  if (row === undefined) return undefined;
  return {
    clientId: row.client_id,
    clientSecret: row.client_secret,
    zone: row.zone === "gov" ? "gov" : "normal",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listClients(): Client[] {
  const rows = getDb()
    .prepare(
      "SELECT client_id, client_secret, zone, created_at, updated_at FROM clients ORDER BY client_id",
    )
    .all() as unknown as ClientRow[];
  return rows.map((row) => ({
    clientId: row.client_id,
    clientSecret: row.client_secret,
    zone: (row.zone === "gov" ? "gov" : "normal") as "normal" | "gov",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function updateClientSecret(
  clientId: string,
  clientSecret: string,
  now?: number,
): Client | undefined {
  const ts = now ?? Date.now();
  const result = getDb()
    .prepare("UPDATE clients SET client_secret = ?, updated_at = ? WHERE client_id = ?")
    .run(clientSecret, ts, clientId);
  if (Number(result.changes) === 0) {
    return undefined;
  }
  return findClient(clientId);
}

export function deleteClient(clientId: string): boolean {
  const result = getDb().prepare("DELETE FROM clients WHERE client_id = ?").run(clientId);
  return Number(result.changes) !== 0;
}

export function validateClientCredentials(
  clientId: string,
  clientSecret: string,
): Client | undefined {
  // 로컬 목이므로 평문 비교 (nice-id-mock-server clients.ts와 동일 규칙).
  const found = findClient(clientId);
  if (found === undefined) {
    return undefined;
  }
  return found.clientSecret === clientSecret ? found : undefined;
}

// 첫 부팅 시 normal/gov 2개 시드. 마커 있으면 재시드 안 함.
export function seedDefaultClientsIfEmpty(
  normalId: string,
  normalSecret: string,
  govId: string,
  govSecret: string,
  now?: number,
): boolean {
  const marker = getDb().prepare("SELECT value FROM meta WHERE key = ?").get("seeded_at") as
    | { value: string }
    | undefined;
  if (marker !== undefined) {
    return false;
  }
  const ts = now ?? Date.now();
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO clients(client_id, client_secret, zone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(normalId, normalSecret, "normal", ts, ts);
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO clients(client_id, client_secret, zone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(govId, govSecret, "gov", ts, ts);
  getDb()
    .prepare("INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)")
    .run("seeded_at", String(ts));
  return true;
}
