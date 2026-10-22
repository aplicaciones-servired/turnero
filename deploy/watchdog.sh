#!/bin/sh
# =============================================================================
# Turnero - watchdog de produccion (auto-recuperacion + limpieza).
#
# Pensado para ejecutarse cada minuto (systemd timer en deploy/systemd/).
# No necesita el .env ni el compose: trabaja contra los contenedores que llevan
# la etiqueta com.docker.compose.project=turnero, asi que sigue funcionando
# aunque Jenkins borre su copia temporal del .env despues del despliegue.
#
# Que hace:
#   1. Si un contenedor esta "unhealthy" 3 chequeos seguidos, lo recrea/revive.
#   2. Si el API no responde a traves de nginx 3 veces seguidas, reinicia web
#      y api (el caso tipico de "amanecio caido").
#   3. Si la base legacy deja de responder, avisa (no reinicia: no sirve de nada).
#   4. Limpia cache de imagenes/builds una vez por semana (disco lleno = todo caido).
#   5. Rota su propio log y, opcionalmente, manda alertas por webhook.
#
# Configuracion opcional en /etc/default/turnero-watchdog:
#   ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
# =============================================================================
set -u

PROYECTO=${PROYECTO:-turnero}
STATE_DIR=${STATE_DIR:-/var/lib/turnero-watchdog}
LOG_FILE=${LOG_FILE:-/var/log/turnero-watchdog.log}

[ -f /etc/default/turnero-watchdog ] && . /etc/default/turnero-watchdog
WEBHOOK=${ALERT_WEBHOOK_URL:-}

mkdir -p "$STATE_DIR" 2>/dev/null || STATE_DIR=/tmp/turnero-watchdog
if ! touch "$LOG_FILE" 2>/dev/null; then
    LOG_FILE=/tmp/turnero-watchdog.log
fi

log() {
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_FILE" 2>/dev/null
}

alert() {
    [ -n "$WEBHOOK" ] || return 0
    curl -fsS -m 10 -H 'Content-Type: application/json' \
        -d "{\"text\": \"[turnero] $*\"}" "$WEBHOOK" >/dev/null 2>&1 || true
}

contenedor() {
    docker ps -q \
        --filter "label=com.docker.compose.project=$PROYECTO" \
        --filter "label=com.docker.compose.service=$1" 2>/dev/null | head -n 1
}

contador() {
    cat "$STATE_DIR/$1" 2>/dev/null || printf '0'
}

fijar() {
    printf '%s' "$2" >"$STATE_DIR/$1" 2>/dev/null
}

# --- 1. contenedores unhealthy o ausentes ------------------------------------
for svc in api web; do
    cid=$(contenedor "$svc")
    if [ -z "$cid" ]; then
        n=$(( $(contador "$svc.falta") + 1 ))
        fijar "$svc.falta" "$n"
        log "$svc: no hay contenedor en ejecucion (intento $n)"
        if [ "$n" -eq 3 ]; then
            alert "el contenedor $svc no esta corriendo; revisar el servidor"
        fi
        continue
    fi
    fijar "$svc.falta" 0

    estado=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null)
    if [ "$estado" = "unhealthy" ]; then
        n=$(( $(contador "$svc.unhealthy") + 1 ))
        fijar "$svc.unhealthy" "$n"
        log "$svc: unhealthy (intento $n)"
        if [ "$n" -ge 3 ]; then
            log "$svc: reiniciando contenedor unhealthy"
            if docker restart "$cid" >>"$LOG_FILE" 2>&1; then
                alert "el contenedor $svc estaba caido; se reinicio solo"
            else
                alert "el contenedor $svc no responde y no se pudo reiniciar"
            fi
            fijar "$svc.unhealthy" 0
        fi
    else
        fijar "$svc.unhealthy" 0
    fi
done

# --- 2. sonda HTTP a traves de nginx (el camino real del usuario) ------------
web_cid=$(contenedor web)
sonda_ok() {
    [ -n "$web_cid" ] || return 1
    docker exec "$web_cid" wget -qO- -T 5 "http://127.0.0.1$1" >/dev/null 2>&1
}

if sonda_ok "/api/health"; then
    fijar "http.fallos" 0
else
    n=$(( $(contador "http.fallos") + 1 ))
    fijar "http.fallos" "$n"
    log "el API no responde a traves de nginx (intento $n)"
    if [ "$n" -ge 3 ]; then
        log "reiniciando web y api"
        docker restart "$web_cid" $(contenedor api) >>"$LOG_FILE" 2>&1 || true
        alert "el turnero no respondia; se reiniciaron web y api"
        fijar "http.fallos" 0
    fi
fi

# --- 3. base de datos legacy: solo avisar ------------------------------------
if sonda_ok "/api/health/ready"; then
    if [ "$(contador "db.fallos")" -ge 3 ]; then
        log "la base de datos volvio a responder"
        alert "la base de datos del turnero volvio a responder"
    fi
    fijar "db.fallos" 0
else
    n=$(( $(contador "db.fallos") + 1 ))
    fijar "db.fallos" "$n"
    case "$n" in
        3|10|30|60|120)
            log "la base de datos no responde (intento $n)"
            alert "la base de datos del turnero no responde (intento $n)"
            ;;
    esac
fi

# --- 4. limpieza semanal (domingos ~03:00) -----------------------------------
if [ "$(date +%u)" = "7" ] && [ "$(date +%H)" = "03" ] && [ "$(date +%M)" -lt 6 ]; then
    log "limpieza semanal de imagenes y cache de build"
    docker image prune -f --filter "until=168h" >>"$LOG_FILE" 2>&1 || true
    docker builder prune -f --filter "until=168h" >>"$LOG_FILE" 2>&1 || true
fi

# --- 5. rotacion del log ------------------------------------------------------
if [ -f "$LOG_FILE" ] && [ "$(wc -c <"$LOG_FILE" 2>/dev/null || echo 0)" -gt 5242880 ]; then
    tail -n 2000 "$LOG_FILE" >"$LOG_FILE.tmp" 2>/dev/null && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
