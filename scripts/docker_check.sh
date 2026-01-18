#!/usr/bin/env bash
set -euo pipefail

echo "Checking Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found. Install Docker Desktop first."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon not reachable."
  echo "Fix on macOS: Open Docker Desktop and wait until it says 'Docker is running'."
  exit 1
fi

echo "OK: Docker daemon reachable."
docker version | head -n 20
