#!/usr/bin/env bash
# deploy/restore-drill.sh — automated end-to-end restore rehearsal.
#
# Spins up throwaway Postgres + MinIO containers, seeds them with test data,
# runs the EXACT backup pipeline that deploy/backup.sh uses (pg_dump -> gzip,
# mc mirror of both buckets, tar + age encrypt), then restores into FRESH
# containers and asserts row counts + object contents match.
#
# Run it any time you change backup.sh, swap the encryption key, or just to
# sleep better:
#
#     bash deploy/restore-drill.sh
#
# Requirements: docker, age + age-keygen on PATH. Uses only named Docker
# volumes (no host bind mounts), so it runs identically on a laptop, in CI,
# or on the VPS. Exits non-zero on any mismatch.
#
# NOTE: this proves the *local* restore mechanics. The real nightly backup
# additionally uploads off-box — verify that separately by listing the remote
# target (see deploy/RESTORE.md, "Restore drill").
set -euo pipefail

NET=grigteo-drill-net
DB1=grigteo-drill-db;   DB2=grigteo-drill-db2
MN1=grigteo-drill-minio; MN2=grigteo-drill-minio2
MC=minio/mc:latest
PGIMG=postgres:16-alpine      # also our stage worker (has tar/cat/gzip/sh)
MNIMG=minio/minio:latest
STAGEV=grigteo-drill-stage; RESTV=grigteo-drill-restore
KEY=/tmp/grigteo-drill-key.txt; ART=/tmp/grigteo-drill-backup.tar.gz.age

cleanup() {
  docker rm -f $DB1 $DB2 $MN1 $MN2 >/dev/null 2>&1 || true
  docker network rm $NET >/dev/null 2>&1 || true
  docker volume rm $STAGEV $RESTV >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup
rm -f "$KEY" "$ART"

MU=grigteo-minio; MP=drillminio1234567890ab
MC_URL="http://${MU}:${MP}@minio:9000"
waitpg() { local c=$1; for _ in $(seq 1 40); do docker exec "$c" psql -U grigteo -d grigteo -tAc 'SELECT 1' >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
waitmn() { local c=$1; for _ in $(seq 1 40); do docker exec "$c" sh -c 'curl -fsS http://localhost:9000/minio/health/live' >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }
netof() { docker inspect "$1" -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'; }

echo "=== 1. start source stack ==="
docker network create $NET >/dev/null
docker volume create $STAGEV >/dev/null
docker run -d --rm --name $DB1 --network $NET \
  -e POSTGRES_USER=grigteo -e POSTGRES_PASSWORD=x -e POSTGRES_DB=grigteo $PGIMG >/dev/null
docker run -d --rm --name $MN1 --network $NET --network-alias minio \
  -e MINIO_ROOT_USER=$MU -e MINIO_ROOT_PASSWORD=$MP $MNIMG server /data --console-address ':9001' >/dev/null
if waitpg $DB1 && waitmn $MN1; then echo "    db + minio healthy"; else echo "FAIL: stack did not come up"; exit 1; fi

echo "=== 2. seed source data ==="
docker exec -i $DB1 psql -U grigteo -d grigteo <<'SQL'
CREATE TABLE health_reading  (id serial PRIMARY KEY, value numeric); INSERT INTO health_reading(value)  VALUES (36.6),(36.7),(36.8);
CREATE TABLE health_document (id serial PRIMARY KEY, title text);   INSERT INTO health_document(title) VALUES ('scan-1.pdf'),('scan-2.pdf');
CREATE TABLE media_item      (id serial PRIMARY KEY, storage_key text); INSERT INTO media_item(storage_key) VALUES ('photos/a.jpg'),('videos/b.mov');
SQL
docker run --rm --network $NET -e "MC_HOST_src=$MC_URL" --entrypoint sh $MC -c '
  set -e; mc mb -p src/grig-teo-media src/grig-teo-media-private >/dev/null
  echo "hello-public-12345"    | mc pipe src/grig-teo-media/blog/img.png
  printf "private-photo-67890" | mc pipe src/grig-teo-media-private/2026/secret.jpg
' >/dev/null
echo "    seeded 3 readings / 2 docs / 2 media rows; 1 public + 1 private object"

echo "=== 3. BACKUP pipeline (mirrors deploy/backup.sh) ==="
# 3a. pg_dump -> gzip -> stage volume  (backup.sh: `docker compose exec -T db pg_dump ... | gzip`)
docker exec $DB1 pg_dump -U grigteo -d grigteo --no-owner --clean --if-exists \
  | gzip -c \
  | docker run --rm -i -v ${STAGEV}:/s $PGIMG sh -c 'cat > /s/postgres.sql.gz'
echo "    postgres dump staged"
# 3b. mc mirror both buckets -> stage volume (skip-if-absent, like backup.sh)
docker run --rm --network "$(netof $DB1)" -e "MC_HOST_src=$MC_URL" \
  -v ${STAGEV}:/export --entrypoint sh $MC -c '
    set -eu
    for b in grig-teo-media grig-teo-media-private; do
      if mc ls "src/${b}/" >/dev/null 2>&1; then mc mirror --overwrite --no-color "src/${b}" "/export/minio/${b}"
      else echo "SKIP ${b} (absent)"; fi
    done' >&2
echo "    minio mirrored to stage"
# 3c. manifest
docker run --rm -v ${STAGEV}:/s $PGIMG sh -c '
  { echo "grigteo drill backup"; du -h /s/postgres.sql.gz | awk "{print \"dump:\",\$1}";
    find /s/minio -type f | wc -l | xargs echo "minio files:"; } > /s/MANIFEST.txt'
# 3d. age keypair + tar|age encrypt (recipient-only, exactly like backup.sh)
age-keygen -o "$KEY" 2>/dev/null
RECIPIENT=$(grep -oE 'age1[a-z0-9]+' "$KEY")
docker run --rm -v ${STAGEV}:/s:ro $PGIMG tar -czf - -C /s . | age -r "$RECIPIENT" > "$ART"
echo "    encrypted artifact: $(du -h "$ART" | cut -f1)"

echo "=== 4. RESTORE into FRESH containers ==="
docker volume create $RESTV >/dev/null
# 4a. age decrypt -> untar into restore volume (the RESTORE.md decrypt command)
age -d -i "$KEY" < "$ART" | docker run --rm -i -v ${RESTV}:/r $PGIMG tar -xzf - -C /r
# 4b. fresh postgres + restore
docker run -d --rm --name $DB2 --network $NET \
  -e POSTGRES_USER=grigteo -e POSTGRES_PASSWORD=x -e POSTGRES_DB=grigteo $PGIMG >/dev/null
waitpg $DB2
docker run --rm -v ${RESTV}:/r:ro $PGIMG cat /r/postgres.sql.gz \
  | gunzip -c | docker exec -i $DB2 psql -U grigteo -d grigteo -q
# 4c. fresh minio + mirror restore volume -> buckets
# (stop the SOURCE minio first: both had the `minio` alias on the drill net, so
#  leaving MN1 up would make Docker DNS round-robin between the two.)
docker rm -f $MN1 >/dev/null 2>&1 || true
docker run -d --rm --name $MN2 --network $NET --network-alias minio \
  -e MINIO_ROOT_USER=$MU -e MINIO_ROOT_PASSWORD=$MP $MNIMG server /data --console-address ':9001' >/dev/null
waitmn $MN2
docker run --rm --network "$(netof $DB2)" -e "MC_HOST_src=$MC_URL" \
  -v ${RESTV}:/import:ro --entrypoint sh $MC -c '
    set -e; mc mb -p src/grig-teo-media src/grig-teo-media-private >/dev/null
    mc mirror --overwrite /import/minio/grig-teo-media         src/grig-teo-media        >/dev/null
    mc mirror --overwrite /import/minio/grig-teo-media-private src/grig-teo-media-private >/dev/null' >&2

echo "=== 5. VERIFY ==="
fail=0
chk() { if [ "$2" = "$3" ]; then echo "    [PASS] $1 = $2"; else echo "    [FAIL] $1 got=$2 want=$3"; fail=1; fi; }
N2="$(netof $DB2)"
chk health_reading  "$(docker exec $DB2 psql -U grigteo -d grigteo -tAc 'SELECT count(*) FROM health_reading')"  3
chk health_document "$(docker exec $DB2 psql -U grigteo -d grigteo -tAc 'SELECT count(*) FROM health_document')" 2
chk media_item      "$(docker exec $DB2 psql -U grigteo -d grigteo -tAc 'SELECT count(*) FROM media_item')"      2
chk reading_value   "$(docker exec $DB2 psql -U grigteo -d grigteo -tAc 'SELECT value FROM health_reading WHERE id=1')" 36.6
chk public_object   "$(docker run --rm --network "$N2" -e "MC_HOST_src=$MC_URL" --entrypoint sh $MC -c 'mc cat src/grig-teo-media/blog/img.png')"        "hello-public-12345"
chk private_object  "$(docker run --rm --network "$N2" -e "MC_HOST_src=$MC_URL" --entrypoint sh $MC -c 'mc cat src/grig-teo-media-private/2026/secret.jpg')" "private-photo-67890"
echo
if [ "$fail" -eq 0 ]; then
  echo "RESULT: RESTORE DRILL PASSED — full backup+restore pipeline is sound."
else
  echo "RESULT: DRILL FAILED"; exit 1
fi
