# dtx-fhir 배선

← [README](../README.md)

local 프로파일 `application.yaml`의 connectdtx 블록만 바꾼다:

```yaml
connectdtx:
  base-url: http://localhost:8091
  gov-base-url: http://localhost:8091
```

client-id/secret 4종은 mock 시드와 동일하므로 그대로 둔다.
SM import(`spring.config.import`)는 local에서 dev 시크릿을 쓰므로, mock 연결 시에는 해당 6줄을 주석 처리하거나
`SPRING_PROFILES_ACTIVE=test` 유사 오버라이드로 피한다.

확인 순서 (mock 기동 후):

```bash
curl "http://localhost:8080/connect/phicode/history?phiCode=PHI-1"
curl "http://localhost:8080/connect/dtx/prescription?phiCode=PHI-1"
```

첫 호출에서 mock 로그에 `POST /oauth2/token` 1회 + `GET /oauth2/token?grant_type=validate` 1회가 보이면 정상이다.
두 번째 동일 호출에서는 validate만 1회 추가된다 (토큰 재사용).
