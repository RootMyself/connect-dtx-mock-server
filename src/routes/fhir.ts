import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "../config.ts";
import { isRecord } from "../guards.ts";
import { findOrganization } from "../organizations.ts";
import { findPhiCode } from "../phicodes.ts";
import { findToken, getScenario, setScenario } from "../tokens.ts";

interface RouteOptions {
  config: Config;
}

// dtx-fhir golden의 phicode 식별자 자리표시자. 요청 phicode로 치환한다.
const PHICODE_PLACEHOLDER = "PHI-TEST-0001";

// DtxPrescriptionResourceBundleFactoryImple가 요구하는 최소 4종 + 선택 4종.
// voServiceRequest·voPatient·voOrganization·voPractitionerRole이 모두 있어야
// DtxService.getDtxPrescription이 NPE 없이 VO를 채운다.
const PRESCRIPTION_RESOURCES = [
  "read-servicerequest.json",
  "read-patient.json",
  "read-organization.json",
  "read-practitionerrole.json",
  "read-encounter.json",
  "read-condition.json",
  "read-medicationrequest.json",
  "read-observation.json",
] as const;

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const fixtureCache: Record<string, string> = {};
for (const name of PRESCRIPTION_RESOURCES) {
  fixtureCache[name] = readFileSync(join(fixtureDir, name), "utf8");
}

function bearerValid(request: FastifyRequest): boolean {
  const header = request.headers.authorization;
  if (header === undefined || !header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  if (token === "") return false;
  const found = findToken(token);
  return found !== undefined && Date.now() < found.expiresAt;
}

interface OrgOverride {
  oid: string;
  name: string;
  address: string;
  postal: string;
  phoneDigits: string;
}

function buildPrescriptionBundle(phicode: string, org?: OrgOverride): Record<string, unknown> {
  const entry = PRESCRIPTION_RESOURCES.map((name) => {
    const raw = fixtureCache[name] ?? "{}";
    const text = raw.replaceAll(PHICODE_PLACEHOLDER, phicode);
    if (org !== undefined && name === "read-organization.json") {
      const resource = JSON.parse(text) as Record<string, unknown>;
      resource["identifier"] = [{ system: "urn:ietf:rfc:3986", value: org.oid }];
      resource["name"] = org.name;
      resource["telecom"] = [{ system: "phone", value: org.phoneDigits, rank: 0 }];
      resource["address"] = [{ text: org.address, postalCode: org.postal }];
      return { resource };
    }
    const resource: Record<string, unknown> = JSON.parse(text);
    return { resource };
  });
  return {
    resourceType: "Bundle",
    type: "searchset",
    total: entry.length,
    entry,
  };
}

export default async function routes(app: FastifyInstance, opts: RouteOptions): Promise<void> {
  void opts;

  // PhiRestComm이 보내는 Content-Type "application/fhir+json; charset=UTF-8" 명시 수신.
  app.addContentTypeParser("application/fhir+json", { parseAs: "string" }, (_req, body, done) => {
    if (typeof body !== "string" || body === "") {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body));
    } catch {
      done(null, undefined);
    }
  });

  // GET /api/dtx/dtxprcp?phicode= → FHIR 처방 Bundle. 비-200은 그대로 throw됨.
  app.get("/api/dtx/dtxprcp", async (request, reply) => {
    if (!bearerValid(request)) {
      return reply.code(401).send({ result_code: "7", error_msg: "unauthorized" });
    }
    const forced = getScenario("dtxprcp");
    if (forced !== undefined) {
      const [http, code] = forced.split(":", 2);
      const status = Number(http);
      if (!Number.isInteger(status) || status !== 200) {
        return reply
          .code(Number.isInteger(status) ? status : 503)
          .send({ result_code: code ?? "1" });
      }
      if ((code ?? "0") !== "0") {
        return reply.code(200).send({ result_code: code });
      }
    }
    const query: unknown = request.query;
    const phicode =
      isRecord(query) && typeof query["phicode"] === "string" && query["phicode"] !== ""
        ? query["phicode"]
        : PHICODE_PLACEHOLDER;
    const row = findPhiCode(phicode);
    const org =
      row?.orgOid !== undefined && row.orgOid !== null ? findOrganization(row.orgOid) : undefined;
    return reply
      .code(200)
      .type("application/fhir+json")
      .send(buildPrescriptionBundle(phicode, org ?? undefined));
  });

  // POST /api/dtx/dtxresult?phicode= + transaction Bundle → {"result_code":"0"}.
  // 수신 본문은 디버깅용으로 last_dtxresult 시나리오에 보관한다.
  app.post("/api/dtx/dtxresult", async (request, reply) => {
    if (!bearerValid(request)) {
      return reply.code(401).send({ result_code: "7", error_msg: "unauthorized" });
    }
    const forced = getScenario("dtxresult");
    if (forced !== undefined) {
      const [http, code] = forced.split(":", 2);
      const status = Number(http);
      if (!Number.isInteger(status) || status !== 200) {
        return reply
          .code(Number.isInteger(status) ? status : 503)
          .send({ result_code: code ?? "1" });
      }
      return reply.code(200).send({ result_code: code ?? "0" });
    }
    const body: unknown = request.body;
    if (body === undefined || body === null) {
      return reply.code(400).send({ result_code: "400", error_msg: "empty body" });
    }
    setScenario("last_dtxresult", typeof body === "string" ? body : JSON.stringify(body));
    return reply.code(200).send({ result_code: "0", result_msg: "success" });
  });
}
