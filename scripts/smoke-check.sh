#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-http://localhost:8001}"
WEB_BASE="${WEB_BASE:-http://localhost:8080}"

echo "==> Checking container status"
docker compose ps

echo
echo "==> Checking backend health"
HEALTH="$(curl -fsS "$API_BASE/api/health")"
echo "$HEALTH"

echo
echo "==> Checking frontend response code"
WEB_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "$WEB_BASE")"
echo "Frontend HTTP code: $WEB_CODE"
if [[ "$WEB_CODE" != "200" ]]; then
  echo "Frontend is not returning 200"
  exit 1
fi

echo
echo "==> Register + auth check (temporary smoke user)"
STAMP="$(date +%s)"
EMAIL="smoke.${STAMP}@example.com"
REG_JSON="$(curl -fsS -X POST "$API_BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"name\":\"Smoke Test\",\"role\":\"manager\",\"password\":\"smoke12\"}")"

TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' <<<"$REG_JSON")"
if [[ -z "$TOKEN" ]]; then
  echo "Register succeeded but access_token is missing"
  exit 1
fi
echo "Token received"

echo
echo "==> Authenticated projects endpoint check"
PROJECTS_CODE="$(curl -sS -o /dev/null -w "%{http_code}" \
  "$API_BASE/api/projects" \
  -H "Authorization: Bearer $TOKEN")"
echo "Projects endpoint HTTP code: $PROJECTS_CODE"
if [[ "$PROJECTS_CODE" != "200" ]]; then
  echo "Authenticated projects endpoint failed"
  exit 1
fi

echo
echo "Smoke check passed: frontend + backend + auth + DB are working."
