# CLAUDE.md — Digitexsa ERP (monorepo nuevo)

## Qué es este proyecto
ERP completo nuevo para Digital Textil, S.A. (Digitexsa), Guatemala — fabricante de uniformes
deportivos. Reemplaza gradualmente al sistema actual (`01_erp`, en
`C:\Users\PETER\Documents\Jmox\01_erp`), que sigue funcionando 100% intacto y en producción
mientras tanto. **No se toca `01_erp` bajo ninguna circunstancia hasta el corte final (Fase 5),
cuando TODOS los módulos de este ERP nuevo estén completos** — no solo el módulo `recetas`.

Repo independiente en `C:\dev\digitexsa-erp` (fuera de `Jmox`, que está sincronizado por Google
Drive for Desktop — un monorepo pnpm+Turborepo genera demasiados archivos para sincronizar ahí
sin riesgo). Cada módulo de negocio nuevo (Inventario, Compras, Ventas, Contabilidad, RRHH,
Producción, Reportes) se construye aquí desde cero, con `recetas` ya migrado como el primer
módulo de referencia — ver "Convenciones heredadas de `recetas`" más abajo.

## Pendiente ahora mismo (arrancar por acá)
Esto quedó decidido en una sesión de Claude Code que corrió por error dentro de `01_erp` en vez
de acá (de ahí este archivo) — dos tareas de UI aprobadas conceptualmente:

1. ✅ **Pantalla de inicio post-login** — completada. `/` ahora muestra `InicioPage`
   (`apps/web/src/features/inicio/inicio-page.tsx`) con sidebar de navegación
   (`apps/web/src/app/sidebar.tsx`, reemplaza el nav superior que tenía `shell.tsx`), franja de 3
   KPIs reales (productos activos + cliente principal vía `recetas/productos` y `recetas/filtros`,
   cotizaciones del mes vía `recetas/cotizaciones`, tipo de cambio vía `recetas/tipo-cambio`) y el
   mosaico de los 8 módulos del roadmap (metadata única en `apps/web/src/app/modulos.ts`, usada
   también por el sidebar). La Cotización se movió de `/` a `/recetas`; `/catalogo` (Gestión de
   datos) no cambió de ruta. Paleta de marca (`--accent-brand` = `#203080` y variantes) agregada
   en `apps/web/src/index.css` como tokens **separados** de `--primary`/`--secondary` — no toca el
   resto de la UI (Cotización, Catálogo) hasta que se confirme la dirección de marca definitiva
   para el login (ítem 2). Verificado visualmente con Playwright (login real, admin seed) contra
   los tres KPIs con datos reales — no hay pantalla en blanco ni 401 nuevos.
2. ✅ **Rediseño de la pantalla de login** — completada
   (`apps/web/src/features/auth/login-page.tsx`). Panel dividido: foto a pantalla completa a la
   izquierda (`object-cover`, degradado oscuro + filo diagonal dorado de acento) con placa blanca
   del logo real (`apps/web/src/assets/logo-digitexsa.png`) sobrepuesta abajo; formulario a la
   derecha. **⚠️ La foto actual (`apps/web/src/assets/Football.png`) es temporal/de prueba — muestra
   de forma visible el escudo de la NFL (marca registrada de terceros) y no es una foto real de
   Digitexsa. NO debe quedar en ningún build que se comparta ni en producción** — sustituir por una
   foto propia de uniformes deportivos de Digitexsa antes de eso (mismo tratamiento visual ya
   sirve, solo cambiar el import en `login-page.tsx`). Paleta resuelta sin abandonar el azul
   corporativo: se le
   mostraron 3 opciones de acento cálido (Dorado Varsity / Naranja Cancha / Coral Deportivo, mismo
   patrón "azul intacto + acento secundario más vivo") en un artifact comparador
   (https://claude.ai/code/artifact/917fde98-d3e5-4eaa-bf25-bb4c4233b29d) y el usuario eligió
   **Dorado Varsity** (`#c08a25`, token `--accent-warm` en `index.css`) — el azul (`--accent-brand`)
   sigue siendo el color del botón primario; el dorado marca el logo, el foco de campos y detalles
   secundarios. Se omitieron a propósito "Recordarme" y "¿Olvidaste tu contraseña?" (el backend no
   tiene flujo de recuperación de contraseña ni remember-me persistente — si se quiere esa
   funcionalidad, es un alcance nuevo, no parte de este rediseño). El pie muestra "Empresa: Digital
   Textil, S.A." como etiqueta fija, no selector — la selección real de empresa multi-tenant sigue
   pasando después del login vía `SeleccionarEmpresa`, sin cambios. Verificado con Playwright: login
   real contra el backend (usuario admin del seed) llega al panel de inicio sin errores nuevos en
   consola, y el layout responsive (imagen oculta, solo formulario) se probó en viewport móvil.

## Indexación con codebase-memory MCP
**Este repo debe estar indexado con las herramientas de `codebase-memory-mcp` antes de explorar
código en él.** Al empezar cualquier sesión de trabajo aquí:
1. Verificar con `index_status` / `list_projects` si `digitexsa-erp` ya está indexado.
2. Si no lo está (o el índice quedó desactualizado tras cambios grandes), correr
   `index_repository` sobre `C:\dev\digitexsa-erp` antes de usar `search_graph`,
   `trace_path`, `get_code_snippet`, etc.
3. Preferir esas herramientas (graph-augmented) sobre Grep/Glob a mano para explorar
   relaciones entre módulos NestJS, llamadas cross-service o el grafo de dependencias del
   monorepo — son más precisas para un monorepo con Turborepo + Prisma multi-schema.

## Stack
- **Monorepo**: pnpm workspaces + Turborepo. Node 24.x LTS (vía `nvm4w`).
- **`apps/api`**: NestJS. Prefijo global `erp/api`, puerto `4000`. Prisma **7** con
  **driver adapters** (`@prisma/adapter-pg`, `PrismaPg`) — la URL de conexión NO va en el
  bloque `datasource` del schema, sino en `prisma.config.ts` (`env('DATABASE_URL')`) y en el
  `PrismaClient` en runtime.
- **`apps/web`**: React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui (base Radix vía el
  paquete unificado `radix-ui`). Alias `@/*` → `src/*`. Vite `base: '/erp'` (sin slash final —
  con slash final rompe rutas raíz en el dev server, ver gotchas). Puerto dev `5173`, con proxy
  de `/erp/api` → `localhost:4000`.
- **`packages/config`**: prettier/tsconfig compartidos.
- **`packages/shared-types`**: DTOs compartidos web↔api (aún creciendo).
- **`packages/shared-utils`**: formato de moneda GTQ/USD (conversión nativa GTQ para costos, USD
  para precio de venta — ver regla heredada más abajo), fechas en zona `America/Guatemala`.
- **Infra**: `infra/docker/docker-compose.dev.yml` — Postgres 18 (puerto **5433**, no 5432: esta
  máquina ya tiene un Postgres nativo en 5432 fuera de Docker) + Redis 7 (6379). Solo para
  desarrollo local. Producción sigue con PM2 + `git pull`, igual que `01_erp`.

## Comandos
Desde la raíz del repo (Turborepo resuelve el grafo de dependencias entre paquetes):
- `pnpm install` — tras cualquier cambio en algún `package.json`.
- `pnpm dev` — levanta `apps/api` (`nest start --watch`) y `apps/web` (`vite`) en paralelo.
- `pnpm build` / `pnpm lint` / `pnpm typecheck` / `pnpm test` — corren en los 5 paquetes.
- `docker compose -f infra/docker/docker-compose.dev.yml up -d` — Postgres + Redis locales.
  **Orden para levantar el entorno local desde cero**: (1) Docker Desktop corriendo, (2) el
  comando de arriba (Postgres/Redis de este proyecto — si en `docker ps` aparecen contenedores
  `appwrite-*`, son de otro proyecto en la misma máquina, ignorarlos), (3) `pnpm dev` desde la
  raíz. Si `pnpm dev` tira `ECONNREFUSED` hacia Postgres, es el paso (1)/(2) que falta, no un bug
  de código.
- `pnpm --filter @digitexsa-erp/api exec prisma db seed` — siembra roles/permisos/empresa/admin
  (ver `apps/api/prisma/seed.ts`; usuarios de prueba adicionales — cotizador/editor — no están en
  el seed, se crean/resetean ad-hoc en la BD local cuando hace falta verificar algo).
- `.env` (raíz de `apps/api`, nunca se commitea) — ver `.env.example` para las variables:
  `DATABASE_URL`, `JWT_SECRET`, `PORT`, `TC_FALLBACK`, `COOKIE_SECURE`,
  `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` opcionales.

## Despliegue a producción
Decidido con el usuario (2026-08-03): **mismo servidor físico que `01_erp`** (Ubuntu interno,
`192.168.2.13`, sin dominio público ni SSL — solo red interna, por ahora) y **misma base de
datos** (`erpdb`) — un solo Postgres para todo el ERP, no una base separada por sistema. Es la
misma filosofía que ya usa `01_erp` ("compartiendo la misma base para permitir JOINs y un solo
backup") y la misma que ya sigue este repo con schemas por dominio (`core`, `recetas`, y los que
se agreguen) — **no hace falta ningún cambio de arquitectura**, solo desplegar sobre lo que ya
existe.

- **Un solo proceso PM2** (`digitexsa-api`, ver `ecosystem.config.js` en la raíz) — el frontend
  (`apps/web`) no necesita proceso propio, se sirve como estáticos vía Nginx directo desde
  `apps/web/dist/` (build de Vite, `base: '/erp'` ya configurado para esto). Referencia de la
  config de Nginx a agregar junto a la que ya proxea `01_erp` a `:3000`:
  `infra/nginx/digitexsa-erp.conf.example`.
- **Deploy**: `scripts/deploy.sh` — mismo espíritu que el `git pull` + `pm2 restart` de `01_erp`,
  con los pasos extra que este monorepo sí necesita: `pnpm install`, `prisma migrate deploy`,
  build de `api` y `web`, luego `pm2 restart digitexsa-api`.
- **Migraciones seguras sobre la base compartida**: solo existe una migración de Prisma hasta
  ahora (`20260723234653_init_core`) y **no toca el schema `recetas`** — ese schema se introspectó
  con `prisma db pull` y Prisma no lo gestiona por migraciones, así que `prisma migrate deploy`
  nunca va a intentar recrear ni tocar las tablas de `recetas` que ya usa `01_erp` en producción.
  Igual, antes del primer `migrate deploy` contra la base real, hacer un backup de `erpdb` — es la
  primera vez que corre ahí.
- **`.env` de producción**: copiar `apps/api/.env.example`, usar un `JWT_SECRET` propio (no el de
  dev), un usuario de Postgres propio de la app nueva (no reusar `erpadmin` de `01_erp`), un
  `PORT` libre (sugerido `4001`, ya que `01_erp` ocupa `3000`), y **`COOKIE_SECURE=false`
  obligatorio** mientras no haya HTTPS — si se deja que siga a `NODE_ENV=production` por defecto,
  el cookie de refresh token se marca `Secure` y el navegador nunca lo reenvía por HTTP plano,
  rompiendo el login en producción.
- **Datos de prueba**: antes de dar por lista la migración, limpiar cualquier dato de prueba que
  haya quedado en la base compartida durante desarrollo (ej. insumos `TEST-PW-*` ya borrados el
  2026-08-03 — revisar si hay más con otros prefijos, como `TEST-001`, encontrado pero no borrado
  a propósito por no estar confirmado con el usuario).

## Arquitectura
Monolito modular pragmático (sin CQRS, sin DDD táctico pesado, sin microservicios — equipo de
una persona). Multi-empresa real desde el día uno, multi-moneda real a nivel de libro contable,
sin i18n (todo en español).

- `apps/api/src/modules/` — un módulo NestJS por área de negocio: `auth`, `empresas`, `usuarios`,
  `roles-permisos`, `auditoria`, `recetas-*` (tipo-cambio, referencias, insumos, productos,
  cotizaciones — ya migrado, ver abajo), y los que se vayan agregando (`inventario`, `compras`,
  `ventas`, `contabilidad`, `rrhh`, `produccion`, `reportes`).
- `apps/api/prisma/schema/` — **un archivo `.prisma` por schema de Postgres**
  (`datasource.prisma` con el arreglo `schemas = [...]`, `core.prisma`, `recetas.prisma`, y los
  que se agreguen). Los schemas ya existentes en Postgres (como `recetas`) se introspectan con
  `prisma db pull` — no se transcriben a mano — y luego se renombran los campos a camelCase +
  `@map`/`@@map` para que combinen con la convención del resto. Vistas de solo lectura (como
  `v_producto_costo`) se mapean con la preview feature `views` de Prisma.
- `apps/web/src/features/` — un directorio por pantalla/dominio (`auth`, `recetas` = cotización,
  `catalogo` = gestión de datos de recetas, y los que se agreguen). Componentes verdaderamente
  genéricos van en `apps/web/src/components/shared/` (ej. `AutocompleteBuscador`,
  `ImportPreviewDialog`); primitivos de shadcn/ui sin modificar van en `components/ui/`.

## Autenticación y permisos (RBAC)
- JWT de acceso (15 min, claims `{sub, email, idEmpresa, roles, permisos}`) + refresh token
  **opaco** (no JWT) de 30 días, hasheado (SHA-256) en `refresh_tokens`, cookie httpOnly
  `path=/erp/api/auth`. Rotación en cada refresh; reutilizar un refresh ya rotado/revocado
  revoca toda la sesión (detección de robo de token).
- Guards globales vía `APP_GUARD`: `JwtAuthGuard` (bloquea todo por defecto; `@Public()` para
  login/refresh) + `PermissionsGuard` (`@RequirePermissions('codigo.punto.accion')`, a nivel de
  método o de controller completo).
- **⚠️ Hallazgo de seguridad pendiente de decisión, NO corregido todavía**:
  `PermissionsGuard` (`apps/api/src/modules/auth/guards/permissions.guard.ts`) hace **fail-OPEN**
  — si un endpoint no lleva `@RequirePermissions(...)`, el guard deja pasar a cualquier usuario
  autenticado en vez de bloquear por defecto. Hoy no es explotable (se auditaron uno por uno los
  ~30 endpoints de `recetas` y todos llevan el decorador), pero es un diseño riesgoso de cara a
  la confidencialidad — un futuro endpoint sin decorador quedaría abierto sin que nadie lo note.
  Antes de agregar muchos más módulos (Fase 3+), vale la pena decidir con el usuario si conviene
  invertirlo a fail-closed (requerir algo explícito, ej. `@Public()`, para lo que de verdad no
  necesita permiso).
- Frontend: `AuthProvider`/`useAuth` (`apps/web/src/features/auth/auth-context.tsx`) — access
  token SOLO en memoria (nunca `localStorage`), refresh silencioso al montar la app. `apiFetch`
  (`src/lib/api.ts`) reintenta una vez con refresh automático si recibe 401.
- **Gestión de contraseñas: solo el admin, no autoservicio.** Decisión explícita del usuario: no
  hay pantalla de "cambiar mi contraseña" ni recuperación por email — el único camino es el
  módulo `/usuarios` (`apps/web/src/features/usuarios/`, backend en
  `apps/api/src/modules/usuarios/`), donde un usuario con `plataforma.usuarios.administrar` puede
  crear usuarios, gestionar sus roles, activar/desactivar y **establecer la contraseña de
  cualquiera, incluida la propia** (`PATCH /usuarios/:id/password`). Ese endpoint revoca todas las
  sesiones activas del usuario afectado (mismo patrón que la detección de robo de refresh token en
  `auth.service.ts`) — si el admin se resetea su propia contraseña, el frontend
  (`components/modal-password.tsx`) hace `logout()` + redirect a `/login` de inmediato en vez de
  esperar a que el access token expire solo. Guardas anti-bloqueo en el backend: un admin no puede
  desactivarse a sí mismo ni quitarse su propio rol que otorga `plataforma.usuarios.administrar`
  (si no, un error de un click podría dejar el sistema sin ningún admin, sin más recuperación que
  tocar la base directamente).

## Convenciones heredadas de `recetas` (aplican a TODO el ERP, no solo a ese módulo)
`recetas` (Fase 2, ya migrado y committeado) es el módulo de referencia — cualquier módulo nuevo
debería parecerse a su estructura y respetar las mismas reglas:
1. **Cálculos y totales siempre en el servidor**; nunca confiar en datos que mande el cliente.
2. Costos nativos en GTQ; precio de venta nativo en USD. Conversión solo en presentación
   (`convertirMonto` vs `convertirPrecioVenta` en `packages/shared-utils` — son distintas a
   propósito, no intercambiables). % costo/margen siempre comparado en USD.
3. Histórico inmutable vía snapshot cuando aplique (ej. cotizaciones): al guardar, congelar una
   copia completa, no referencias vivas. Editar catálogos es "hacia adelante"; nunca altera
   registros históricos ya guardados.
4. Nunca borrado físico salvo excepciones explícitas ya aprobadas (ej. líneas de receta
   individuales) — el resto usa `activo=false`.
5. Un schema de Postgres por dominio/bounded context (nunca todo en `public`), introspectado con
   `prisma db pull`, no escrito a mano.
6. Rutas API bajo `/erp/api/<dominio>/...`, con permisos `<dominio>.<recurso>.<accion>` — ver
   tabla de roles en `apps/api/prisma/seed.ts` para el patrón (Cotizador/Editor/Admin como
   ejemplo de granularidad ver/crear/editar/desactivar/importar).
7. Patrón **preview → aplicar** para cualquier import masivo desde Excel: endpoint de preview de
   solo lectura (valida y marca errores por fila) + endpoint de aplicar transaccional
   (`prisma.$transaction`), reutilizando `apps/web/src/components/shared/import-preview-dialog.tsx`
   en el frontend.
8. Modales/diálogos: usar shadcn `Dialog` — **cuidado con `Card` de shadcn**, que trae
   `overflow-hidden` por defecto (para redondear bordes); si un `Card` contiene un elemento con
   contenido flotante (autocompletar, tooltip, dropdown posicionado `absolute`), hay que
   sobreescribir con `className="overflow-visible"` en ese `Card` puntual o el contenido flotante
   queda recortado visualmente aunque exista en el DOM (bug real ya encontrado y corregido en la
   pantalla de cotización).
9. Impresión vía iframe oculto (`imprimirHTML()`, ver `features/recetas/imprimir.ts`), nunca
   `window.open`.

## Convenciones de nombrado
Igual que `01_erp`: tablas/columnas Postgres en snake_case, PKs `id_tabla`, FKs
`id_tabla_referenciada`. En TypeScript: camelCase para variables/funciones/campos de modelos
Prisma (mapeados con `@map`/`@@map` desde snake_case), UPPER_SNAKE para constantes, rutas API en
minúscula plural.

## Gotchas ya resueltos (no perder tiempo re-descubriéndolos)
- **Prisma 7**: sin driver adapter (`@prisma/adapter-pg`) el `PrismaClient` no conecta — no es
  suficiente con poner `url` en el schema como en Prisma 6.
- **Postgres 18+ en Docker**: el volumen debe montarse en `/var/lib/postgresql` (no
  `/var/lib/postgresql/data`), o el contenedor entra en crash-loop.
- **Puerto de Postgres local**: 5433, no 5432 (esta máquina ya tiene un Postgres nativo ahí). Si
  algo falla con "autenticación fallida" en local, verificar que no se esté conectando al
  Postgres nativo por error.
- **Vite `base`**: debe ser `/erp` (sin slash final). Con slash final, el dev server devuelve 404
  en la ruta raíz sin slash, y React Router normaliza ahí — 404 después de cada login.
- **`shadcn add <componente>`**: escribe los archivos en una carpeta literal `@/` en vez de
  resolver el alias — hay que mover manualmente a `src/components/ui/` después de cada uso, y
  puede hacer falta `pnpm add radix-ui` a mano si el componente usa un primitivo nuevo.
- **Componentes shadcn con variantes Tailwind rotas**: `tabs.tsx`, `dialog.tsx`, `select.tsx` y
  `checkbox.tsx` traían clases como `data-active:`, `data-open:`, `data-horizontal:` que nunca
  coinciden con lo que Radix realmente expone (`data-state="active|open|..."`,
  `data-orientation="horizontal|vertical"`, par clave=valor). Ya corregidas a
  `data-[state=active]:`, `data-[orientation=horizontal]:`, etc. Si agregas un componente shadcn
  nuevo, revisar que no tenga el mismo problema (buscar `data-` seguido de una palabra sin
  corchetes, sin ser un atributo booleano real de Radix como `data-disabled`/`data-placeholder`).
- **Ancho de `DialogContent` no se deja sobreescribir**: el default traía `sm:max-w-sm`, y un
  `className="max-w-2xl"` pasado por un consumidor NO lo vencía (twMerge no considera
  conflictivas dos utilidades `max-w-*` si una lleva prefijo de variante y la otra no — ganaba la
  responsive por orden de cascada). Ya corregido quitando el prefijo `sm:` del default.
- **`ImportPreviewDialog`** (`components/shared/import-preview-dialog.tsx`) y `AutocompleteBuscador`
  (`components/shared/autocomplete-buscador.tsx`) son genéricos y reutilizables — antes de crear
  un buscador o un flujo de import nuevo, revisar si estos ya sirven.

## Roadmap de fases
- **Fase 0** — scaffold del monorepo. ✅ completada.
- **Fase 1** — Core/Plataforma (empresas, usuarios, roles/permisos, login JWT, monedas/tasas,
  auditoría). ✅ completada.
- **Fase 2** — migración completa de `recetas` (backend NestJS + frontend cotización/gestión de
  datos). ✅ completada y committeada (commits en el historial de este repo). `01_erp` sigue
  intacto y en producción durante toda esta fase — no hubo corte de tráfico.
- **Fase 3** — Inventario → Compras → Ventas/Contabilidad (nota: Guatemala requiere
  certificación **FEL** vía un Certificador autorizado para facturación legalmente válida —
  decisión de negocio pendiente, diseñar tolerante a asincronía con BullMQ/Redis). **Siguiente
  fase a iniciar.**
- **Fase 4** — RRHH, Producción, Reportes.
- **Fase 5** — corte final: solo cuando TODOS los módulos anteriores estén completos y validados,
  apagar `01_erp` y **borrar su repositorio** (no archivar).

## Flujo de trabajo
- Cambios pequeños y verificables; probar en local (curl + Playwright para UI) antes de dar por
  terminado. Para pantallas nuevas, verificar visualmente en navegador, no solo con
  lint/typecheck/build.
- Mensajes de commit **siempre en español correcto, con tildes**.
- Pedir confirmación antes de cambios grandes o destructivos (migraciones, borrados, tocar
  `01_erp`, desplegar a producción).
- No inventar requisitos: si algo es ambiguo, preguntar.
