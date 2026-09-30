# 병원 조직 OID — plan

- 목표: phi_code 발급 시 병원 4종(필수) 입력 → `urn:oid:1.2.410.100110.10.XXXXXXXX` 발급·관리 → dtxprcp가 해당 병원 Organization 반환.
- SoT: `VoOrganization.java:15` OID 규격 + 사용자 지정 prefix/시작값. 실 Bundle envelope 미확보 — 조직 리소스 형상은 기존 fixture 유지.
- OID: prefix `urn:oid:1.2.410.100110.10.` + 8자리 순차(seq, 11100443 시작). 4종 완전일치 시 기존 OID 재사용(sha256 지문).
- DB: `organizations(oid PK, seq UNIQUE, name, address, postal, phone, fingerprint UNIQUE, created_at)` NEW + `phicodes.org_oid` ADD COLUMN 마이그레이션(기존 `data/connectdtx.db` additive). 기본행 seq 11100443(테스트병원) 시드 → legacy 코드 PHI-1·ABC 기존 테스트 그대로 통과.
- 검증: 이름 1..64, 주소 1..128, 우편번호 5자리, 병원전화 숫자 9~11자리(0 시작). PII 평문 저장·로그 금지(지문만 비교용, 원문은 조직 표시용으로 저장 — 로컬 mock).
- 비범위: dtx-fhir 수정 없음, 조직 수정/삭제 API 없음(목록만), history 변경 없음.

1. `src/db.ts` + `src/organizations.ts` NEW (DDL·마이그레이션·발번·지문) — 30분
2. `src/phicodes.ts` + `src/routes/phicode.ts` (발급 4종 필수, 응답에 `org_oid`, `/phicode` UI 4필드) — 30분
3. `src/routes/fhir.ts` (dtxprcp를 phi_code bound 조직으로 동적 반환, legacy는 기본행) — 25분
4. `src/routes/admin.ts` (`GET /admin/organizations` 목록) + `src/app.ts` PROJECT_INFO — 10분
5. `test/` (기존 발급 테스트 payload 수정 + 재사용/순차/dtxprcp동적/400 4건) + `docs/quickstart.md`·README — 25분

합계 약 2시간.
