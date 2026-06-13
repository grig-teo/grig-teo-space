#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HOST="${VPS_HOST:-root@168.222.140.86}"
REMOTE_DIR="${REMOTE_DIR:-/opt/grig-teo-space}"
DOMAIN="${DOMAIN:-grig-teo.space}"
COMPOSE_FILE="docker-compose.prod.yml"

echo "==> Deploying to ${VPS_HOST}:${REMOTE_DIR}"

ssh "${VPS_HOST}" "mkdir -p ${REMOTE_DIR}"

rsync -avz --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'frontend/node_modules' \
  --exclude 'backend/node_modules' \
  --exclude 'frontend/.next' \
  --exclude 'backend/dist' \
  --exclude 'backend/.venv' \
  --exclude '.env' \
  "${ROOT_DIR}/" "${VPS_HOST}:${REMOTE_DIR}/"

ssh "${VPS_HOST}" bash -s <<EOF
set -euo pipefail
cd ${REMOTE_DIR}

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  echo "Created .env.production from example — review values on the server."
fi

docker compose --env-file .env.production -f ${COMPOSE_FILE} up -d --build
docker compose --env-file .env.production -f ${COMPOSE_FILE} ps
EOF

echo "==> Deploy finished"
echo "    Site: http://${DOMAIN}"
echo "    Run ./deploy/init-ssl.sh if HTTPS is not configured yet."
