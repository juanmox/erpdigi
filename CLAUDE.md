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

## Costeo Real — módulo nuevo en construcción (Fase 3 adelantada)
Especificación completa en `PROMPT_CLAUDE_CODE.md` (830+ líneas, no se repite aquí), con hallazgos
forenses del sistema legacy en `ANEXO_A_Hallazgos.md` y catálogos semilla en `ANEXO_B_Catalogos.md`
(ruta externa: `C:\Users\PETER\Documents\Jmox\Claude\Formas de recolección de info Costos\`). El
prompt exige trabajar por fases y **detenerse a esperar validación del usuario al terminar cada
una** — no avanzar por iniciativa propia.

- **F0 (validación de supuestos)** — ✅ completada. `docs/00-VALIDACION-SUPUESTOS.md` (respuestas
  S1-S7 contra datos reales, más hallazgos propios no cubiertos por ANEXO_A),
  `docs/01-COBERTURA-PRODUCTOS.md` (solo 4/475 productos legacy existen hoy en `recetas` — bloqueante
  de secuencia, no de diseño) y `docs/02-MODELO-ER-PROPUESTO.md` (decisiones D1-D4). Decisiones ya
  confirmadas por el usuario: reusar `recetas.insumos` y `recetas.tallas` (no crear catálogos
  paralelos en `costeo`), no dar de alta productos masivamente (conforme se vaya necesitando), MOD/GF/FIJOS
  se capturan externamente por ahora (sin fórmula), no existe maestro de empleados todavía
  (`costeo.Empleado` es provisional, para reemplazar cuando exista RRHH en Fase 4).
- **F1 (schema + migraciones + seeds + RBAC)** — ✅ completada en local, pendiente de validación del
  usuario antes de F2. Detalle:
  - `apps/api/prisma/schema/costeo.prisma` — 22 modelos nuevos. Deliberadamente NO modela columnas
    `GENERATED ALWAYS AS ... STORED`, tipos `daterange`/`tstzrange`, ni `EXCLUDE USING gist` (Prisma
    no los expresa) — cada omisión lleva un comentario `// + SQL:`.
  - `apps/api/prisma/migrations/20260810224449_init_costeo/migration.sql` — base generada con
    `prisma migrate diff --from-config-datasource --to-schema ./prisma/schema --script` (nunca
    `migrate dev`, mismo criterio que con `recetas`) + bloque manual grande al final con: FKs de
    auditoría hacia `core.usuarios` (las columnas `creado_por`/`anulado_por` son `Int` planos sin
    `@relation` en Prisma a propósito, para no ensuciar `core.Usuario` con ~12 arrays inversos),
    columnas generadas (`orden_produccion.codigo`, `orden_facturacion.codigo`,
    `reposicion.codigo_repo`, `consumo_estandar.yardas`, `of_insumo.costo_total`), versionado SCD2
    con `EXCLUDE USING gist` sobre columnas `vigencia` generadas (`consumo_estandar`, `insumo_costo`,
    `montaje_rollo` — requiere `CREATE EXTENSION btree_gist`), CHECK constraints de enums sobre
    VARCHAR y reglas de negocio (`consumo_papel.origen` + regla PRODUCCION/REPOSICION), índice único
    parcial de idempotencia en `consumo_papel`, función `costeo.fn_rollo_en()` y vista
    `costeo.v_rollo_codigo`. Aplicada a local con `prisma migrate deploy` y verificada con pruebas
    SQL deliberadas (intentos de violar cada EXCLUDE/CHECK/índice — todos rechazados correctamente;
    ver transcripción de la sesión si hace falta repetir las pruebas).
  - `apps/api/prisma/seed.ts` extendido (mismo script existente, no uno nuevo): 9 departamentos, 40
    defectos (con categoría/imputable_a — ANEXO_B los marca como sugerencia; el usuario confirmó
    sembrarla igual y dejarla editable después, no es un hecho confirmado del sistema legacy), 6
    tipos de papel (3 activos + 3 históricos no ambiguos, inactivos), 12 impresoras (10 activas +
    MK3/MK4 retiradas, inactivas), 6 calandras, 5 tipos de servicio, y backfill de `grupo`
    (YOUTH/ADULT) sobre las 13 tallas ya existentes en `recetas.tallas`. 22 permisos `costeo.*`
    (`PROMPT_CLAUDE_CODE.md §7`) creados y otorgados por completo a ADMIN, más los 6 roles
    granulares que sugiere el prompt — `OPERADOR_IMPRESION` (7 permisos: rollo ver/montar/desmontar +
    consumo ver/capturar + estándar ver + dashboard), `OPERADOR_TRANSFERENCIA` (7: rollo ver + consumo
    ver/capturar + reposición ver/crear + estándar ver + dashboard), `ANALISTA_COSTOS` (11: OF
    ver/crear/editar + insumo ver/editar_costo + estándar ver/administrar + consumo ver + reposición
    ver + dashboard ver/financiero), `SUPERVISOR_PRODUCCION` (15: control operativo completo del piso
    incluida anulación, sin costos de insumos ni cierre de OF), `GERENCIA_COSTEO` (15: visibilidad
    total + cierre/reapertura de OF + anulación, sin captura de piso) y `ADMIN_IT_COSTEO` (22, todos —
    acceso técnico completo a costeo sin los permisos `plataforma.*`). El mapeo permiso↔rol es diseño
    propio basado en el flujo real del proceso (impresión → transferencia → costeo → supervisión →
    gerencia), confirmado por el usuario para crear los roles ya con esa distribución — ajustable
    después vía `/usuarios` sin tocar el schema. Seed verificado idempotente (varias corridas, mismo
    conteo de filas y de `rol_permisos`).
  - **Deliberadamente fuera de alcance de F1** (documentado para decisión futura, no un olvido):
    impresoras `MS 7`/`MS 8`/`MK'S` (ANEXO_B no confirma si son equipos reales), tipos de papel
    `PAPEL DIGITAL PROTECT 100 GSM 64"` y `TEXTPRINT 1000` (posibles duplicados de los ya activos),
    las ~145 tallas de ANEXO_B que no están en uso hoy, y cualquier alta en `recetas.insumos` (D1
    dejó pendiente confirmar antes de tocar ese schema con altas masivas).
  - **No se ha escrito código de aplicación (controllers/services/frontend) ni se ha tocado el
    servidor de producción** — el prompt lo prohíbe explícitamente hasta validar cada fase con el
    usuario. F2 (Gestión de Rollos) es la siguiente fase, no iniciada.
- **F2 (Gestión de Rollos)** — ✅ completada en local, pendiente de validación del usuario antes de F3.
  Antes de empezar, se encontraron y corrigieron dos bugs reales de F1 en `costeo.fn_rollo_en()`
  (migraciones `20260810235300_fix_fn_rollo_en` y `20260810235800_fix_fn_rollo_en_precision`, nunca
  se edita una migración ya aplicada): (1) devolvía `id_rollo_papel` en vez de `id_montaje_rollo`
  como pide `PROMPT_CLAUDE_CODE.md §5.4` — importa porque `consumo_papel.id_montaje_rollo` y
  `reposicion.id_montaje_rollo` son FKs hacia `montaje_rollo`, no hacia `rollo_papel`; (2) comparaba
  el `p_momento` recibido (precisión de microsegundos) contra `vigencia` (generada desde columnas
  `timestamptz(3)`, redondeadas a milisegundos al guardar) sin igualar la precisión — una consulta
  por "ahora mismo" podía fallar en no encontrar un montaje que arrancó en el mismo milisegundo.
  Verificado con pruebas SQL deliberadas (instante exacto encuentra el montaje, instante pasado no).
  - Backend: `apps/api/src/modules/costeo-rollos/` (`costeo-rollos.module.ts`, `.controller.ts`,
    `.service.ts`, `dto/`), registrado en `app.module.ts`. Rutas bajo `/erp/api/costeo/rollos/...`
    con permisos por método (`costeo.rollo.ver/ingresar/montar/desmontar`). Cubre los 4 flujos de
    `§6.0`: **ingreso** (`POST /ingreso`, factura + N rollos en una transacción), **montaje**
    (`POST /:id/montar`, cierra automáticamente el montaje anterior de esa impresora si lo había —
    sin eso el `EXCLUDE USING gist` rechazaría el insert — dejando `yardas_finales` en NULL y el
    rollo anterior en `EN_BODEGA`, no `AGOTADO`: no hay evidencia de que se haya terminado, solo de
    que se cambió sin pasar por el flujo formal), **desmontaje** (`PATCH /montajes/:id/desmontar`,
    calcula en vivo `yardasUsadasFisicas` y `merma` = usadas físicas − consumo registrado; el estado
    final del rollo — `EN_BODEGA`/`AGOTADO`/`DESCARTADO` — lo elige explícitamente quien desmonta,
    no se infiere de un umbral de yardas porque no hay una regla de negocio confirmada para eso) y
    **panel de estado** (`GET /panel`, una fila por impresora activa con el montaje vigente si lo
    hay; expone `porcentajeRestante` pero NO decide el umbral de "alerta de poco papel" — eso es
    estilo visual del frontend, no una regla de negocio en el backend, mismo criterio que la
    clasificación de defectos de F1). Probado end-to-end con curl contra un usuario de prueba
    desechable con rol ADMIN (creado y borrado en la misma sesión, sin tocar la cuenta admin real
    ni sus credenciales) — ingreso, montaje, auto-cierre del montaje previo, rechazo de doble
    montaje (409), desmontaje con cálculo de merma, rechazo de doble desmontaje (409) y validación
    de DTO (400) verificados uno por uno.
  - Frontend: `apps/web/src/features/costeo-rollos/` (`rollos-page.tsx` con 3 tabs — Panel, Montaje,
    Ingreso — más `components/tab-panel.tsx`, `tab-montaje.tsx`, `tab-ingreso.tsx`,
    `modal-desmontaje.tsx`). Ruta `/costeo/rollos`, ítem nuevo en el sidebar condicionado a
    `costeo.rollo.ver` (mismo patrón que `/usuarios`, no se tocó `app/modulos.ts` — Costeo Real es
    un adelanto de Fase 3, no uno de los 8 módulos del roadmap). El tab Montaje es la "pantalla
    táctil grande" que pide `§6.0`: impresora → rollo → confirmar, con tarjetas grandes en vez de
    formularios, pensada para uso en planta.
  - **Verificación de UI**: typecheck y lint limpios en ambos paquetes (`api` y `web`), servidor
    dev de la API confirma las 9 rutas nuevas mapeadas correctamente sin colisión con `:id`. **No
    se pudo hacer verificación visual/interactiva en navegador** (Playwright u otra herramienta de
    automatización de navegador no estaba disponible en esta sesión) — code review posterior o una
    pasada manual del usuario en `/costeo/rollos` sigue pendiente antes de dar F2 por completamente
    cerrada.
  - **Aún no tocado**: F3 (Reposiciones) — es la siguiente fase, no iniciada. Servidor de producción
    sin cambios.

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
✅ **Primer despliegue real hecho el 2026-08-04**, en el mismo servidor físico que `01_erp`
(Ubuntu interno, hostname `backend-erp-test`, `192.168.2.13`, sin dominio público ni SSL — solo
red interna) y la misma base de datos (`erpdb`) — un solo Postgres para todo el ERP, coexistiendo
con `01_erp` (`erpapp`, puerto `3000`) y otra app no relacionada (`biosac-rrhh`, puerto `8081`) ya
corriendo ahí. Repo en GitHub privado: `github.com/juanmox/erpdigi` (deploy key de solo lectura en
el servidor, no la llave personal del usuario). Checkout del servidor en
`/home/erpadmin/digitexsa-erp`.

- **Un solo proceso PM2** (`digitexsa-api`, puerto `4001`, ver `ecosystem.config.js` en la raíz) —
  el frontend no tiene proceso propio, Nginx lo sirve directo desde `apps/web/dist/`. Nginx
  no usaba ningún prefijo de ruta para `01_erp` (proxea *todo* `:80` a `:3000`) — la config nueva
  agrega `location /erp/api/` y `location /erp/` **dentro del mismo server block**, más
  específicas que el catch-all `/` de `01_erp`, así que ambos conviven sin pisarse. Config real
  vive en `/etc/nginx/sites-available/erpapp` en el servidor (con backup fechado antes del
  cambio); `infra/nginx/digitexsa-erp.conf.example` en el repo es solo la referencia.
- **Node**: el servidor tenía Node 22 del sistema (este repo pide `>=24`) — se instaló Node 24 vía
  `nvm` **para el usuario `erpadmin`, sin sudo**, sin tocar el Node del sistema por si algo más lo
  usa. `pnpm` se activa con `corepack prepare pnpm@11.17.0 --activate` (ya viene con Node ≥16.9).
- **Deploy de rutina**: `scripts/deploy.sh` (`git pull` → `pnpm install` → `prisma migrate deploy`
  → build de `api`/`web` → `pm2 restart digitexsa-api`) — pero antes de que ese script sirva hay
  que activar nvm en la sesión (`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`), no está
  metido en el script todavía.
- **Gotchas reales encontrados en este primer deploy** (ya corregidos donde aplicaba):
  1. No había ningún paso que corriera `prisma generate` tras `pnpm install` → build fallaba con
     120 errores de TS. Corregido con `"postinstall": "prisma generate"` en `apps/api/package.json`.
  2. `nest build` genera `dist/src/main.js`, no `dist/main.js` (el `tsconfig.json` no fija
     `rootDir` porque también compila `prisma.config.ts`/`prisma/seed.ts`, fuera de `src/`) —
     corregido en `ecosystem.config.js` y en el script `start:prod`.
  3. Primera corrida de `prisma migrate deploy` contra `erpdb` (que ya tenía el schema `recetas`
     con datos reales) tiró `P3005` (base no vacía). Se resolvió aplicando el SQL de la migración
     a mano (`psql -f migration.sql`, solo crea el schema `core`, nunca toca `recetas`) y después
     `prisma migrate resolve --applied <nombre>` para dejar el historial de Prisma consistente de
     cara a la próxima migración real.
  4. El rol de Postgres nuevo (`digitexsa_erp`) necesitó `GRANT CREATE, USAGE ON SCHEMA public`
     además de los grants sobre `recetas` — la tabla `_prisma_migrations` vive en `public` por
     default.
  5. `/home/erpadmin` tenía permisos `750` — bloqueaba que `www-data` (usuario de Nginx) leyera
     los estáticos de `apps/web/dist/`, tiraba 500. Se resolvió con `chmod o+x /home/erpadmin`
     (el dueño de su propio home no necesita sudo para esto).
- **Postgres — rol dedicado**: `digitexsa_erp` (no reusar `erpadmin`, el rol que ya usa `01_erp`),
  con permisos de lectura/escritura sobre `recetas` (compartido con `01_erp`) y `CREATE` sobre la
  base para el schema `core` nuevo. Antes del primer `migrate deploy`/aplicar SQL contra la base
  real se hizo `pg_dump --schema=recetas` de respaldo (queda en el home de `erpadmin` en el
  servidor) — recomendable repetirlo antes de cualquier migración futura que si toque `recetas`.
- **`COOKIE_SECURE=false` es obligatorio** en el `.env` de producción mientras no haya HTTPS — si
  se deja que el cookie de refresh token siga a `NODE_ENV=production` por defecto, se marca
  `Secure` y el navegador nunca lo reenvía por HTTP plano, rompiendo el login.
- **Datos de prueba**: insumos `TEST-PW-*` ya borrados de la base compartida el 2026-08-03 (no
  llegaron a estar en producción, se limpiaron en local antes del primer deploy). Queda pendiente
  un `TEST-001` en local, no confirmado con el usuario todavía — no tocar sin confirmar.

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
