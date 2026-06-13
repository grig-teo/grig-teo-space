#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HOST="${VPS_HOST:-vecin2vecin-vps}"
REMOTE_DIR="${REMOTE_DIR:-/opt/grig-teo-space}"
DOMAIN="${DOMAIN:-grig-teo.space}"
COMPOSE_FILE="docker-compose.prod.yml"
NGINX_SITE="/etc/nginx/sites-available/grig-teo.space.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/grig-teo.space.conf"

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

docker compose --env-file .env.production -f ${COMPOSE_FILE} up -d --build --remove-orphans
docker compose --env-file .env.production -f ${COMPOSE_FILE} ps

mkdir -p /var/www/certbot

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  cp deploy/nginx/host/grig-teo.space.conf ${NGINX_SITE}
else
  cp deploy/nginx/host/grig-teo.space.http.conf ${NGINX_SITE}
fi

ln -sf ${NGINX_SITE} ${NGINX_ENABLED}
nginx -t
systemctl reload nginx
EOF

echo "==> Deploy finished"
echo "    Site: http://${DOMAIN}"
echo "    Run ./deploy/init-ssl.sh if HTTPS is not configured yet."
