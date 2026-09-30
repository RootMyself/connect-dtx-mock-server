import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "../config.ts";
import { isRecord } from "../guards.ts";
import {
  findOrCreateOrganization,
  normalizeOrgAddress,
  normalizeOrgName,
  normalizeOrgPhone,
  normalizeOrgPostal,
} from "../organizations.ts";
import {
  findPhiCode,
  issuePhiCode,
  normalizeName,
  normalizePhone,
  userHashMatches,
} from "../phicodes.ts";
import { findToken, getScenario } from "../tokens.ts";

interface RouteOptions {
  config: Config;
}

function bearerValid(request: FastifyRequest): boolean {
  const header = request.headers.authorization;
  if (header === undefined || !header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  if (token === "") return false;
  const found = findToken(token);
  return found !== undefined && Date.now() < found.expiresAt;
}

// 로컬 개발용 발급 화면. 외부 의존성 없음. 결과 코드는 textContent로만 꽂는다.
const PHICODE_PAGE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>phi_code 발급 — connect-dtx mock</title>
<style>
:root { color-scheme: light; --navy: #0f2851; --ink: #14213a; --muted: #5b6b85; --line: #dce2ec; --paper: #f7f8fa; --teal: #0e9f8a; --danger: #c2402a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font-family: -apple-system, "Pretendard", "Noto Sans KR", sans-serif; }
header { background: var(--navy); color: #fff; padding: 14px 22px; font-size: 15px; }
main { max-width: 560px; margin: 32px auto; padding: 0 20px 48px; }
h1 { font-size: 22px; margin: 0 0 6px; }
p.sub { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
form, section.result { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
label { display: block; font-size: 14px; margin: 14px 0 6px; }
label:first-of-type { margin-top: 0; }
input { width: 100%; font-size: 16px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; }
input:focus-visible, button:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
button { cursor: pointer; font-size: 15px; border-radius: 8px; border: 1px solid transparent; padding: 10px 16px; }
button.issue { background: var(--navy); color: #fff; width: 100%; margin-top: 18px; }
button.copy { background: #fff; border-color: var(--line); margin-top: 12px; }
p.hint { font-size: 13px; color: var(--muted); margin: 8px 0 0; }
section.result { margin-top: 16px; display: none; }
section.result.show { display: block; }
code.phi { display: block; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 14px; word-break: break-all; background: var(--paper); border: 1px dashed var(--line); border-radius: 8px; padding: 12px; }
p.error { color: var(--danger); font-size: 14px; min-height: 20px; margin: 12px 0 0; }
code.curl { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; color: var(--muted); word-break: break-all; }
</style>
</head>
<body>
<header>connect-dtx mock — 로컬 개발용</header>
<main>
<h1>phi_code 발급</h1>
<p class="sub">이름과 휴대폰 번호를 입력하면 테스트용 phi_code가 나온다. 저장되는 것은 해시뿐이다.</p>
<form id="phi-form">
<label for="name">이름</label>
<input id="name" name="name" autocomplete="name" maxlength="64" required placeholder="홍길동">
<label for="phone">휴대폰 번호</label>
<input id="phone" name="phone" inputmode="tel" autocomplete="tel" required placeholder="010-1234-5678">
<p class="hint">숫자 10~11자리. 하이픈은 없어도 된다.</p>
<label for="hospitalName">병원명</label>
<input id="hospitalName" name="hospitalName" maxlength="64" required placeholder="테스트병원">
<label for="hospitalAddress">병원주소</label>
<input id="hospitalAddress" name="hospitalAddress" maxlength="128" required placeholder="서울특별시 테스트구">
<label for="hospitalPostal">병원우편번호</label>
<input id="hospitalPostal" name="hospitalPostal" inputmode="numeric" maxlength="5" required placeholder="00000">
<p class="hint">숫자 5자리.</p>
<label for="hospitalPhone">병원전화번호</label>
<input id="hospitalPhone" name="hospitalPhone" inputmode="tel" required placeholder="02-0000-0000">
<button class="issue" type="submit">발급하기</button>
<p class="error" id="err" role="alert"></p>
</form>
<section class="result" id="result" aria-live="polite">
<code class="phi" id="code"></code>
<button class="copy" id="copy" type="button">복사</button>
<p class="hint">검증: <code class="curl" id="curl"></code></p>
</section>
</main>
<script>
const form = document.getElementById("phi-form");
const err = document.getElementById("err");
const result = document.getElementById("result");
const codeEl = document.getElementById("code");
const curlEl = document.getElementById("curl");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  err.textContent = "";
  result.classList.remove("show");
  const res = await fetch("/admin/phicodes/issue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: form.name.value, phone: form.phone.value, hospitalName: form.hospitalName.value, hospitalAddress: form.hospitalAddress.value, hospitalPostal: form.hospitalPostal.value, hospitalPhone: form.hospitalPhone.value }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 201) {
    err.textContent = body.message ?? "발급 실패. 입력값을 확인한다.";
    return;
  }
  codeEl.textContent = body.phi_code + " / " + body.org_oid;
  curlEl.textContent = "GET /legacy/phicode/validate?code=" + body.phi_code;
  result.classList.add("show");
});
document.getElementById("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(codeEl.textContent ?? "");
});
</script>
</body>
</html>`;

export default async function routes(app: FastifyInstance, opts: RouteOptions): Promise<void> {
  void opts;

  // 발급 화면 (인증 없음 — /admin과 같은 로컬 전용 취급)
  app.get("/phicode", async (_request, reply) => {
    return reply.code(200).type("text/html; charset=utf-8").send(PHICODE_PAGE);
  });

  // 이름 + 휴대폰 + 병원 4종(필수) → phi_code + org_oid 발급. PII는 해시만 저장, 로그에 남기지 않는다.
  app.post("/admin/phicodes/issue", async (request, reply) => {
    const body: unknown = request.body;
    if (!isRecord(body)) {
      return reply.code(400).send({ error: "bad_request", message: "body must be a JSON object" });
    }
    const name = normalizeName(body["name"]);
    if (name === undefined) {
      return reply.code(400).send({ error: "bad_request", message: "name must be 1..64 chars" });
    }
    const phone = normalizePhone(body["phone"]);
    if (phone === undefined) {
      return reply
        .code(400)
        .send({ error: "bad_request", message: "phone must be 10..11 digits starting with 01" });
    }
    const orgName = normalizeOrgName(body["hospitalName"]);
    const orgAddress = normalizeOrgAddress(body["hospitalAddress"]);
    const orgPostal = normalizeOrgPostal(body["hospitalPostal"]);
    const orgPhone = normalizeOrgPhone(body["hospitalPhone"]);
    if (
      orgName === undefined ||
      orgAddress === undefined ||
      orgPostal === undefined ||
      orgPhone === undefined
    ) {
      return reply.code(400).send({
        error: "bad_request",
        message:
          "hospitalName(1..64)/hospitalAddress(1..128)/hospitalPostal(5 digits)/hospitalPhone required",
      });
    }
    const org = findOrCreateOrganization({
      name: orgName,
      address: orgAddress,
      postal: orgPostal,
      phoneDigits: orgPhone,
    });
    const issued = issuePhiCode(name, phone, org.oid);
    return reply.code(201).send({ phi_code: issued.phiCode, org_oid: org.oid });
  });

  // GET /legacy/phicode/validate?code=&user_code= → result_code "0"이면 true.
  // 미발급 코드는 "1". 시나리오 강제값은 DB보다 우선한다.
  app.get("/legacy/phicode/validate", async (request, reply) => {
    if (!bearerValid(request)) {
      return reply.code(401).send({ result_code: "7", error_msg: "unauthorized" });
    }
    const forced = getScenario("phicode_validate");
    if (forced !== undefined) {
      const [forcedHttp, forcedCode] = forced.split(":", 2);
      const status = Number(forcedHttp);
      return reply
        .code(Number.isInteger(status) ? status : 200)
        .send({ result_code: forcedCode ?? "1" });
    }
    const query: unknown = request.query;
    const code = isRecord(query) && typeof query["code"] === "string" ? query["code"] : "";
    if (code === "") {
      return reply.code(200).send({ result_code: "1", error_msg: "unknown code" });
    }
    const row = findPhiCode(code);
    if (row === undefined) {
      return reply.code(200).send({ result_code: "1", error_msg: "unknown code" });
    }
    const userCode = isRecord(query) ? query["user_code"] : undefined;
    if (!userHashMatches(row, userCode)) {
      return reply.code(200).send({ result_code: "1", error_msg: "user mismatch" });
    }
    return reply.code(200).send({ result_code: "0", result_msg: "success" });
  });

  // GET /pauth/phicode/history?phi_code= → {"result_code":"0","list":[{idx,phi_code}]}
  app.get("/pauth/phicode/history", async (request, reply) => {
    if (!bearerValid(request)) {
      return reply.code(401).send({ result_code: "7", error_msg: "unauthorized" });
    }
    const forced = getScenario("phicode_history");
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
    const historyQuery: unknown = request.query;
    const phiCode =
      isRecord(historyQuery) && typeof historyQuery["phi_code"] === "string"
        ? historyQuery["phi_code"]
        : "UNKNOWN";
    return reply.code(200).send({
      result_code: "0",
      list: [{ idx: "1", phi_code: phiCode }],
    });
  });

  // POST /pauth/dtx/info {"phi_code","state","step":"1","client_time"} → result_code "0"
  app.post("/pauth/dtx/info", async (request, reply) => {
    if (!bearerValid(request)) {
      return reply.code(401).send({ result_code: "7", error_msg: "unauthorized" });
    }
    const forced = getScenario("dtx_info");
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
    if (
      !isRecord(body) ||
      typeof body["phi_code"] !== "string" ||
      typeof body["state"] !== "string"
    ) {
      return reply.code(200).send({ result_code: "1", error_msg: "invalid params" });
    }
    return reply.code(200).send({ result_code: "0", result_msg: "success" });
  });
}
