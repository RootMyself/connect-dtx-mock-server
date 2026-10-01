import { getDb } from "./db.ts";
import { isRecord } from "./guards.ts";

export type DtxResultKind = "daily" | "weekly" | "unknown";

// HAPI R4 인코딩 기준. 일일=Device+Observation, 주간=Device+DocumentReference.
// vo 필드가 Jackson NON_NULL으로 그대로 내려오므로 camelCase key로 읽는다
// (valueQuantity, effectivePeriod, contentType …).
export interface DtxComponentSummary {
  text: string;
  value: string;
  unit: string;
}

export interface DtxDailySummary {
  status?: string;
  periodStart?: string;
  periodEnd?: string;
  components: DtxComponentSummary[];
}

export interface DtxWeeklySummary {
  status?: string;
  typeCode?: string;
  typeDisplay?: string;
  date?: string;
  authorRef?: string;
  contentType?: string;
  dataSize?: number;
  periodStart?: string;
}

export interface DtxResultSummary {
  daily?: DtxDailySummary;
  weekly?: DtxWeeklySummary;
}

export interface DtxResultListItem {
  id: number;
  phi_code: string;
  kind: DtxResultKind;
  received_at: number;
  summary: DtxResultSummary;
}

export interface DtxResultDetail extends DtxResultListItem {
  // attachment.data는 크기 표기로 치환됨 — 원문 base64를 UI에 뿌리지 않는다.
  body: unknown;
}

interface DtxResultRow {
  id: number;
  phicode: string;
  kind: string;
  received_at: number;
  summary: string;
  body?: string;
}

const PHICODE_SYSTEM = "https://connectdtx.net/phicode";

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function child(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (record === undefined) return undefined;
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => isRecord(item));
}

// Bundle.entry[].resource 평탄화. HAPI R4는 entry에 fullUrl+resource+request를 함께 싣는다.
function bundleResources(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body)) return [];
  const out: Record<string, unknown>[] = [];
  for (const entry of recordArray(body["entry"])) {
    const resource = entry["resource"];
    if (isRecord(resource)) out.push(resource);
  }
  return out;
}

export function classifyDtxResultKind(body: unknown): DtxResultKind {
  const types = bundleResources(body).map((resource) => resource["resourceType"]);
  if (types.includes("Observation")) return "daily";
  if (types.includes("DocumentReference")) return "weekly";
  return "unknown";
}

// Device 식별자(system=https://connectdtx.net/phicode)에서 phicode 복원. 쿼리 없을 때 폴백.
export function extractPhicodeFromBundle(body: unknown): string {
  for (const resource of bundleResources(body)) {
    for (const identifier of recordArray(resource["identifier"])) {
      if (identifier["system"] !== PHICODE_SYSTEM) continue;
      const value = text(identifier["value"]);
      if (value !== undefined && value !== "") return value;
    }
  }
  return "";
}

function summarizeDaily(resource: Record<string, unknown>): DtxDailySummary {
  const period = child(resource, "effectivePeriod");
  const components: DtxComponentSummary[] = [];
  for (const component of recordArray(resource["component"])) {
    const code = child(component, "code");
    const quantity = child(component, "valueQuantity");
    components.push({
      text: text(code?.["text"]) ?? "",
      value:
        text(quantity?.["value"]) ??
        (typeof quantity?.["value"] === "number" ? String(quantity["value"]) : ""),
      unit: text(quantity?.["unit"]) ?? text(quantity?.["code"]) ?? "",
    });
  }
  const summary: DtxDailySummary = { components };
  const status = text(resource["status"]);
  if (status !== undefined) summary.status = status;
  const start = text(period?.["start"]);
  if (start !== undefined) summary.periodStart = start;
  const end = text(period?.["end"]);
  if (end !== undefined) summary.periodEnd = end;
  return summary;
}

function summarizeWeekly(resource: Record<string, unknown>): DtxWeeklySummary {
  const type = child(resource, "type");
  const coding = recordArray(type?.["coding"])[0];
  const attachment = child(child(resource, "content"), "attachment");
  const data = attachment?.["data"];
  const summary: DtxWeeklySummary = {};
  const status = text(resource["status"]);
  if (status !== undefined) summary.status = status;
  const typeCode = text(coding?.["code"]);
  if (typeCode !== undefined) summary.typeCode = typeCode;
  const typeDisplay = text(coding?.["display"]);
  if (typeDisplay !== undefined) summary.typeDisplay = typeDisplay;
  const date = text(resource["date"]);
  if (date !== undefined) summary.date = date;
  const authorRef = text(child(resource, "author")?.["reference"]);
  if (authorRef !== undefined) summary.authorRef = authorRef;
  const contentType = text(attachment?.["contentType"]);
  if (contentType !== undefined) summary.contentType = contentType;
  if (typeof data === "string") summary.dataSize = data.length;
  const periodStart = text(child(child(resource, "context"), "period")?.["start"]);
  if (periodStart !== undefined) summary.periodStart = periodStart;
  return summary;
}

export function summarizeDtxResult(body: unknown, kind: DtxResultKind): DtxResultSummary {
  const resources = bundleResources(body);
  if (kind === "daily") {
    const observation = resources.find((resource) => resource["resourceType"] === "Observation");
    if (observation !== undefined) return { daily: summarizeDaily(observation) };
    return { daily: { components: [] } };
  }
  if (kind === "weekly") {
    const documentReference = resources.find(
      (resource) => resource["resourceType"] === "DocumentReference",
    );
    if (documentReference !== undefined) return { weekly: summarizeWeekly(documentReference) };
    return { weekly: {} };
  }
  return {};
}

// attachment.data(base64 PDF, MB급 가능)는 목록에 싣지 않고 상세에서도 크기 표기로 치환한다.
export function stripAttachmentData(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const entries = Array.isArray(body["entry"]) ? body["entry"] : undefined;
  if (entries === undefined) return body;
  return {
    ...body,
    entry: entries.map((entry) => {
      if (!isRecord(entry) || !isRecord(entry["resource"])) return entry;
      const resource = entry["resource"];
      if (resource["resourceType"] !== "DocumentReference") return entry;
      const content = isRecord(resource["content"]) ? resource["content"] : undefined;
      const attachment = isRecord(content?.["attachment"]) ? content["attachment"] : undefined;
      if (typeof attachment?.["data"] !== "string") return entry;
      return {
        ...entry,
        resource: {
          ...resource,
          content: {
            ...content,
            attachment: {
              ...attachment,
              data: `<omitted base64 ${attachment["data"].length} chars>`,
            },
          },
        },
      };
    }),
  };
}

function parseSummary(raw: string): DtxResultSummary {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as DtxResultSummary) : {};
  } catch {
    return {};
  }
}

export function saveDtxResult(
  phicode: string,
  kind: DtxResultKind,
  summary: DtxResultSummary,
  bodyText: string,
  now?: number,
): number {
  const result = getDb()
    .prepare(
      "INSERT INTO dtx_results(phicode, kind, received_at, summary, body) VALUES (?, ?, ?, ?, ?)",
    )
    .run(phicode, kind, now ?? Date.now(), JSON.stringify(summary), bodyText) as unknown as {
    lastInsertRowid: number | bigint;
  };
  return Number(result.lastInsertRowid);
}

export function listDtxResults(kind?: DtxResultKind, limit = 100): DtxResultListItem[] {
  const rows = (kind === undefined
    ? getDb()
        .prepare(
          "SELECT id, phicode, kind, received_at, summary FROM dtx_results ORDER BY id DESC LIMIT ?",
        )
        .all(limit)
    : getDb()
        .prepare(
          "SELECT id, phicode, kind, received_at, summary FROM dtx_results WHERE kind = ? ORDER BY id DESC LIMIT ?",
        )
        .all(kind, limit)) as unknown as DtxResultRow[];
  return rows.map((row) => ({
    id: row.id,
    phi_code: row.phicode,
    kind: (row.kind === "daily" || row.kind === "weekly" ? row.kind : "unknown") as DtxResultKind,
    received_at: row.received_at,
    summary: parseSummary(row.summary),
  }));
}

export function getDtxResult(id: number): DtxResultDetail | undefined {
  const row = getDb()
    .prepare("SELECT id, phicode, kind, received_at, summary, body FROM dtx_results WHERE id = ?")
    .get(id) as unknown as DtxResultRow | undefined;
  if (row === undefined) return undefined;
  let body: unknown = row.body ?? "";
  try {
    body = JSON.parse(row.body ?? "") as unknown;
  } catch {
    // 저장된 그대로 문자열로 반환
  }
  return {
    id: row.id,
    phi_code: row.phicode,
    kind: (row.kind === "daily" || row.kind === "weekly" ? row.kind : "unknown") as DtxResultKind,
    received_at: row.received_at,
    summary: parseSummary(row.summary),
    body: stripAttachmentData(body),
  };
}
