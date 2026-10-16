#!/bin/sh
# =============================================================================
# Copia el .env de produccion (credencial Jenkins tipo "Secret file") a
# deploy/.env normalizando BOM UTF-8 y CRLF, por si el archivo se creo en
# Windows. Un \r pegado al final de una linea rompe el valor (p. ej. la
# contrasena de la base de datos).
#
# Uso: sh deploy/prepare-env.sh <origen> <destino>
# =============================================================================
set -eu

src="${1:?falta el archivo origen}"
dst="${2:?falta la ruta destino}"

install -m 600 "$src" "$dst"

# Quita el BOM UTF-8 si esta presente.
sed -i '1s/^\xEF\xBB\xBF//' "$dst"

# Quita el \r final de cada linea (CRLF -> LF).
sed -i 's/\r$//' "$dst"
