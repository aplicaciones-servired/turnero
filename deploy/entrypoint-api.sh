#!/bin/sh
# =============================================================================
# Entrypoint de la API: refresca el APK del visualizador en el volumen
# 'apk-dist' y luego arranca NestJS.
#
# El volumen nombrado 'apk-dist' persiste entre despliegues, por lo que el
# APK que se descarga desde /caja/ puede quedar desactualizado. Aqui se copia
# siempre la version que viene en la imagen (apk-seed) si es mas nueva.
# =============================================================================
set -e

DEST="/app/apps/display-android/dist/turnero.apk"
SEED="/app/apk-seed/turnero.apk"

if [ -f "$SEED" ]; then
    mkdir -p "$(dirname "$DEST")"
    NEED_COPY=1
    if [ -f "$DEST" ]; then
        # Comparar por tamano + marca de tiempo: si el seed es mas nuevo, copiar.
        SEED_SZ=$(wc -c < "$SEED")
        DEST_SZ=$(wc -c < "$DEST")
        if [ "$SEED_SZ" = "$DEST_SZ" ]; then
            NEED_COPY=0
        fi
    fi
    if [ "$NEED_COPY" = "1" ]; then
        cp -f "$SEED" "$DEST" && echo "[entrypoint] APK actualizado en $DEST"
    fi
fi

cd /app/apps/api
if [ $# -gt 0 ]; then
    exec "$@"
fi
exec node dist/main.js
