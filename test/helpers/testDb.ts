import { closeDb, initDb } from "../../src/db.ts";

export function initTestDb(seed?: () => void): void {
  initDb(":memory:");
  if (seed) seed();
}

export function closeTestDb(): void {
  closeDb();
}
