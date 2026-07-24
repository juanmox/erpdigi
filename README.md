# Digitexsa ERP

Monorepo del ERP nuevo de Digitexsa (Guatemala). Ver el plan de arquitectura completo para el
contexto, las fases y las decisiones tomadas.

**Importante**: este repo es independiente de `01_erp` (el sistema actual de recetas/cotización).
`01_erp` sigue funcionando sin cambios durante todo el desarrollo de este ERP nuevo — no se
retira hasta que todos los módulos aquí estén completos (ver Fase 5 del plan).

## Stack

- **Backend** (`apps/api`): NestJS + TypeScript + Prisma (Postgres, schemas separados por
  módulo/bounded context).
- **Frontend** (`apps/web`): React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui (base
  Radix).
- **Monorepo**: pnpm workspaces + Turborepo.
- **Infraestructura**: Docker Compose solo para desarrollo local (Postgres 18 + Redis).
  Producción usa PM2 + `git pull`, igual que `01_erp`.

## Requisitos

- Node 24.x LTS (ver `.nvmrc`; usar `nvm4w` si ya lo tenés instalado: `nvm use`).
- pnpm (vía `corepack enable`).
- Docker Desktop (solo para levantar Postgres/Redis locales).

## Primeros pasos

```bash
cp .env.example .env          # ajustar valores si hace falta
docker compose -f infra/docker/docker-compose.dev.yml up -d
pnpm install
pnpm dev                       # levanta apps/api y apps/web en paralelo (Turborepo)
```

## Estructura

```
apps/api        # NestJS — un solo proceso, monolito modular
apps/web        # React + Vite
packages/       # config, shared-types, shared-utils
infra/docker/   # docker-compose para desarrollo local
scripts/        # utilidades (seeds, dumps de BD para desarrollo)
docs/           # documentación de arquitectura y módulos
```

## Roadmap

Ver el plan de arquitectura para el detalle completo de fases (Core/Plataforma → migración de
`recetas` → Inventario/Compras/Ventas/Contabilidad → RRHH/Producción/Reportes → corte final).
