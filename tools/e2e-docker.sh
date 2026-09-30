#!/usr/bin/env bash
# Live dockerized e2e: compose up -> poll /health -> 7개 경로 실호출 -> compose down.
set -u

E2E_EXIT=0

cleanup() {
  docker compose down >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

docker compose up -d --build || { echo "e2e-docker: FAIL: docker compose up failed" >&2; E2E_EXIT=1; exit "$E2E_EXIT"; }

echo "e2e-docker: compose up done, polling /health (<=45s)..."
READY=0
for _ in $(seq 1 45); do
  if curl -fsS http://localhost:8091/health 2>/dev/null | grep -q '"status":"UP"'; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" != "1" ]; then
  echo "e2e-docker: FAIL: /health not UP within 45s" >&2
  curl -s http://localhost:8091/health || true
  E2E_EXIT=1
  exit "$E2E_EXIT"
fi

echo "e2e-docker: health UP, running live e2e..."
MOCK_BASE_URL=http://localhost:8091 node tools/e2e-live.mjs
E2E_EXIT=$?

if [ "$E2E_EXIT" -eq 0 ]; then
  echo "e2e-docker: live e2e PASS"
else
  echo "e2e-docker: FAIL: live e2e exited $E2E_EXIT" >&2
fi

exit "$E2E_EXIT"
