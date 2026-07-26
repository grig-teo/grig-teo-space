#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HOST="${VPS_HOST:-vecin2vecin-vps}"
REMOTE_DIR="${REMOTE_DIR:-/opt/grig-teo-space}"
DOMAIN="${DOMAIN:-grig-teo.space}"
ADMIN_ACCESS_KEY="${ADMIN_ACCESS_KEY:-}"
JWT_SECRET="${JWT_SECRET:-}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-}"
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
  --exclude '.env.production' \
  --exclude 'backups/' \
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
  echo "Created .env.production from example."
fi

ensure_env() {
  local key="\$1"
  local value="\$2"
  if ! grep -q "^\${key}=" .env.production 2>/dev/null; then
    echo "\${key}=\${value}" >> .env.production
  elif grep -q "^\${key}=change-me\$" .env.production 2>/dev/null; then
    sed -i "s/^\${key}=change-me\$/\${key}=\${value}/" .env.production
  fi
}

set_env() {
  local key="\$1"
  local value="\$2"
  if grep -q "^\${key}=" .env.production 2>/dev/null; then
    sed -i "s|^\${key}=.*|\${key}=\${value}|" .env.production
  else
    echo "\${key}=\${value}" >> .env.production
  fi
}

if [ -n "${POSTGRES_PASSWORD}" ]; then
  set_env POSTGRES_PASSWORD "${POSTGRES_PASSWORD}"
elif grep -q "^POSTGRES_PASSWORD=change-me\$" .env.production 2>/dev/null || ! grep -q "^POSTGRES_PASSWORD=" .env.production 2>/dev/null; then
  POSTGRES_PASSWORD="\$(openssl rand -hex 16)"
  ensure_env POSTGRES_PASSWORD "\${POSTGRES_PASSWORD}"
fi

if [ -n "${JWT_SECRET}" ]; then
  set_env JWT_SECRET "${JWT_SECRET}"
elif grep -q "^JWT_SECRET=change-me\$" .env.production 2>/dev/null || ! grep -q "^JWT_SECRET=" .env.production 2>/dev/null; then
  JWT_SECRET="\$(openssl rand -hex 32)"
  ensure_env JWT_SECRET "\${JWT_SECRET}"
fi

if [ -n "${ADMIN_ACCESS_KEY}" ]; then
  set_env ADMIN_ACCESS_KEY "${ADMIN_ACCESS_KEY}"
elif grep -q "^ADMIN_ACCESS_KEY=change-me\$" .env.production 2>/dev/null || ! grep -q "^ADMIN_ACCESS_KEY=" .env.production 2>/dev/null; then
  ADMIN_ACCESS_KEY="\$(openssl rand -hex 32)"
  ensure_env ADMIN_ACCESS_KEY "\${ADMIN_ACCESS_KEY}"
fi

if [ -n "${MINIO_ROOT_USER}" ]; then
  set_env MINIO_ROOT_USER "${MINIO_ROOT_USER}"
elif grep -q "^MINIO_ROOT_USER=change-me\$" .env.production 2>/dev/null || ! grep -q "^MINIO_ROOT_USER=" .env.production 2>/dev/null; then
  MINIO_ROOT_USER="grigteo-minio"
  ensure_env MINIO_ROOT_USER "\${MINIO_ROOT_USER}"
fi

if [ -n "${MINIO_ROOT_PASSWORD}" ]; then
  set_env MINIO_ROOT_PASSWORD "${MINIO_ROOT_PASSWORD}"
elif grep -q "^MINIO_ROOT_PASSWORD=change-me\$" .env.production 2>/dev/null || ! grep -q "^MINIO_ROOT_PASSWORD=" .env.production 2>/dev/null; then
  MINIO_ROOT_PASSWORD="\$(openssl rand -hex 24)"
  ensure_env MINIO_ROOT_PASSWORD "\${MINIO_ROOT_PASSWORD}"
fi

ensure_env MINIO_BUCKET "grig-teo-media"
set_env MINIO_PUBLIC_URL "https://${DOMAIN}/media"

# --- Backup tooling (age encrypts nightly backups; rclone only if chosen) ---
if ! command -v age >/dev/null 2>&1; then
  echo "==> Installing age (backup encryption)..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq age || {
    echo "  age not in apt — fetching static binary v1.2.1"
    curl -fsSL "https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-linux-amd64.tar.gz" | tar -xz -C /tmp
    install -m 0755 /tmp/age/age /tmp/age/age-keygen /usr/local/bin/ \
      || echo "  WARN: age install failed — nightly backups will fail until fixed"
  }
fi
if [ "\$(grep -E '^BACKUP_TRANSPORT=' .env.production 2>/dev/null | cut -d= -f2-)" = "rclone" ] && ! command -v rclone >/dev/null 2>&1; then
  echo "==> Installing rclone (backup transport)..."
  curl -fsSL https://rclone.org/install.sh | bash || echo "  WARN: rclone install failed"
fi
command -v rsync >/dev/null 2>&1 || apt-get install -y -qq rsync || echo "  WARN: rsync install failed"

# --- Pre-deploy safety net: snapshot Postgres BEFORE the rebuild ---------
# TypeORM synchronize:true (backend/src/app.module.ts) can alter/drop columns
# on boot, so we keep a quick pg_dump as a rollback point (last 5 kept).
# Best-effort: a failure here only warns, never blocks the deploy.
mkdir -p ${REMOTE_DIR}/backups
if [ -n "\$(docker compose --env-file .env.production -f ${COMPOSE_FILE} ps -q db 2>/dev/null)" ]; then
  PRE_TS="\$(date -u +%Y%m%dT%H%M%SZ)"
  echo "==> Pre-deploy pg_dump -> backups/pre-deploy-\${PRE_TS}.sql.gz"
  if docker compose --env-file .env.production -f ${COMPOSE_FILE} exec -T db \
       pg_dump -U grigteo -d grigteo --no-owner --clean --if-exists 2>/dev/null \
       | gzip -c > "${REMOTE_DIR}/backups/pre-deploy-\${PRE_TS}.sql.gz"; then
    ls -1t ${REMOTE_DIR}/backups/pre-deploy-*.sql.gz 2>/dev/null | tail -n +6 | xargs -r rm -f || true
  else
    echo "  WARN: pre-deploy pg_dump failed (continuing)"
    rm -f "${REMOTE_DIR}/backups/pre-deploy-\${PRE_TS}.sql.gz" 2>/dev/null || true
  fi
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

# --- Install + (conditionally) enable the nightly backup systemd timer -----
ssh "${VPS_HOST}" bash -s <<EOF2
set -euo pipefail
cd ${REMOTE_DIR}

if [ -f deploy/backup.sh ]; then
  chmod +x deploy/backup.sh
  sed "s|__REMOTE_DIR__|${REMOTE_DIR}|g" deploy/grigteo-backup.service > /etc/systemd/system/grigteo-backup.service
  sed "s|__REMOTE_DIR__|${REMOTE_DIR}|g" deploy/grigteo-backup.timer   > /etc/systemd/system/grigteo-backup.timer
  systemctl daemon-reload

  backup_configured() {
    local recip rsync_host
    recip="\$(grep -E '^BACKUP_AGE_RECIPIENT=' .env.production 2>/dev/null | cut -d= -f2-)"
    case "\$recip" in
      age1????????????????*) ;;
      *) return 1 ;;
    esac
    if [ "\$(grep -E '^BACKUP_TRANSPORT=' .env.production 2>/dev/null | cut -d= -f2-)" = "rclone" ]; then
      grep -Eq '^BACKUP_RCLONE_REMOTE=.+' .env.production || return 1
    else
      rsync_host="\$(grep -E '^BACKUP_RSYNC_HOST=' .env.production 2>/dev/null | cut -d= -f2-)"
      [ -n "\$rsync_host" ] && [ "\$rsync_host" != "user@storage.example.com" ] || return 1
    fi
    return 0
  }

  if backup_configured; then
    systemctl enable --now grigteo-backup.timer
    echo "==> Backup timer ENABLED: \$(systemctl list-timers grigteo-backup.timer --no-pager | sed -n '2p')"
  else
    echo "==> Backup units installed but timer NOT enabled."
    echo "    Set BACKUP_AGE_RECIPIENT + BACKUP_RSYNC_HOST (or BACKUP_RCLONE_REMOTE) in"
    echo "    ${REMOTE_DIR}/.env.production, then: systemctl enable --now grigteo-backup.timer"
  fi
else
  echo "==> deploy/backup.sh not found — skipping backup timer install"
fi
EOF2

ADMIN_KEY="$(ssh "${VPS_HOST}" "grep '^ADMIN_ACCESS_KEY=' ${REMOTE_DIR}/.env.production | cut -d= -f2-")"

echo "==> Deploy finished"
echo "    Site: https://${DOMAIN}"
echo "    Admin: https://${DOMAIN}/admin"
echo "    Access key: ${ADMIN_KEY}"
echo "    Run ./deploy/init-ssl.sh if HTTPS is not configured yet."
