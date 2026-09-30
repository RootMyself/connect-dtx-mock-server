import { createHash } from "node:crypto";
import { getDb } from "./db.ts";

export const OID_PREFIX = "urn:oid:1.2.410.100110.10.";
export const BASE_SEQ = 11100443;

export interface Organization {
  oid: string;
  seq: number;
  name: string;
  address: string;
  postal: string;
  phoneDigits: string;
  createdAt: number;
}

export interface OrganizationInput {
  name: string;
  address: string;
  postal: string;
  phoneDigits: string;
}

interface OrganizationRow {
  oid: string;
  seq: number;
  name: string;
  address: string;
  postal: string;
  phone_digits: string;
  fingerprint: string;
  created_at: number;
}

function mapRow(row: OrganizationRow): Organization {
  return {
    oid: row.oid,
    seq: row.seq,
    name: row.name,
    address: row.address,
    postal: row.postal,
    phoneDigits: row.phone_digits,
    createdAt: row.created_at,
  };
}

export function normalizeOrgName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return name.length >= 1 && name.length <= 64 ? name : undefined;
}

export function normalizeOrgAddress(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const address = value.trim();
  return address.length >= 1 && address.length <= 128 ? address : undefined;
}

export function normalizeOrgPostal(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const postal = value.trim();
  return /^[0-9]{5}$/.test(postal) ? postal : undefined;
}

export function normalizeOrgPhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const digits = value.replace(/\D/g, "");
  return /^0[0-9]{8,10}$/.test(digits) ? digits : undefined;
}

export function fingerprintOrg(input: OrganizationInput): string {
  return createHash("sha256")
    .update(`${input.name}|${input.address}|${input.postal}|${input.phoneDigits}`, "utf8")
    .digest("hex");
}

// 4종 완전일치 → 기존 OID 재사용, 아니면 순차 발번. seq는 MAX+1 (동시성은 단일 프로세스 전제).
export function findOrCreateOrganization(input: OrganizationInput, now?: number): Organization {
  const ts = now ?? Date.now();
  const fingerprint = fingerprintOrg(input);
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT oid, seq, name, address, postal, phone_digits, fingerprint, created_at FROM organizations WHERE fingerprint = ?",
    )
    .get(fingerprint) as unknown as OrganizationRow | undefined;
  if (existing !== undefined) return mapRow(existing);
  const maxRow = db.prepare("SELECT MAX(seq) AS max_seq FROM organizations").get() as unknown as
    | { max_seq: number | null }
    | undefined;
  const seq = Math.max(maxRow?.max_seq ?? BASE_SEQ - 1, BASE_SEQ - 1) + 1;
  const oid = `${OID_PREFIX}${seq}`;
  db.prepare(
    "INSERT INTO organizations(oid, seq, name, address, postal, phone_digits, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(oid, seq, input.name, input.address, input.postal, input.phoneDigits, fingerprint, ts);
  const created = db
    .prepare(
      "SELECT oid, seq, name, address, postal, phone_digits, fingerprint, created_at FROM organizations WHERE oid = ?",
    )
    .get(oid) as unknown as OrganizationRow;
  return mapRow(created);
}

export function seedDefaultOrganization(now?: number): Organization {
  return findOrCreateOrganization(
    {
      name: "테스트병원",
      address: "서울특별시 테스트구",
      postal: "00000",
      phoneDigits: "0200000000",
    },
    now,
  );
}

export function findOrganization(oid: string): Organization | undefined {
  const row = getDb()
    .prepare(
      "SELECT oid, seq, name, address, postal, phone_digits, fingerprint, created_at FROM organizations WHERE oid = ?",
    )
    .get(oid) as unknown as OrganizationRow | undefined;
  return row === undefined ? undefined : mapRow(row);
}

export function listOrganizations(): Organization[] {
  const rows = getDb()
    .prepare(
      "SELECT oid, seq, name, address, postal, phone_digits, fingerprint, created_at FROM organizations ORDER BY seq",
    )
    .all() as unknown as OrganizationRow[];
  return rows.map(mapRow);
}
