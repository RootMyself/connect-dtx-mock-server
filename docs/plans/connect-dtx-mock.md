Run `cat docs/plans/connect-dtx-mock.md`, then reply `go`.

# connect-dtx mock v3 — plan (nice-id-mock-server 이식)
- Scope: auth 2 + phicode 3 + FHIR 2. medic 제외.
- Stack: Node 26 + Fastify + SQLite. WireMock안 폐기 — 토큰 상태머신·실패주입이 JSON 매핑 불가.
- Port: `8091`. dtx-fhir local `base-url`·`gov-base-url` 둘 다 `localhost:8091`.
- Creds: `CLIENT_ID/SECRET` + `GOV_CLIENT_ID/GOV_CLIENT_SECRET` 동시 수용, 토큰에 zone 태그.
- Token: `TOKEN_TTL_MS` (24h). validate `{"result_code":"0"}` / 만료 `"7"`.
- Deploy: tag `v*.*.*` == package.json gate → buildx amd64/arm64 → `rootmyself/connect-dtx-mock-server` + GHCR 미러, `vX.Y.Z` + `latest`.

Tree (nice 그대로): `src/{server,app,config,db,store,clients,errors,routes/{oauthToken,phicode,fhir,admin}}.ts`, `test/*.test.ts`, `tools/e2e-{docker,live}.sh`, `docs/{quickstart,architecture,operations,wiring}.md`, `Dockerfile`, `docker-compose.yml`, `DOCKERHUB.md`.

1. 스캐폴드+compose+CI — 40분
2. auth 2종 — 40분
3. phicode 3종+admin 실패주입 — 40분
4. FHIR 2종+golden 이식 — 60분
5. e2e+release+문서 — 60분

Total 약 4시간. Open: `dtxprcp` Bundle entry — step 4에서 factory 판독 후 확정.
