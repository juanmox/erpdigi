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

echo "==> git pull"
git pull

echo "==> pnpm install"
pnpm install --frozen-lockfile

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
