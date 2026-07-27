#!/usr/bin/env bash
# Ripristino del database da un backup.
#
#   ./scripts/restore.sh ~/backups/mezzi/mezzi-20260727-120000.db.gz
#
# Ferma l'app, mette da parte il database attuale, rimette quello del backup, riavvia.
# Il database di prima non viene cancellato: resta accanto, con la data, finché non
# sei tu a toglierlo. Un restore sbagliato non deve essere irreversibile.

set -euo pipefail

ARCHIVE="${1:-}"
CONTAINER="${MEZZI_CONTAINER:-mezzi-app}"
COMPOSE_DIR="${MEZZI_DIR:-$HOME/apps/mezzi}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Uso: $0 <backup.db.gz>" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

gzip -dc "$ARCHIVE" > "$WORK/restore.db"

echo "Fermo l'app…"
docker stop "$CONTAINER" >/dev/null

# Il container è fermo: si lavora sul volume con un contenitore usa e getta.
VOLUME="$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}')"

docker run --rm -v "$VOLUME:/data" -v "$WORK:/restore" alpine sh -c "
  set -e
  # Il database di prima resta lì, con la data: si può sempre tornare indietro.
  [ -f /data/mezzi.db ] && mv /data/mezzi.db /data/mezzi.db.pre-restore-$STAMP
  rm -f /data/mezzi.db-wal /data/mezzi.db-shm
  cp /restore/restore.db /data/mezzi.db
  chown 1001:1001 /data/mezzi.db
"

echo "Riavvio l'app…"
cd "$COMPOSE_DIR"
docker compose -f docker-compose.yml -f docker-compose.server.yml up -d >/dev/null

for _ in $(seq 30); do
  if curl -sf http://127.0.0.1:"${PORT:-8430}"/api/health >/dev/null; then
    echo "Ripristinato da $ARCHIVE."
    echo "Il database precedente è in mezzi.db.pre-restore-$STAMP dentro il volume $VOLUME."
    exit 0
  fi
  sleep 1
done

echo "L'app non risponde dopo il ripristino: controlla 'docker compose logs app'." >&2
exit 1
