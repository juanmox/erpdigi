#!/usr/bin/env bash
# Deploy a producción — corre EN el servidor, dentro del checkout del repo.
# Equivalente al "git pull + pm2 restart" de 01_erp, adaptado a un monorepo con
# build (NestJS + Vite) y migraciones reales de Prisma en vez de SQL a mano.
#
# Uso: ./scripts/deploy.sh
# Requiere: apps/api/.env ya configurado (ver apps/api/.env.example), PM2 instalado
# global (`npm i -g pm2`), y que `pm2 start ecosystem.config.js && pm2 save` ya se
# haya corrido una vez antes (primer deploy) para que el proceso `digitexsa-api` exista.

set -euo pipefail

# TODO el cuerpo va dentro de main(), y main se llama en la ÚLTIMA línea. No es
# estilo: este script hace `git pull` de sí mismo, y bash lee el archivo por
# partes a medida que ejecuta, guardando un offset. Si el pull cambia el largo
# del script a mitad de corrida, la siguiente lectura cae en medio de una línea
# y bash ejecuta basura — con `set -e` eso aborta el deploy en cualquier punto,
# incluso entre la migración y el build. Envolver todo en una función obliga a
# bash a parsear el archivo completo ANTES de ejecutar nada, así que el pull ya
# no puede afectar la corrida en curso. La versión nueva del script entra en
# vigor en el siguiente deploy.
main() {
  echo "==> git pull"
  git pull

  echo "==> pnpm install"
  pnpm install --frozen-lockfile

  # `prisma generate` explícito, aunque apps/api ya lo tenga como "postinstall":
  # cuando no hay dependencias nuevas, pnpm reporta "Already up to date" y NO
  # corre los postinstall, así que el cliente de Prisma se queda con el schema
  # viejo. Si la release cambió el schema, el build falla con "Property 'X' does
  # not exist" — pasó en el despliegue de agosto y volvió a pasar el 2026-09-23
  # con `montaje_rollo.desmontado_por`, dejando la migración aplicada pero el
  # build a medias. Correrlo siempre cuesta segundos y quita el modo de falla.
  echo "==> prisma generate"
  pnpm --filter @digitexsa-erp/api exec prisma generate

  echo "==> Migraciones de Prisma (solo agrega/ajusta lo del schema 'core' — nunca toca"
  echo "    'recetas', que ya existe en la base compartida con 01_erp)"
  pnpm --filter @digitexsa-erp/api exec prisma migrate deploy

  echo "==> Build de apps/api y apps/web"
  pnpm --filter @digitexsa-erp/api build
  pnpm --filter @digitexsa-erp/web build

  echo "==> Reiniciando el proceso de la API (el frontend no necesita reinicio, Nginx"
  echo "    sirve directo desde apps/web/dist/, que el build de arriba ya actualizó)"
  pm2 restart digitexsa-api

  echo "==> Listo."
}

main "$@"
