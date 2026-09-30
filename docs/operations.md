# 운영

← [README](../README.md)

## 영속화

클라이언트·토큰·시나리오는 SQLite(`data/connectdtx.db`)에 저장된다. compose `./data` 바인드 마운트로
컨테이너 재생성 후에도 유지된다. TTL 안의 Bearer는 재시작 후에도 유효하다.

```bash
# 초기화: 멈춘 뒤 data 삭제, 다시 올리면 기본값으로 재시드
docker compose down
rm -rf ./data
docker compose up -d --build
```

```bash
# 만료 토큰만 정리
sqlite3 data/connectdtx.db "DELETE FROM tokens WHERE expires_at < $(node -p 'Date.now()');"
```

## TTL

| 대상 | 유효시간 | 만료 시 동작 |
|---|---|---|
| 접근 토큰 | 24시간 (`TOKEN_TTL_MS`) | validate `"7"` → dtx-fhir가 재발급 |

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `401 {"result_code":"7"}` | Bearer 누락·오타·만료, 또는 미등록 자격증명 | 토큰 재발급, `GET /admin/clients`로 등록 확인 |
| dtxprcp가 기대 phicode 아님 | `phicode` 쿼리 누락 시 `PHI-TEST-0001` 기본값 | 쿼리 확인 (끝 `&`는 허용됨) |
| 시나리오가 계속 적용됨 | `DELETE`를 안 함 (영속화됨) | `DELETE /admin/scenarios/:key` |
| 표준 base64로 토큰 요청 실패 | connect-dtx 토큰 발급은 JSON 바디 방식이라 Basic이 아님 | `{"grant_type","client_id","client_secret"}` 바디 확인 |
| Linux 부팅 시 DB open 실패 | `./data` 호스트 권한 | `mkdir -p data` 후 재시도 |
