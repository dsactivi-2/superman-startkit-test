#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-}"
if [ -z "$BASE_URL" ]; then
  echo "Usage: ./scripts/smoke_test.sh https://api.example.com"
  exit 1
fi

echo "Smoke: GET $BASE_URL/health"
curl -fsS "$BASE_URL/health" | grep -q "ok"

echo "Smoke: GET $BASE_URL/version"
curl -fsS "$BASE_URL/version" >/dev/null

echo "OK"
