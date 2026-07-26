# Restore procedure

This documents how to restore from a backup produced by
`deploy/backup.sh` (run nightly by `grigteo-backup.timer`) or from a
pre-deploy snapshot under `backups/`.

**Read this once before you need it.** Rehearse a restore at least once
(see [Restore drill](#restore-drill)) — an untested backup is not a backup.

---

## 0. What is in a backup artifact

Each nightly run produces one file:

```
grigteo-backup-YYYYmmddTHHMMSSZ.tar.gz.age
```

It is `age`-encrypted. Decrypting (with the **private** key kept off-box in
your password manager) yields a gzipped tarball containing:

| Path                         | Contents                                    |
|------------------------------|---------------------------------------------|
| `postgres-<ts>.sql.gz`       | `pg_dump` of the `grigteo` database         |
| `minio/grig-teo-media/...`   | mirror of the **public** bucket             |
| `minio/grig-teo-media-private/...` | mirror of the **private** bucket     |
| `MANIFEST.txt`               | sizes, object counts, timestamp             |

Pre-deploy snapshots (created automatically by `deploy.sh` before every
rebuild) are plain gzipped SQL dumps:

```
/opt/grig-teo-space/backups/pre-deploy-<ts>.sql.gz   (last 5 kept)
```

---

## 1. Obtain the private key

The VPS only ever holds the **public** key (`BACKUP_AGE_RECIPIENTENT`).
The private half must already be in your password manager as a file, e.g.
`backup-key.txt`, whose contents look like:

```
# created: 2026-...
# public key: age1...
AGE-SECRET-KEY-1...
```

If you lose this file you **cannot** restore — keep redundant copies.

---

## 2. Decrypt + unpack a nightly artifact

Do this on a trusted machine (your laptop), not necessarily on the VPS:

```bash
mkdir restore && cd restore
# replace <ARTIFACT> with the file you fetched from the off-box target
age -d -i ~/backup-key.txt < grigteo-backup-20260726T030000Z.tar.gz.age \
  | tar -xzf -

ls -la
# -> postgres-20260726T030000Z.sql.gz  minio/  MANIFEST.txt
cat MANIFEST.txt
```

(Pre-deploy snapshots skip this step — they are already plain gzipped SQL.)

---

## 3. Restore Postgres

### Full restore (disaster recovery, clean database)

This wipes and rebuilds the `grigteo` database from the dump. The dump
already contains `DROP ... IF EXISTS` statements (`--clean --if-exists`),
so it is safe to run against a partially-populated DB too.

On the VPS, with the stack up:

```bash
cd /opt/grig-teo-space
gunzip -c restore/postgres-*.sql.gz \
  | docker compose -f docker-compose.prod.yml exec -T db \
      psql -U grigteo -d grigteo
```

### Point-in-time rollback before a bad deploy

`deploy.sh` takes a `pre-deploy-<ts>.sql.gz` snapshot before every rebuild.
If a code change + `synchronize: true` mangled the schema, roll back to the
last-good snapshot:

```bash
cd /opt/grig-teo-space
LATEST=$(ls -1t backups/pre-deploy-*.sql.gz | head -1)
echo "restoring $LATEST"
# stop the backend so it doesn't fight the schema mid-restore
docker compose -f docker-compose.prod.yml stop backend
gunzip -c "$LATEST" \
  | docker compose -f docker-compose.prod.yml exec -T db \
      psql -U grigteo -d grigteo
docker compose -f docker-compose.prod.yml start backend
```

### Verify row counts

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U grigteo -d grigteo -c "
    SELECT 'health_reading'  AS t, count(*) FROM health_reading
    UNION ALL SELECT 'health_document', count(*) FROM health_document
    UNION ALL SELECT 'health_document_page', count(*) FROM health_document_page
    UNION ALL SELECT 'health_note', count(*) FROM health_note
    UNION ALL SELECT 'media_item', count(*) FROM media_item;
  "
```

---

## 4. Restore MinIO objects

`mc` mirrors are plain directory trees. To push them back into MinIO, run `mc`
on the project network (same trick `backup.sh` uses):

```bash
cd /opt/grig-teo-space
# load creds
set -a; . .env.production; set +a

NET=$(docker inspect \
  "$(docker compose -f docker-compose.prod.yml ps -q db)" \
  -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')

docker run --rm \
  --network "$NET" \
  -e "MC_HOST_src=http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  -v "$(pwd)/restore/minio:/import:ro" \
  --entrypoint sh minio/mc:latest -c '
    set -e
    mc mirror --overwrite /import/grig-teo-media         src/grig-teo-media
    mc mirror --overwrite /import/grig-teo-media-private  src/grig-teo-media-private
  '
```

`--overwrite` makes this idempotent — safe to re-run. To restore a single
object instead of everything, use `mc cp /import/<path> src/<bucket>/<path>`.

### Verify a private object re-downloads

Private-bucket objects are only served through the device-key-guarded proxy:

```bash
# from a machine with the DEVICE_API_KEY
ID=<media-item-id>
curl -fsS -H "X-Device-Key: $DEVICE_API_KEY" \
  "https://grig-teo.space/api/media/${ID}/file" -o /tmp/restored.bin
file /tmp/restored.bin
```

---

## 5. Restore into a totally fresh VPS (complete disaster)

1. Provision a new box and run the normal deploy
   (`ssh-add ~/.ssh/politrack_vps_ed25519; VPS_HOST=... bash deploy/deploy.sh`).
2. After it is up, follow **§3** (Postgres) and **§4** (MinIO) above against
   the new `db`/`minio` containers.
3. Confirm row counts and a private-object download match the source.

The `.env.production` on the new box will have **new** generated secrets
(`POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `DEVICE_API_KEY`, …). The
restored SQL dump uses `--no-owner`, so role/password mismatches don't
matter for the data — but the iOS app / Telegram bot must be re-pointed at
the new `DEVICE_API_KEY`, and MinIO creds must match what the backend reads
from `.env.production` (they will, since both come from the same file).

---

## Restore drill

A restore is only trustworthy if you have actually done it once. The repo
ships an automated end-to-end rehearsal that proves the whole pipeline:

```bash
bash deploy/restore-drill.sh
```

It spins up throwaway Postgres + MinIO containers, seeds them, runs the exact
backup pipeline (`pg_dump` + `mc mirror` + `tar | age`), restores into **fresh**
containers, and asserts row counts + object contents match. Requires `docker`
and `age`/`age-keygen` on PATH. Run it whenever you change `backup.sh`, rotate
the encryption key, or just to be sure.

It does **not** exercise the off-box upload (rsync/rclone) — verify that
separately by listing the remote target for the artifact after a real nightly
run, and by fetching + decrypting one artifact on a laptop.

### Drill log

| Date       | Artifact | health_reading | health_document | media_item | Result |
|------------|----------|----------------|-----------------|------------|--------|
| 2026-07-26 | drill (synthetic) | 3 = 3 ✓ | 2 = 2 ✓ | 2 = 2 ✓ + reading value 36.6 ✓, public + private objects intact ✓ | **PASSED** |

*(Re-run `deploy/restore-drill.sh` after any change and append a row here.)*
