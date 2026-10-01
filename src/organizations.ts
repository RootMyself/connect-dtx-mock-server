import { createHash } from "node:crypto";
import { getDb } from "./db.ts";

export const OID_PREFIX = "urn:oid:1.2.410.100110.10.";
export const BASE_SEQ = 11100443;

export type OrgZone = "normal" | "gov";

// EMR 처방 폼 zone 쿼리값. dtx-fhir isGovernmentZone 판정(.gov. 포함)과 일치한다.
export const ZONE_HOSTS: Record<OrgZone, string> = {
  normal: "test-api.janusync.com",
  gov: "test-api.gov.janusync.com",
};

export interface Organization {
  oid: string;
  seq: number;
  zone: OrgZone;
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
  zone: OrgZone;
}

interface OrganizationRow {
  oid: string;
  seq: number;
  zone: string | null;
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
    zone: row.zone === "gov" ? "gov" : "normal",
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

export function normalizeOrgZone(value: unknown): OrgZone {
  if (value === true) return "gov";
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "gov" || v === "true" || v === "1") return "gov";
  }
  return "normal";
}

export function fingerprintOrg(input: OrganizationInput): string {
  return createHash("sha256")
    .update(
      `${input.name}|${input.address}|${input.postal}|${input.phoneDigits}|${input.zone}`,
      "utf8",
    )
    .digest("hex");
}

// zone 도입 전(4종) 지문 — 기존 DB 행 승계용.
export function legacyFingerprintOrg(input: Omit<OrganizationInput, "zone">): string {
  return createHash("sha256")
    .update(`${input.name}|${input.address}|${input.postal}|${input.phoneDigits}`, "utf8")
    .digest("hex");
}

// 4종+zone 완전일치 → 기존 OID 재사용, 아니면 순차 발번. seq는 MAX+1 (동시성은 단일 프로세스 전제).
export function findOrCreateOrganization(input: OrganizationInput, now?: number): Organization {
  const ts = now ?? Date.now();
  const fingerprint = fingerprintOrg(input);
  const db = getDb();
  const columns = "oid, seq, zone, name, address, postal, phone_digits, fingerprint, created_at";
  const existing = db
    .prepare(`SELECT ${columns} FROM organizations WHERE fingerprint = ?`)
    .get(fingerprint) as unknown as OrganizationRow | undefined;
  if (existing !== undefined) return mapRow(existing);
  if (input.zone === "normal") {
    const healed = healLegacyRow(columns, input, fingerprint);
    if (healed !== undefined) return healed;
  }
  const maxRow = db.prepare("SELECT MAX(seq) AS max_seq FROM organizations").get() as unknown as
    | { max_seq: number | null }
    | undefined;
  const seq = Math.max(maxRow?.max_seq ?? BASE_SEQ - 1, BASE_SEQ - 1) + 1;
  const oid = `${OID_PREFIX}${seq}`;
  db.prepare(
    "INSERT INTO organizations(oid, seq, zone, name, address, postal, phone_digits, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    oid,
    seq,
    input.zone,
    input.name,
    input.address,
    input.postal,
    input.phoneDigits,
    fingerprint,
    ts,
  );
  const created = db
    .prepare(`SELECT ${columns} FROM organizations WHERE oid = ?`)
    .get(oid) as unknown as OrganizationRow;
  return mapRow(created);
}

// zone 도입 전 행(4종 지문, zone 비어 있음) 승계: normal 요청이면 현 지문으로 갱신 후 재사용.
function healLegacyRow(
  columns: string,
  input: OrganizationInput,
  fingerprint: string,
): Organization | undefined {
  const db = getDb();
  const legacy = db
    .prepare(`SELECT ${columns} FROM organizations WHERE fingerprint = ?`)
    .get(legacyFingerprintOrg(input)) as unknown as OrganizationRow | undefined;
  if (legacy === undefined || legacy.zone === "gov") return undefined;
  db.prepare("UPDATE organizations SET fingerprint = ?, zone = ? WHERE oid = ?").run(
    fingerprint,
    "normal",
    legacy.oid,
  );
  const adopted = db
    .prepare(`SELECT ${columns} FROM organizations WHERE oid = ?`)
    .get(legacy.oid) as unknown as OrganizationRow;
  return mapRow(adopted);
}

export function seedDefaultOrganization(now?: number): Organization {
  return findOrCreateOrganization(
    {
      name: "테스트병원",
      address: "서울특별시 테스트구",
      postal: "00000",
      phoneDigits: "0200000000",
      zone: "normal",
    },
    now,
  );
}

export function findOrganization(oid: string): Organization | undefined {
  const row = getDb()
    .prepare(
      "SELECT oid, seq, zone, name, address, postal, phone_digits, fingerprint, created_at FROM organizations WHERE oid = ?",
    )
    .get(oid) as unknown as OrganizationRow | undefined;
  return row === undefined ? undefined : mapRow(row);
}

export function listOrganizations(): Organization[] {
  const rows = getDb()
    .prepare(
      "SELECT oid, seq, zone, name, address, postal, phone_digits, fingerprint, created_at FROM organizations ORDER BY seq",
    )
    .all() as unknown as OrganizationRow[];
  return rows.map(mapRow);
}
