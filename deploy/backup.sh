#!/bin/sh
# =============================================================================
# Turnero - respaldo diario (base legacy + imagenes/videos) con retencion.
#
# Se ejecuta desde systemd (deploy/systemd/turnero-backup.timer), 02:30.
# Las credenciales se leen del propio contenedor del API: no hace falta el .env
# ni el compose. Requiere que la imagen del API tenga el cliente de MySQL
# (deploy/Dockerfile.api instala default-mysql-client).
#
# Configuracion opcional en /etc/default/turnero-backup:
#   DEST=/var/backups/turnero
#   RETENCION_DIAS=14
# =============================================================================
set -u

PROYECTO=${PROYECTO:-turnero}
DEST=${DEST:-/var/backups/turnero}
RETENCION_DIAS=${RETENCION_DIAS:-14}
STAMP=$(date +%Y%m%d-%H%M)

[ -f /etc/default/turnero-backup ] && . /etc/default/turnero-backup
WEBHOOK=${ALERT_WEBHOOK_URL:-}

mkdir -p "$DEST" || exit 1
LOG="$DEST/backup.log"

log() {
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG" 2>/dev/null
}

alert() {
    [ -n "$WEBHOOK" ] || return 0
    curl -fsS -m 10 -H 'Content-Type: application/json' \
        -d "{\"text\": \"[turnero] $*\"}" "$WEBHOOK" >/dev/null 2>&1 || true
}

contenedor() {
    docker ps -q \
        --filter "label=com.docker.compose.project=$PROYECTO" \
        --filter "label=com.docker.compose.service=api" 2>/dev/null | head -n 1
}

api_cid=$(contenedor api)
if [ -z "$api_cid" ]; then
    log "ERROR: el API no esta corriendo; no se puede respaldar"
    alert "el respaldo del turnero fallo: el API no esta corriendo"
    exit 1
fi

env_de() {
    docker exec "$api_cid" printenv "$1" 2>/dev/null | tr -d '\r'
}

DB_HOST=$(env_de DB_HOST)
DB_USER=$(env_de DB_USER)
DB_PASS=$(env_de DB_PASS)
DB_NAME=$(env_de DB_NAME | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
    log "ERROR: faltan credenciales de la base en el contenedor del API"
    alert "el respaldo del turnero fallo: faltan credenciales de la base"
    exit 1
fi

fallo=0

# --- base de datos -----------------------------------------------------------
TMP="$DEST/db-$STAMP.sql"
log "respaldando base $DB_NAME en $DB_HOST"
if docker exec -e MYSQL_PWD="$DB_PASS" "$api_cid" \
    mysqldump --single-transaction --quick --lock-tables=false --no-tablespaces \
        --host="$DB_HOST" --user="$DB_USER" --default-character-set=utf8mb4 \
        "$DB_NAME" >"$TMP" 2>>"$LOG"; then
    if gzip -9 "$TMP" && gzip -t "$DEST/db-$STAMP.sql.gz" 2>>"$LOG"; then
        log "OK: db-$STAMP.sql.gz ($(du -h "$DEST/db-$STAMP.sql.gz" | cut -f1))"
    else
        log "ERROR: el respaldo de la base quedo corrupto"
        rm -f "$DEST/db-$STAMP.sql.gz"
        fallo=1
    fi
else
    log "ERROR: mysqldump fallo"
    rm -f "$TMP"
    fallo=1
fi

# --- imagenes y videos --------------------------------------------------------
if docker exec "$api_cid" tar czf - -C /app/apps/api/public media \
    >"$DEST/media-$STAMP.tar.gz" 2>>"$LOG"; then
    log "OK: media-$STAMP.tar.gz ($(du -h "$DEST/media-$STAMP.tar.gz" | cut -f1))"
else
    log "ERROR: no se pudieron respaldar los medios"
    rm -f "$DEST/media-$STAMP.tar.gz"
    fallo=1
fi

# --- retencion ----------------------------------------------------------------
find "$DEST" -type f \( -name 'db-*.sql.gz' -o -name 'media-*.tar.gz' \) \
    -mtime +"$RETENCION_DIAS" -delete 2>/dev/null

if [ "$fallo" -ne 0 ]; then
    alert "el respaldo diario del turnero fallo; revisar $LOG"
    exit 1
fi

log "respaldo completo"
