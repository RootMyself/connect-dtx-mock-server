import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import { seedDefaultClientsIfEmpty } from "../src/clients.ts";
import { closeTestDb, initTestDb } from "./helpers/testDb.ts";

const TOKEN_PATH = "/oauth2/token";

function tokenBody(
  clientId = "test-client-id",
  clientSecret = "test-client-secret",
): Record<string, string> {
  return { grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret };
}

async function issueToken(
  app: FastifyInstance,
  clientId = "test-client-id",
  clientSecret = "test-client-secret",
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: TOKEN_PATH,
    payload: tokenBody(clientId, clientSecret),
  });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { access_token: string };
  assert.equal(typeof body.access_token, "string");
  return body.access_token;
}

describe("connect-dtx OAuth", () => {
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

  it("POST /oauth2/token returns access_token", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const res = await app.inject({ method: "POST", url: TOKEN_PATH, payload: tokenBody() });
      assert.equal(res.statusCode, 200);
      assert.equal(typeof (res.json() as { access_token: string }).access_token, "string");
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("wrong secret -> 401 result_code 7", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const res = await app.inject({
        method: "POST",
        url: TOKEN_PATH,
        payload: tokenBody("test-client-id", "wrong"),
      });
      assert.equal(res.statusCode, 401);
      assert.equal((res.json() as { result_code: string }).result_code, "7");
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("GET validate with Bearer -> result_code 0", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const token = await issueToken(app);
      const res = await app.inject({
        method: "GET",
        url: "/oauth2/token?grant_type=validate&",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.statusCode, 200);
      assert.equal((res.json() as { result_code: string }).result_code, "0");
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("GET validate without Bearer -> result_code 7", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const res = await app.inject({ method: "GET", url: "/oauth2/token?grant_type=validate&" });
      assert.equal(res.statusCode, 200);
      assert.equal((res.json() as { result_code: string }).result_code, "7");
    } finally {
      await app.close();
      closeTestDb();
    }
  });
});
