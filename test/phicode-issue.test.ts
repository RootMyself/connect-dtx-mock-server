import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

function seed(): void {
  seedDefaultClientsIfEmpty(
    "test-client-id",
    "test-client-secret",
    "test-gov-client-id",
    "test-gov-client-secret",
  );
}

describe("connect-dtx phicode issue", () => {
  it("이름+번호 → 201 phi_code, validate 0", async () => {
    initTestDb(seed);
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const issued = await app.inject({
        method: "POST",
        url: "/admin/phicodes/issue",
        payload: {
          name: "홍길동",
          phone: "010-1234-5678",
          hospitalName: "서울테스트병원",
          hospitalAddress: "서울특별시 강남구 테스트로 1",
          hospitalPostal: "06000",
          hospitalPhone: "02-1234-5678",
        },
      });
      assert.equal(issued.statusCode, 201);
      const phiCode = (issued.json() as { phi_code: string }).phi_code;
      assert.match(phiCode, /^[A-Za-z0-9_-]{43}$/);

      const token = await issueToken(app);
      const validated = await app.inject({
        method: "GET",
        url: `/legacy/phicode/validate?code=${phiCode}&user_code=${Buffer.from("홍길동/01012345678", "utf8").toString("base64url")}&`,
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal((validated.json() as { result_code: string }).result_code, "0");
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("하이픈 번호 정규화, 같은 사람도 매번 새 코드", async () => {
    initTestDb(seed);
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const hospital = {
        hospitalName: "서울테스트병원",
        hospitalAddress: "서울특별시 강남구 테스트로 1",
        hospitalPostal: "06000",
        hospitalPhone: "02-1234-5678",
      };
      const first = await app.inject({
        method: "POST",
        url: "/admin/phicodes/issue",
        payload: { name: "홍길동", phone: "010-1234-5678", ...hospital },
      });
      const second = await app.inject({
        method: "POST",
        url: "/admin/phicodes/issue",
        payload: { name: "홍길동", phone: "01012345678", ...hospital },
      });
      assert.equal(first.statusCode, 201);
      assert.equal(second.statusCode, 201);
      assert.notEqual(
        (first.json() as { phi_code: string }).phi_code,
        (second.json() as { phi_code: string }).phi_code,
      );
    } finally {
      await app.close();
      closeTestDb();
    }
  });

  it("잘못된 입력 400, 미발급 코드 validate 1", async () => {
    initTestDb(seed);
    const app = buildApp({ dbPath: ":memory:" });
    try {
      const hospital = {
        hospitalName: "서울테스트병원",
        hospitalAddress: "서울특별시 강남구 테스트로 1",
        hospitalPostal: "06000",
        hospitalPhone: "02-1234-5678",
      };
      const badPhone = await app.inject({
        method: "POST",
        url: "/admin/phicodes/issue",
        payload: { name: "홍길동", phone: "02-1234", ...hospital },
      });
      assert.equal(badPhone.statusCode, 400);
      const emptyName = await app.inject({
        method: "POST",
        url: "/admin/phicodes/issue",
        payload: { name: "   ", phone: "01012345678", ...hospital },
      });
      assert.equal(emptyName.statusCode, 400);
      const missingHospital = await app.inject({
        method: "POST",
        url: "/admin/phicodes/issue",
        payload: { name: "홍길동", phone: "01012345678" },
      });
      assert.equal(missingHospital.statusCode, 400);

      const token = await issueToken(app);
      const unknown = await app.inject({
        method: "GET",
        url: "/legacy/phicode/validate?code=NEVER-ISSUED-CODE&",
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal((unknown.json() as { result_code: string }).result_code, "1");

      const page = await app.inject({ method: "GET", url: "/phicode" });
      assert.equal(page.statusCode, 200);
      assert.match(page.headers["content-type"] ?? "", /text\/html/);
      assert.match(page.body, /id="hospitalSelect"/);
      assert.match(page.body, /서울대학교병원/);
      assert.match(page.body, /하이픈은 없어도 된다/);
      assert.match(page.body, /id="isGov"/);
      assert.match(page.body, /정부연관 병원/);
    } finally {
      await app.close();
      closeTestDb();
    }
  });
});
