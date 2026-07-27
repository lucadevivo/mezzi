#!/usr/bin/env bash
# Backup del database, a caldo, senza fermare l'app.
#
#   ./scripts/backup.sh [cartella]      (default: ~/backups/mezzi)
#
# Usa `.backup` di SQLite, non `cp`: copiare il file mentre l'app scrive dà un
# backup rotto in modo silenzioso, che è il peggior tipo di backup possibile.
# Da mettere in cron: 0 4 * * * /home/luca/apps/mezzi/scripts/backup.sh

set -euo pipefail

DEST="${1:-$HOME/backups/mezzi}"
CONTAINER="${MEZZI_CONTAINER:-mezzi-app}"
RETENTION_DAYS="${MEZZI_BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DEST"

# Il backup nasce dentro il container, sul volume, e poi viene tirato fuori.
docker exec "$CONTAINER" node -e "
  const Database = require('better-sqlite3');
  const db = new Database(process.env.DATABASE_PATH ?? '/app/data/mezzi.db', { readonly: true });
  db.backup('/app/data/backup-tmp.db').then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
"

docker cp "$CONTAINER:/app/data/backup-tmp.db" "$DEST/mezzi-$STAMP.db"
docker exec "$CONTAINER" rm -f /app/data/backup-tmp.db

gzip -f "$DEST/mezzi-$STAMP.db"

# Verifica che quello che abbiamo appena scritto si apra davvero.
if ! gzip -t "$DEST/mezzi-$STAMP.db.gz"; then
  echo "Backup illeggibile: $DEST/mezzi-$STAMP.db.gz" >&2
  exit 1
fi

find "$DEST" -name 'mezzi-*.db.gz' -mtime "+$RETENTION_DAYS" -delete

echo "Backup: $DEST/mezzi-$STAMP.db.gz ($(du -h "$DEST/mezzi-$STAMP.db.gz" | cut -f1))"
