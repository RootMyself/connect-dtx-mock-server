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

describe("connect-dtx phicode", () => {
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

  it("GET validate with code -> result_code 0", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const token = await issueToken(app);
      const res = await app.inject({
        method: "GET",
        url: "/legacy/phicode/validate?code=ABC&user_code=dGVzdA==&",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.statusCode, 200);
      assert.equal((res.json() as { result_code: string }).result_code, "0");
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("trailing & query still matches (PhiRestComm wire quirk)", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const token = await issueToken(app);
      const res = await app.inject({
        method: "GET",
        url: "/pauth/phicode/history?phi_code=PHI-1&",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { result_code: string; list: { phi_code: string }[] };
      assert.equal(body.result_code, "0");
      assert.equal(body.list[0]?.phi_code, "PHI-1");
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("POST dtx/info -> result_code 0", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const token = await issueToken(app);
      const res = await app.inject({
        method: "POST",
        url: "/pauth/dtx/info",
        headers: { authorization: `Bearer ${token}` },
        payload: { phi_code: "PHI-1", state: "start", step: "1", client_time: "1700000000" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal((res.json() as { result_code: string }).result_code, "0");
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("without Bearer -> 401", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const res = await app.inject({
        method: "GET",
        url: "/legacy/phicode/validate?code=ABC&",
      });
      assert.equal(res.statusCode, 401);
    } finally {
      await app.close();
      closeTestDb();
    }
  });
});
