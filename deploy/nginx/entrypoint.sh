#!/bin/sh
set -eu

DOMAIN="${DOMAIN:-grig-teo.space}"
SSL_DIR="/etc/letsencrypt/live/${DOMAIN}"

if [ -f "${SSL_DIR}/fullchain.pem" ] && [ -f "${SSL_DIR}/privkey.pem" ]; then
  cp /etc/nginx/conf.ssl/default.conf /etc/nginx/conf.d/default.conf
  echo "nginx: using SSL config for ${DOMAIN}"
else
  cp /etc/nginx/conf.http/default.conf /etc/nginx/conf.d/default.conf
  echo "nginx: using HTTP config (SSL certs not found yet)"
fi
