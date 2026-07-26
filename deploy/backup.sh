#!/usr/bin/env bash
# deploy/backup.sh — nightly off-server backup of Postgres + MinIO.
#
# Produces a single timestamped, age-encrypted tarball containing:
#   - a pg_dump of the `grigteo` database (gzipped)
#   - a mirror of both MinIO buckets (public + private)
#   - a MANIFEST.txt (sizes + object counts)
# …then ships it off-box (rsync over ssh, or rclone) and prunes copies older
# than N days on the remote.
#
# Security model: age is used RECIPIENT-ONLY. Only the public key
# (BACKUP_AGE_RECIPIENT) ever lives on this VPS, so a compromised host cannot
# decrypt past backups. The matching private key lives in the owner's password
# manager (generated off-box with `age-keygen`).
#
# Any failure exits non-zero so the systemd oneshot unit surfaces as "failed"
# in `systemctl list-timers` / `systemctl status grigteo-backup`.
#
# Run by hand:  bash /opt/grig-teo-space/deploy/backup.sh
# Via timer:    systemctl start grigteo-backup.service
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (every value is overridable via .env.production)
# ---------------------------------------------------------------------------
REMOTE_DIR="${REMOTE_DIR:-/opt/grig-teo-space}"
COMPOSE_FILE="${REMOTE_DIR}/docker-compose.prod.yml"
ENV_FILE="${REMOTE_DIR}/.env.production"
STAGING_ROOT="${BACKUP_STAGING_DIR:-${REMOTE_DIR}/backups/staging}"
ARTIFACT_DIR="${BACKUP_LOCAL_ARTIFACT_DIR:-${REMOTE_DIR}/backups/artifacts}"

MC_IMAGE="${MC_IMAGE:-minio/mc:latest}"

# Postgres (the db container authenticates over its local socket; no password
# is needed for `pg_dump -U grigteo` run via `docker compose exec`).
PG_USER="${POSTGRES_USER:-grigteo}"
PG_DB="${POSTGRES_DB:-grigteo}"

# MinIO buckets.
PUB_BUCKET="${MINIO_BUCKET:-grig-teo-media}"
PRIV_BUCKET="${MINIO_PRIVATE_BUCKET:-grig-teo-media-private}"

# Encryption.
AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"

# Transport + retention.
TRANSPORT="${BACKUP_TRANSPORT:-rsync}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_NAME="grigteo-backup-${TS}.tar.gz.age"
STAGING="${STAGING_ROOT}/${TS}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { printf '[backup %s] %s\n' "$TS" "$*" >&2; }
die()  { printf '[backup %s] ERROR: %s\n' "$TS" "$*" >&2; exit 1; }

cleanup() {
  rc=$?
  if [ -n "${KEEP_STAGING:-}" ]; then
    log "keeping staging dir (KEEP_STAGING=1): ${STAGING}"
  else
    rm -rf "${STAGING}" 2>/dev/null || true
  fi
  exit "$rc"
}
trap cleanup EXIT

# Resolve the compose v2 / v1 binary into $DC (a simple string, no array).
resolve_compose() {
  if docker compose version >/dev/null 2>&1; then
    DC="docker compose -f ${COMPOSE_FILE}"
  elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose -f ${COMPOSE_FILE}"
  else
    die "neither 'docker compose' nor 'docker-compose' is installed"
  fi
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
preflight() {
  [ -f "${ENV_FILE}" ] || die ".env.production not found at ${ENV_FILE}"
  set -a
  # shellcheck source=/dev/null
  . "${ENV_FILE}"
  set +a

  command -v age >/dev/null 2>&1 \
    || die "age is not installed (apt-get install age)"

  [ -n "${AGE_RECIPIENT}" ] \
    || die "BACKUP_AGE_RECIPIENT is empty — generate a key off-box (age-keygen) and set the recipient"

  case "${TRANSPORT}" in
    rsync)
      command -v rsync >/dev/null 2>&1 || die "rsync not installed"
      [ -n "${BACKUP_RSYNC_HOST:-}" ] || die "BACKUP_RSYNC_HOST not set"
      [ -n "${BACKUP_RSYNC_PATH:-}" ] || die "BACKUP_RSYNC_PATH not set"
      ;;
    rclone)
      command -v rclone >/dev/null 2>&1 || die "rclone not installed"
      [ -n "${BACKUP_RCLONE_REMOTE:-}" ] || die "BACKUP_RCLONE_REMOTE not set"
      ;;
    *)
      die "BACKUP_TRANSPORT='${TRANSPORT}' (must be 'rsync' or 'rclone')"
      ;;
  esac

  # Docker stack must be up — we dump from the live db container.
  resolve_compose
  if ! ${DC} ps db 2>/dev/null | grep -q '\bdb\b'; then
    die "db container is not running — start the stack before backing up"
  fi
}

# Network the db/minio containers live on, so the mc container can reach
# http://minio:9000 by Docker DNS.
compose_network() {
  local cid net
  cid="$(${DC} ps -q db 2>/dev/null || true)"
  [ -n "${cid}" ] || die "could not resolve db container id"
  net="$(docker inspect "${cid}" \
    -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')"
  [ -n "${net}" ] || die "could not detect docker network for db container"
  echo "${net}"
}

# ---------------------------------------------------------------------------
# 1. Postgres dump
# ---------------------------------------------------------------------------
dump_postgres() {
  log "dumping Postgres -> postgres-${TS}.sql.gz"
  # -T disables TTY allocation (required for piping). --clean --if-exists make
  # the dump restorable over an existing schema; --no-owner avoids role issues.
  ${DC} exec -T db \
    pg_dump -U "${PG_USER}" -d "${PG_DB}" --no-owner --clean --if-exists \
    | gzip -c > "${STAGING}/postgres-${TS}.sql.gz"
}

# ---------------------------------------------------------------------------
# 2. MinIO mirror (both buckets)
# ---------------------------------------------------------------------------
mirror_minio() {
  local net mc_url
  net="$(compose_network)"
  mc_url="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000"
  log "mirroring MinIO buckets via ${MC_IMAGE} on network ${net}"

  # One container, configured once via MC_HOST_src, mirrors every bucket.
  # `mc ls src/<bucket>` returns non-zero when a bucket does not exist yet
  # (e.g. the private bucket before the first iOS upload) — that is non-fatal;
  # any other mc error aborts the backup.
  docker run --rm \
    --network "${net}" \
    -e "MC_HOST_src=${mc_url}" \
    -v "${STAGING}/minio:/export" \
    --entrypoint sh \
    "${MC_IMAGE}" -c '
      set -eu
      for b in "'"$PUB_BUCKET"'" "'"$PRIV_BUCKET"'"; do
        if mc ls "src/${b}/" >/dev/null 2>&1; then
          echo "  mirroring ${b}"
          mc mirror --overwrite --no-color "src/${b}" "/export/${b}"
        else
          echo "  SKIP ${b} (does not exist yet)"
        fi
      done
    ' >&2

  # The public bucket is always created by the backend on boot, so if it did not
  # mirror something is wrong with MinIO creds/connectivity (not an empty
  # bucket). Fail loudly instead of shipping a backup that silently omits media.
  [ -d "${STAGING}/minio/${PUB_BUCKET}" ] \
    || die "public bucket '${PUB_BUCKET}' did not mirror — check MINIO creds/connectivity"
}

# ---------------------------------------------------------------------------
# 3. Manifest + pack + encrypt
# ---------------------------------------------------------------------------
pack_and_encrypt() {
  {
    printf 'grigteo backup\n'
    printf 'timestamp: %s\n' "${TS}"
    printf 'created: %s\n' "$(date -u +%FT%TZ)"
    printf 'host: %s\n' "$(hostname)"
    printf 'age recipient: %s\n\n' "${AGE_RECIPIENT}"
    printf '## Postgres\n'
    printf 'dump: postgres-%s.sql.gz\n' "${TS}"
    du -h "${STAGING}/postgres-${TS}.sql.gz" | awk '{print "dump size:",$1}'
    printf '\n## MinIO\n'
    for b in "${PUB_BUCKET}" "${PRIV_BUCKET}"; do
      if [ -d "${STAGING}/minio/${b}" ]; then
        cnt="$(find "${STAGING}/minio/${b}" -type f | wc -l | tr -d " ")"
        sz="$(du -sh "${STAGING}/minio/${b}" | cut -f1)"
        printf 'bucket %s: %s files, %s\n' "${b}" "${cnt}" "${sz}"
      else
        printf 'bucket %s: not present\n' "${b}"
      fi
    done
  } > "${STAGING}/MANIFEST.txt"

  mkdir -p "${ARTIFACT_DIR}"
  log "packing + encrypting -> ${ARTIFACT_NAME}"
  # tar streams straight into age (no unencrypted file ever hits disk).
  tar -C "${STAGING}" -czf - . \
    | age -r "${AGE_RECIPIENT}" > "${ARTIFACT_DIR}/${ARTIFACT_NAME}"
}

# ---------------------------------------------------------------------------
# 4. Off-box upload + 5. retention prune
# ---------------------------------------------------------------------------
ssh_opts_rsync() {
  # String form for `rsync -e`.
  local s="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
  [ -n "${BACKUP_RSYNC_PORT:-}" ]     && s="${s} -p ${BACKUP_RSYNC_PORT}"
  [ -n "${BACKUP_RSYNC_IDENTITY:-}" ] && s="${s} -i ${BACKUP_RSYNC_IDENTITY}"
  printf '%s' "${s}"
}

ssh_opts_arr() {
  # Array form for a bare `ssh`.
  SSH_ARR=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
  [ -n "${BACKUP_RSYNC_PORT:-}" ]     && SSH_ARR+=(-p "${BACKUP_RSYNC_PORT}")
  [ -n "${BACKUP_RSYNC_IDENTITY:-}" ] && SSH_ARR+=(-i "${BACKUP_RSYNC_IDENTITY}")
}

upload() {
  local artifact="${ARTIFACT_DIR}/${ARTIFACT_NAME}"
  case "${TRANSPORT}" in
    rsync)
      local so dest
      so="$(ssh_opts_rsync)"
      dest="${BACKUP_RSYNC_HOST}:${BACKUP_RSYNC_PATH}"
      log "uploading via rsync to ${dest}/"
      rsync -az --chmod=Du=rwx,Fu=rw,go-rwx -e "${so}" "${artifact}" "${dest}/"
      ;;
    rclone)
      log "uploading via rclone to ${BACKUP_RCLONE_REMOTE}/"
      rclone copy "${artifact}" "${BACKUP_RCLONE_REMOTE}/" \
        --stats=10s --stats-one-line
      ;;
  esac
}

prune() {
  case "${TRANSPORT}" in
    rsync)
      ssh_opts_arr
      log "pruning artifacts older than ${RETENTION_DAYS} days on remote"
      "${SSH_ARR[@]}" "${BACKUP_RSYNC_HOST}" \
        "find '${BACKUP_RSYNC_PATH}' -maxdepth 1 -type f \
         -name 'grigteo-backup-*.tar.gz.age' -mtime +${RETENTION_DAYS} -delete" \
        || log "WARN: remote prune failed (continuing)"
      ;;
    rclone)
      log "pruning artifacts older than ${RETENTION_DAYS} days on remote"
      rclone delete "${BACKUP_RCLONE_REMOTE}/" \
        --min-age "${RETENTION_DAYS}d" \
        --include "grigteo-backup-*.tar.gz.age" \
        || log "WARN: remote prune failed (continuing)"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  preflight
  mkdir -p "${STAGING}/minio" "${ARTIFACT_DIR}"

  dump_postgres
  mirror_minio
  pack_and_encrypt

  upload
  prune

  log "DONE: ${ARTIFACT_NAME} ($(du -h "${ARTIFACT_DIR}/${ARTIFACT_NAME}" | cut -f1))"
}

main "$@"
