#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="${VPS_HOST:-vecin2vecin-vps}"
REMOTE_DIR="${REMOTE_DIR:-/opt/grig-teo-space}"
DOMAIN="${DOMAIN:-grig-teo.space}"
EMAIL="${CERTBOT_EMAIL:-grigore.teodoru97@gmail.com}"
NGINX_SITE="/etc/nginx/sites-available/grig-teo.space.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/grig-teo.space.conf"

echo "==> Requesting Let's Encrypt certificate for ${DOMAIN}"

ssh "${VPS_HOST}" bash -s <<EOF
set -euo pipefail
cd ${REMOTE_DIR}
mkdir -p /var/www/certbot

certbot certonly --webroot \
  -w /var/www/certbot \
  -d ${DOMAIN} \
  -d www.${DOMAIN} \
  --email ${EMAIL} \
  --agree-tos \
  --no-eff-email \
  --non-interactive

cp deploy/nginx/host/grig-teo.space.conf ${NGINX_SITE}
ln -sf ${NGINX_SITE} ${NGINX_ENABLED}
nginx -t
systemctl reload nginx
EOF

echo "==> HTTPS enabled: https://${DOMAIN}"
