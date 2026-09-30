import { closeDb, initDb } from "../../src/db.ts";
import { seedDefaultOrganization } from "../../src/organizations.ts";
import { seedLegacyPhiCodes } from "../../src/phicodes.ts";

export function initTestDb(seed?: () => void): void {
  initDb(":memory:");
  const base = seedDefaultOrganization();
  seedLegacyPhiCodes(base.oid);
  if (seed) seed();
}

export function closeTestDb(): void {
  closeDb();
}
