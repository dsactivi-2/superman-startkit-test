#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env.example" ]; then
  echo "ERROR: .env.example not found in $ROOT_DIR"
  exit 1
fi

if [ -f ".env" ]; then
  echo "OK: .env already exists. Nothing to do."
  exit 0
fi

cp .env.example .env

# Set safe local defaults (non-production)
# Replace NEXT_PUBLIC_API_BASE_URL to localhost for local docker compose
if grep -q '^NEXT_PUBLIC_API_BASE_URL=' .env; then
  sed -i '' 's|^NEXT_PUBLIC_API_BASE_URL=.*|NEXT_PUBLIC_API_BASE_URL=http://localhost:8000|' .env
fi

# If JWT_SECRET is placeholder, set a dev secret
if grep -q '^JWT_SECRET=change-me' .env; then
  sed -i '' 's|^JWT_SECRET=.*|JWT_SECRET=dev-secret-change-me-please-very-long-random|' .env
fi

# If ADMIN_EMAIL is placeholder, set a local email
if grep -q '^ADMIN_EMAIL=admin@example.com' .env; then
  sed -i '' 's|^ADMIN_EMAIL=.*|ADMIN_EMAIL=admin@local.test|' .env
fi

echo "Created .env with local defaults."
echo "Next:"
echo "  1) Optional: set ADMIN_PASSWORD_HASH (recommended if you enable login now)"
echo "  2) Start: docker compose up"
