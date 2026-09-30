# 아키텍처

← [README](../README.md)

```
[dtx-fhir] -- POST /oauth2/token (JSON client_credentials) --> [mock :8091]
[dtx-fhir] <-- access_token ---------------------------------- [mock]
[dtx-fhir] -- GET /oauth2/token?grant_type=validate (Bearer) -> [mock]
[dtx-fhir] <-- result_code 0 / 7 ------------------------------ [mock]
[dtx-fhir] -- GET /legacy/phicode/validate ------------------> [mock]
[dtx-fhir] -- GET /pauth/phicode/history --------------------> [mock]
[dtx-fhir] -- POST /pauth/dtx/info --------------------------> [mock]
[dtx-fhir] -- GET /api/dtx/dtxprcp (fhir+json) ---------------> [mock]
[dtx-fhir] <-- FHIR Bundle 8 entry --------------------------- [mock]
[dtx-fhir] -- POST /api/dtx/dtxresult (Bundle transaction) --> [mock]
```

normal/gov는 한 인스턴스가 동시 수용한다. `clients.zone`이 토큰에 태그되고, 두 zone 경로는 동일하므로 dtx-fhir의
`base-url`·`gov-base-url` 둘 다 `localhost:8091`을 가리키면 된다. 자격증명 4종 기본값은 dtx-fhir
`application-test.yaml`과 동일하다.

토큰 모델: JWT 형태 무서명 Bearer, `tokens` 테이블 저장, TTL 기본 24시간. PhiRestComm은 매 호출마다
validate를 먼저 호출하고 `"7"`이면 재발급한다 — mock은 이 순서를 그대로 재현한다.

시나리오 모델: `scenarios` 테이블 `key → "http:result_code"` (예외: `validate=expired`).
`PUT /admin/scenarios`로 주입, `DELETE /admin/scenarios/:key`로 해제.
`POST /api/dtx/dtxresult` 수신 본문은 `last_dtxresult` 키에 보관되어 `GET /admin/scenarios`로 확인한다.

처방 Bundle: `src/fixtures/read-*.json` 8종(dtx-fhir golden 복사)을 `phicode` 쿼리값으로 치환해 조립한다.
`voServiceRequest·voPatient·voOrganization·voPractitionerRole` 4종이 모두 있어야
`DtxService.getDtxPrescription`이 NPE 없이 VO를 채운다.
