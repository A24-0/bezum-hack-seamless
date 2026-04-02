#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env" ]]; then
  cp ".env.development.example" ".env"
  echo "Created .env from .env.development.example"
fi

if [[ ! -f "docker-compose.override.yml" ]]; then
  cp "docker-compose.override.example.yml" "docker-compose.override.yml"
  echo "Created docker-compose.override.yml from example"
fi

echo "Stopping and removing old stack with volumes..."
docker compose down -v

echo "Starting full stack..."
docker compose up -d --build

echo
echo "Stack is up. Next step:"
echo "  ./scripts/smoke-check.sh"
