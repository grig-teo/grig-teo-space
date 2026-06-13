#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HOST="${VPS_HOST:-root@168.222.140.86}"
REMOTE_DIR="${REMOTE_DIR:-/opt/grig-teo-space}"
DOMAIN="${DOMAIN:-grig-teo.space}"
EMAIL="${CERTBOT_EMAIL:-grigore.teodoru97@gmail.com}"

echo "==> Requesting Let's Encrypt certificate for ${DOMAIN}"

ssh "${VPS_HOST}" bash -s <<EOF
set -euo pipefail
cd ${REMOTE_DIR}

docker compose --env-file .env.production -f docker-compose.prod.yml up -d nginx

docker compose --env-file .env.production -f docker-compose.prod.yml run --rm certbot \
  certbot certonly --webroot \
  -w /var/www/certbot \
  -d ${DOMAIN} \
  -d www.${DOMAIN} \
  --email ${EMAIL} \
  --agree-tos \
  --no-eff-email \
  --force-renewal

docker compose --env-file .env.production -f docker-compose.prod.yml exec nginx sh /docker-entrypoint.d/99-grig-teo.sh
docker compose --env-file .env.production -f docker-compose.prod.yml exec nginx nginx -s reload
EOF

echo "==> HTTPS enabled: https://${DOMAIN}"
