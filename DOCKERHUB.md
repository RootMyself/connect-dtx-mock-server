# connect-dtx Mock Server

로컬 개발용 connect-dtx API 목 서버다. OAuth 토큰부터 phicode 검증, FHIR 처방/결과까지 전체 흐름을 실 서버 없이 돌린다.
Node 26 + Fastify + SQLite 영속화로 로컬에서 바로 실행된다.

## 빠른 시작

이미지 받기:

```bash
docker pull rootmyself/connect-dtx-mock-server:v0.2.0
```

컨테이너 실행 후 상태 확인:

```bash
docker run -d -p 127.0.0.1:8091:8091 rootmyself/connect-dtx-mock-server:v0.2.0
curl -s http://localhost:8091/health
```

상태 응답이 `{"status":"UP"}` 이면 정상이다.

## Docker Compose

게시 이미지 실행용 스니펫이다:

```yaml
services:
  connect-dtx-mock-server:
    image: rootmyself/connect-dtx-mock-server:v0.2.0
    container_name: connect-dtx-mock-server
    ports:
      - "127.0.0.1:8091:8091"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

실행:

```bash
docker compose up -d
```

참고로 이 저장소의 `docker-compose.yml` 파일은 로컬 소스 빌드용(`build: .`)이므로 위 스니펫과는 용도가 다르다.

## 주요 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8091` | 컨테이너 리슨 포트. 바꾸면 호스트 매핑도 함께 바뀐다 |
| `PUBLIC_BASE_URL` | `http://localhost:${PORT}` | 시작 로그 기준 URL |
| `CLIENT_ID` / `CLIENT_SECRET` | `test-client-id` / `test-client-secret` | 일반 도메인 최초 시드 |
| `GOV_CLIENT_ID` / `GOV_CLIENT_SECRET` | `test-gov-client-id` / `test-gov-client-secret` | 정부 도메인 최초 시드 |
| `DB_PATH` | `data/connectdtx.db` | SQLite 파일 경로. `:memory:` 는 휘발성이다 |
| `STRICT_CREDENTIALS` | `true` | 등록된 클라이언트만 통과. `false` 는 로컬 디버깅용이다 |
| `TOKEN_TTL_MS` | `86400000` | 접근 토큰 유효시간. 24시간이다 |

## 태그

`latest` 는 최신 릴리즈를 가리킨다. 재현이 필요하면 `vX.Y.Z` 형식으로 버전을 찍어 쓴다.

## 보안 경고

관리 API(`/admin/*`)에는 인증이 전혀 없다. 반드시 루프백에서만 쓰고 외부에 절대 노출하지 않는다.
실 connect-dtx 자격증명을 넣지 않는다. 더미 값만 쓴다.

## 링크

- [GitHub 저장소](https://github.com/RootMyself/connect-dtx-mock-server)
- [퀵스타트](https://github.com/RootMyself/connect-dtx-mock-server/blob/main/docs/quickstart.md)
- [운영 안내](https://github.com/RootMyself/connect-dtx-mock-server/blob/main/docs/operations.md)
- [라이선스](https://github.com/RootMyself/connect-dtx-mock-server/blob/main/LICENSE)

이 프로젝트는 MIT 라이선스다.
