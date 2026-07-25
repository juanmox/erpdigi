#!/usr/bin/env bash
# Copia el schema `recetas` (estructura + datos actuales) del servidor real de 01_erp
# al Postgres local de desarrollo (docker-compose.dev.yml), vía pg_dump/pg_restore
# ejecutados DENTRO del contenedor local (que ya trae las herramientas de cliente).
#
# Es de solo lectura contra el servidor real (pg_dump nunca escribe). Autorizado
# explícitamente para copiar el estado actual de recetas (sin datos sensibles todavía).
#
# Uso:
#   RECETAS_REMOTE_PGPASSWORD='...' ./scripts/setup-recetas-dev.sh
# (la contraseña real vive en 01_erp/.env, PGPASSWORD — no se hardcodea acá)

set -euo pipefail

# En Git Bash/MSYS (Windows), argumentos que parecen rutas POSIX absolutas (ej. /tmp/...)
# se traducen automáticamente a rutas de Windows antes de pasarlas a docker.exe. Desactivado
# acá porque esas rutas son DENTRO del contenedor Linux, no del host.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

REMOTE_HOST="${RECETAS_REMOTE_HOST:-192.168.2.13}"
REMOTE_PORT="${RECETAS_REMOTE_PORT:-5432}"
REMOTE_DB="${RECETAS_REMOTE_DB:-erpdb}"
REMOTE_USER="${RECETAS_REMOTE_USER:-erpadmin}"
: "${RECETAS_REMOTE_PGPASSWORD:?Falta RECETAS_REMOTE_PGPASSWORD (ver 01_erp/.env, variable PGPASSWORD)}"

LOCAL_CONTAINER="${RECETAS_LOCAL_CONTAINER:-docker-postgres-1}"
LOCAL_DB="${RECETAS_LOCAL_DB:-digitexsa_erp_dev}"
LOCAL_USER="${RECETAS_LOCAL_USER:-digitexsa}"

DUMP_PATH="/tmp/recetas_$(date +%s).dump"

echo "==> Volcando schema 'recetas' desde ${REMOTE_HOST}:${REMOTE_PORT}/${REMOTE_DB} (solo lectura)..."
docker exec -e PGPASSWORD="${RECETAS_REMOTE_PGPASSWORD}" "${LOCAL_CONTAINER}" \
  pg_dump -h "${REMOTE_HOST}" -p "${REMOTE_PORT}" -U "${REMOTE_USER}" -d "${REMOTE_DB}" \
  --schema=recetas -Fc -f "${DUMP_PATH}"

echo "==> Preparando schema/extensión en el Postgres local (desde cero)..."
docker exec "${LOCAL_CONTAINER}" psql -h localhost -U "${LOCAL_USER}" -d "${LOCAL_DB}" \
  -c "DROP SCHEMA IF EXISTS recetas CASCADE;" \
  -c "CREATE SCHEMA recetas;" \
  -c "CREATE EXTENSION pg_trgm SCHEMA recetas;"

echo "==> Restaurando en el Postgres local (${LOCAL_DB}, schema recetas)..."
# El dump trae su propio "CREATE SCHEMA recetas" que choca con el que ya creamos arriba
# (necesario para poder crear la extensión pg_trgm en ese schema antes de restaurar los
# índices que la usan) — ese único error es inofensivo, pg_restore sigue y restaura todo
# lo demás igual. Por eso no cortamos el script por el exit code de este comando puntual;
# la verificación real son los conteos del final.
set +e
docker exec "${LOCAL_CONTAINER}" \
  pg_restore -h localhost -U "${LOCAL_USER}" -d "${LOCAL_DB}" --no-owner "${DUMP_PATH}"
set -e

docker exec "${LOCAL_CONTAINER}" rm -f "${DUMP_PATH}"

echo "==> Listo. Verificando..."
docker exec "${LOCAL_CONTAINER}" psql -h localhost -U "${LOCAL_USER}" -d "${LOCAL_DB}" \
  -c "select count(*) as productos from recetas.productos;" \
  -c "select count(*) as insumos from recetas.insumos;" \
  -c "select count(*) as cotizaciones from recetas.cotizaciones;" \
  -c "select id_producto, costo_unitario from recetas.v_producto_costo limit 1;"
