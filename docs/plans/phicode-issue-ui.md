# phi_code 발급 UI — plan

- 목표: 이름+휴대폰 입력 → phi_code 발급, 웹 UI. 미발급 코드 validate는 `result_code 1`.
- 포맷: `randomBytes(32).toString("base64url")` 43자. 예시(`Eg2S9KP-...-7E_0`)와 같은 URL-safe 불투명 문자열.
- PII: 이름/번호 평문 저장·로그 금지. `sha256(이름/번호 정규형)` 해시만 `user_hash`에 보관.
- 같은 사람 재발급 → 매번 새 코드 (회차 개념).
- 기존 흐름 유지: `PHI-1`·`ABC`·`PHI-TEST-0001` 시드 → 기존 테스트·e2e·dtx-fhir 그대로 통과. 대가: 시드 코드는 누구나 통과 (로컬 mock이라 수용).
- 시나리오 강제값(`phicode_validate` 등)은 DB보다 우선 유지.

1. `src/db.ts` — `phicodes(phi_code PK, user_hash, created_at)` DDL (`IF NOT EXISTS`). 10분.
2. `src/phicodes.ts` NEW — 발급/조회/시드. 번호 정규화(`010` 등 10~11자리), 이름 trim 1~64. 25분.
3. `src/routes/phicode.ts` — validate DB 대조 강화 + `POST /admin/phicodes/issue` + `GET /phicode` 단일 HTML 페이지. 25분.
4. `src/app.ts` — PROJECT_INFO에 2경로 추가 (루트 JSON 계약 유지). 5분.
5. `test/phicode-issue.test.ts` NEW + `docs/quickstart.md`·README 5줄 — 정상/경계/실패 3건, `npm test`·`typecheck` 녹색. 20분.

합계 약 85분. 비범위: history echo 동작 변경 없음.
