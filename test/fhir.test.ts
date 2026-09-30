import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { seedDefaultClientsIfEmpty } from "../src/clients.ts";
import { closeTestDb, initTestDb } from "./helpers/testDb.ts";

async function issueToken(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/oauth2/token",
    payload: {
      grant_type: "client_credentials",
      client_id: "test-client-id",
      client_secret: "test-client-secret",
    },
  });
  assert.equal(res.statusCode, 200);
  return (res.json() as { access_token: string }).access_token;
}

describe("connect-dtx FHIR", () => {
  beforeEach(() => {
    initTestDb(() =>
      seedDefaultClientsIfEmpty(
        "test-client-id",
        "test-client-secret",
        "test-gov-client-id",
        "test-gov-client-secret",
      ),
    );
  });

  it("GET dtxprcp returns Bundle with 8 entries and requested phicode", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const token = await issueToken(app);
      const res = await app.inject({
        method: "GET",
        url: "/api/dtx/dtxprcp?phicode=PHI-9&",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/fhir+json",
        },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as {
        resourceType: string;
        entry: {
          resource: {
            resourceType: string;
            identifier?: { system: string; value: string }[];
          };
        }[];
      };
      assert.equal(body.resourceType, "Bundle");
      assert.equal(body.entry.length, 8);
      const types = body.entry.map((e) => e.resource.resourceType);
      for (const required of ["ServiceRequest", "Patient", "Organization", "PractitionerRole"]) {
        assert.ok(types.includes(required), `missing ${required}`);
      }
      const patient = body.entry.find((e) => e.resource.resourceType === "Patient");
      assert.equal(patient?.resource.identifier?.[0]?.value, "PHI-9");
      const org = body.entry.find((e) => e.resource.resourceType === "Organization");
      assert.equal(org?.resource.identifier?.[0]?.system, "urn:ietf:rfc:3986");
      assert.equal(org?.resource.identifier?.[0]?.value, "urn:oid:1.2.410.100110.10.11100443");
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("POST dtxresult stores body and returns result_code 0", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const token = await issueToken(app);
      const bundle = { resourceType: "Bundle", type: "transaction", entry: [] };
      const post = await app.inject({
        method: "POST",
        url: "/api/dtx/dtxresult?phicode=PHI-9",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/fhir+json",
        },
        payload: JSON.stringify(bundle),
      });
      assert.equal(post.statusCode, 200);
      assert.equal((post.json() as { result_code: string }).result_code, "0");
      const scenarios = await app.inject({ method: "GET", url: "/admin/scenarios" });
      const stored = (scenarios.json() as { scenarios: Record<string, string> }).scenarios[
        "last_dtxresult"
      ];
      assert.ok(stored?.includes("transaction"));
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("scenario dtxprcp=503:1 forces 503 (DtxService 503 path)", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const token = await issueToken(app);
      await app.inject({
        method: "PUT",
        url: "/admin/scenarios",
        payload: { key: "dtxprcp", value: "503:1" },
      });
      const res = await app.inject({
        method: "GET",
        url: "/api/dtx/dtxprcp?phicode=PHI-9&",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.statusCode, 503);
    } finally {
      await app.close();
      closeTestDb();
    }
  });
});
