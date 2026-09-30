// Live e2e: drives the RUNNING mock (compose stack) over HTTP.
// Mirrors PhiRestComm call order: token -> validate -> 5 API paths.
// Env: MOCK_BASE_URL default http://localhost:8091.

const MOCK_BASE_URL = process.env["MOCK_BASE_URL"] ?? "http://localhost:8091";

function fail(message) {
  console.error(`e2e-live: FAIL: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`e2e-live: ${message}`);
}

async function token(clientId, clientSecret) {
  const res = await fetch(`${MOCK_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (res.status !== 200) fail(`token: HTTP ${res.status}`);
  const body = await res.json();
  if (typeof body.access_token !== "string") fail(`token: no access_token`);
  return body.access_token;
}

async function main() {
  // 1. normal + gov 토큰 발급
  const tok = await token("test-client-id", "test-client-secret");
  const govTok = await token("test-gov-client-id", "test-gov-client-secret");
  ok("token ok (normal+gov)");

  // 2. validate (trailing & 포함 — PhiRestComm wire quirk)
  for (const t of [tok, govTok]) {
    const res = await fetch(`${MOCK_BASE_URL}/oauth2/token?grant_type=validate&`, {
      headers: { authorization: `Bearer ${t}` },
    });
    const body = await res.json();
    if (body.result_code !== "0") fail(`validate: ${JSON.stringify(body)}`);
  }
  ok("validate ok");

  // 3. phicode 3종
  const auth = { authorization: `Bearer ${tok}` };
  const v = await (
    await fetch(`${MOCK_BASE_URL}/legacy/phicode/validate?code=ABC&user_code=dGVzdA==&`, {
      headers: auth,
    })
  ).json();
  if (v.result_code !== "0") fail(`validate phicode: ${JSON.stringify(v)}`);
  const h = await (
    await fetch(`${MOCK_BASE_URL}/pauth/phicode/history?phi_code=PHI-1&`, { headers: auth })
  ).json();
  if (h.result_code !== "0" || h.list?.[0]?.phi_code !== "PHI-1")
    fail(`history: ${JSON.stringify(h)}`);
  const s = await (
    await fetch(`${MOCK_BASE_URL}/pauth/dtx/info`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ phi_code: "PHI-1", state: "start", step: "1", client_time: "1" }),
    })
  ).json();
  if (s.result_code !== "0") fail(`dtx/info: ${JSON.stringify(s)}`);
  ok("phicode 3종 ok");

  // 4. dtxprcp — Bundle 8 entry
  const p = await (
    await fetch(`${MOCK_BASE_URL}/api/dtx/dtxprcp?phicode=PHI-1&`, {
      headers: { ...auth, accept: "application/fhir+json" },
    })
  ).json();
  if (p.resourceType !== "Bundle" || p.entry?.length !== 8)
    fail(`dtxprcp: entries=${p.entry?.length}`);
  ok("dtxprcp ok (Bundle 8 entries)");

  // 5. dtxresult — fhir+json charset 헤더 그대로
  const r = await (
    await fetch(`${MOCK_BASE_URL}/api/dtx/dtxresult?phicode=PHI-1`, {
      method: "POST",
      headers: {
        ...auth,
        "content-type": "application/fhir+json; charset=UTF-8",
        accept: "application/fhir+json",
      },
      body: JSON.stringify({ resourceType: "Bundle", type: "transaction", entry: [] }),
    })
  ).json();
  if (r.result_code !== "0") fail(`dtxresult: ${JSON.stringify(r)}`);
  ok("dtxresult ok");

  console.log("e2e-live: SUMMARY all 7 paths PASS");
}

await main();
