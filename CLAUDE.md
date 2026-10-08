# CLAUDE.md — Digitexsa ERP (monorepo nuevo)

## Qué es este proyecto
ERP completo nuevo para Digital Textil, S.A. (Digitexsa), Guatemala — fabricante de uniformes
deportivos. Reemplazó al sistema anterior (`01_erp`, en
`C:\Users\PETER\Documents\Jmox\01_erp`), **apagado el 2026-08-31** — ver "Baja de `01_erp`" y
"Despliegue a producción" más abajo. Resultó ser estrictamente un subconjunto del ERP nuevo, sin
autenticación y sin usuarios reales, así que el corte se adelantó en vez de esperar a la Fase 5.

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
   derecha. **Sobre `apps/web/src/assets/Football.png`** (revisado a fondo el 2026-09-22): es una
   imagen generada por IA que el usuario ya editó — el original está en
   `Documents\Jmox\Claude\ERP DIGI\Imagenes\`, con tres versiones sucesivas
   (`Football Sin logo` → `Football Sin valla` → `Football digitexsa`). **La que está en el repo es
   la última, la más editada**, verificado por sha256. Lo que se editó fue **el fondo**: la pantalla
   gigante del estadio se tapó y la valla inferior ahora dice TEXSA. Comparando las tres píxel a
   píxel, la única zona que cambia es esa (bbox 35,290–314,621); el jugador no se tocó.
   ⚠️ **Queda un emblema en el pecho de la camiseta** —un escudo azul/blanco/rojo, en la posición
   donde va el de la NFL— **idéntico en las tres versiones**. Ampliado 4x no se lee ninguna marca:
   es una mancha con forma de escudo, típica de IA. El usuario está al tanto y decidió dejarla. Si
   alguna vez se quiere quitar, hay que editar la imagen (no hay versión sin ese escudo) o
   sustituirla por una foto real de Digitexsa: basta cambiar el import en `login-page.tsx`, el
   degradado oscuro y el filo dorado ya están pensados para ir encima de cualquier imagen. Paleta resuelta sin abandonar el azul
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
- **F3 (Reposiciones)** — ✅ completada en local, pendiente de validación del usuario antes de F4.
  Alcance ampliado a mitad de fase: encontré (código real del GAS de Forma 1 + `DataDisev3.xlsx`,
  ambos en la carpeta de análisis del usuario, no solo el resumen de ANEXO_A) que `costeo.
  orden_produccion` no tenía ningún flujo de alta — ninguna fase F2-F8 lo cubre, las OP se dan por
  existentes en todas las fuentes legacy. El usuario confirmó: un módulo de Producción completo
  vendrá después (Montaje → Diseño → Transferencia → Corte → Calidad → Confección → Bordados →
  Empaque → Exportación); por ahora, las OP se cargan por import de plantilla (mismo patrón
  preview→aplicar de `recetas`), reusando `ImportPreviewDialog`.
  - **Correcciones de catálogo** (`Mantenimiento` real de `DataDisev3.xlsx`, no solo ANEXO_B): `MK'S`
    no era una impresora retirada — son 4 equipos activos (Mimaki 3-6, `MK3`-`MK6`) que usan papel
    Chino Alemán; `CHINO_ALEMAN_120` pasa de inactivo a activo. Corregido en el seed, sin migración
    (son solo datos).
  - **Dos bugs reales corregidos antes de seguir** (ninguno bloqueaba la app, pero habrían dado
    datos incorrectos silenciosamente):
    1. `costeo-rollos.service.ts`: la agregación de consumo por rollo no filtraba `anulado_en` —
       una reposición anulada seguía restando papel del rollo en el panel. Encontrado al construir
       la anulación de reposiciones; un solo `where` adicional, sin migración.
    2. `OrdenProduccion.codigo`, `OrdenFacturacion.codigo` y `Reposicion.codigoRepo` (columnas
       `GENERATED ALWAYS ... STORED`) nunca se agregaron al schema Prisma en F1 — la nota `// + SQL:`
       decía correctamente que Prisma no puede *expresar* columnas generadas, pero interpretar eso
       como "no declarar el campo" fue el error: sin declararlo, Prisma tampoco lo *lee*, así que
       `orden.codigo` y `reposicion.codigoRepo` volvían `undefined` en cualquier respuesta de la API
       — un bug real que habría roto el frontend de Reposiciones en producción. Corregido
       declarando los 3 campos con `@default(dbgenerated())` (el patrón estándar de Prisma para
       columnas con default/generado del lado de la base: se incluyen en el `SELECT`, nunca se
       escriben en `create`/`update`). Sin migración — son columnas que ya existían en la base
       desde F1, solo le faltaban a Prisma saber que existen.
  - Backend: `apps/api/src/modules/costeo-ordenes/` (import de OP+ítems con plantilla normalizada
    de 29 columnas — 16 de metadata + las 13 tallas actuales de `recetas.tallas`, deliberadamente
    *no* las ~216 columnas crudas de `DataDisev3`; ver corrección #1 de `PROMPT_CLAUDE_CODE.md
    §6.2` sobre no perder los 8 campos de negocio que el `copiarDatos()` legacy descartaba —
    agregué `imagen` y `prioridad` a `LineaProduccion`, que no estaban ni en el diseño original de
    F1, vía migración `20260812001601_linea_produccion_campos_reposicion_unique`) y
    `apps/api/src/modules/costeo-reposiciones/` (crear/listar/anular). Un producto que no exista en
    `recetas.productos` queda pendiente en el preview del import, nunca se crea automáticamente
    (confirmado con el usuario). La carga histórica real de las ~420 OP / 1,129 ítems de
    `DataDisev3` queda para F8 (script de migración histórica) — este módulo es la herramienta que
    Diseño usará hacia adelante, no el backfill en sí.
  - **Reposiciones** resuelve el rollo exactamente como describe §6.1: el operario solo elige la
    impresora (si la reposición implica repapelado) y la fecha/hora; el servidor resuelve
    `id_montaje_rollo` vía `fn_rollo_en()` y de ahí deriva el tipo de papel — nunca se acepta del
    cliente. Si la impresora no tiene rollo montado en ese instante, se rechaza (409) en vez de
    guardar un dato indeterminado. El número de reposición se calcula siempre en el servidor
    (`MAX(numero_repo)+1` dentro de la misma transacción, protegido por el `UNIQUE
    (id_orden_produccion, numero_repo)` agregado en la misma migración de arriba) — nunca se acepta
    del cliente, elimina cualquier posibilidad de colisión o de que un operario lo edite. Al anular
    una reposición, el `consumo_papel` asociado también se anula (mismo patrón `anulado_en`) — así
    el panel de Gestión de Rollos vuelve a reflejar el papel disponible correctamente.
  - Permisos nuevos **fuera de los 22 originales de `PROMPT_CLAUDE_CODE.md §7`**: `costeo.orden.ver`
    y `costeo.orden.importar` — el prompt nunca anticipó un alta de OP como sub-módulo propio.
    Otorgados a `ANALISTA_COSTOS`/`SUPERVISOR_PRODUCCION` (importar) y también a
    `OPERADOR_IMPRESION`/`OPERADOR_TRANSFERENCIA`/`GERENCIA_COSTEO` (solo ver, para tener contexto
    de OP al capturar reposiciones).
  - Frontend: `apps/web/src/features/costeo-ordenes/` (`ordenes-page.tsx`: búsqueda de OP por
    código + diálogo de import) y `apps/web/src/features/costeo-reposiciones/`
    (`reposiciones-page.tsx`: pantalla única mobile-first — buscar OP → autocompleta cliente/línea
    de producto → formulario en el orden de captura de §6.1 → confirmación con opción "Registrar y
    capturar otra" que conserva el contexto de la OP, tal como pide la UX del prompt).
  - **Verificado end-to-end con curl** (no con Playwright — seguía sin estar disponible en esta
    sesión): import completo (fila válida, producto faltante marcado pendiente, re-import detecta
    duplicados), reposición sin impresora (solo tela), reposición con impresora sin rollo montado
    (rechazo 409), reposición con impresora resuelta correctamente (`id_montaje_rollo`/tipo de
    papel derivados, panel de rollos refleja el consumo), anulación (reversa el consumo del panel,
    doble anulación rechazada 409), numeración secuencial correcta con múltiples reposiciones por
    OP. Datos de prueba limpiados de la base local en cada paso.
  - **Aún no tocado**: F4 (Consumo de Papel) — es la siguiente fase, no iniciada. Servidor de
    producción sin cambios.
  - **4 observaciones del usuario tras revisar F3, todas resueltas antes de pasar a F4**:
    1. **Atajo de código**: en Reposiciones y Órdenes, el buscador de OP ahora acepta solo el
       correlativo (`159`) y autocompleta año activo + prefijo + ceros a la izquierda
       (`26OP000159`) — sigue aceptando el código completo si se prefiere, incluso de otro año.
       Función compartida `apps/web/src/lib/codigos-costeo.ts`, ya preparada para `OF` cuando
       llegue F5 (`normalizarCodigoCosteo(texto, 'OP' | 'OF')`).
    2. **Confirmado**: la resolución del NRollo ya es 100% automática desde F3 (vía
       `fn_rollo_en()`, corregida antes de F2) — no hay ni debe haber ningún campo para teclearlo
       a mano, coincide con la corrección #1 de `§6.1`.
    3. **Panel de impresoras en Reposiciones**: agregado como columna lateral
       (`components/panel-impresoras.tsx`, reusa el mismo `costeoRollosApi.panel()` de F2) — cada
       impresora muestra si tiene rollo montado (mismo rojo/verde ya usado en Gestión de Rollos) y
       clickearla llena el campo Impresora del formulario, sin reemplazar el `<Select>` existente.
    4. **Corrección de ingresos mal capturados en Gestión de Rollos**: nueva pestaña "Corregir
       ingreso" — permite editar número de factura, fecha, y tipo de papel/yardas/costo por rollo,
       pero **solo mientras ningún rollo de esa factura se haya montado nunca** (ni ahora ni en el
       pasado — se verifica contra el historial completo de `montaje_rollo`, no solo el estado
       actual). En cuanto cualquier rollo de la factura se montó una vez, la factura queda
       congelada — el endpoint rechaza con 409 y el mensaje explica por qué. El caso raro de
       necesitar corregir un dato ya congelado se resuelve por edición directa en la base de datos
       (decisión explícita del usuario, no una laguna — no hay pantalla para eso a propósito).
    Todo verificado end-to-end con curl (atajo de código con año/prefijo/ceros, factura editable
    antes de montar, `editable:false` + rechazo 409 después de montar un rollo, validación de
    tipo de papel inexistente). Se dejó una OP de ejemplo en la base local (`26OP000001`, cliente
    BSN SPORTS) para que el usuario pueda seguir probando Reposiciones sin tener que cargar datos
    primero.
  - **3 pedidos más tras seguir revisando F3**:
    1. **Campo `comentario`** (texto libre, sin límite) agregado a `costeo.Reposicion` — migración
       `20260812191044_reposicion_comentario`. Corresponde al campo "OBSERVACIONES" de la
       Requisición de Bodega física que ya usan (el usuario mandó una foto de referencia real).
       Se agregó también `apps/web/src/components/ui/textarea.tsx` (no existía ningún componente
       de texto multilínea en el kit shadcn de este proyecto todavía).
    2. **Reposiciones imprimibles** — `apps/web/src/features/costeo-reposiciones/imprimir.ts`,
       mismo patrón de iframe oculto que `features/recetas/imprimir.ts` (nunca `window.open`).
       Réplica del layout real de la Requisición de Bodega: número (`codigoRepo`) arriba a la
       derecha, tabla con una fila **por cada material presente** (papel y tela pueden coexistir
       en una misma reposición — el diseño inicial solo imprimía uno de los dos, corregido antes
       de darlo por terminado), observaciones (defecto + responsable + el comentario nuevo),
       "Solicitado por" (usuario actual vía `useAuth()`) / "Autorizado por" (línea en blanco para
       firma física). Tamaño **media carta** (`@page { size: 5.5in 8.5in }`). De paso se corrigió
       un bug preexistente no relacionado: `features/recetas/imprimir.ts` ya apuntaba a
       `/logo.png`, que nunca existió en `apps/web/public/` (el logo no se mostraba en ningún
       PDF de cotización/resumen impreso hasta ahora) — se copió el logo real ahí, beneficia
       también a esos dos documentos existentes.
    3. **Aclaración pedida sobre selección de impresora**: no hay dos mecanismos con prioridad
       entre sí (uno "detectado" y otro "manual que lo reemplaza") — el campo Impresora del
       formulario es uno solo; el `<Select>` y las tarjetas del panel lateral son dos controles
       distintos que escriben ese mismo campo. Además, ningún NRollo se calcula ni se guarda al
       elegir la impresora — esa resolución ocurre enteramente en el servidor, recién al hacer
       clic en "Registrar", usando la fecha/hora que esté en el formulario en ese momento (por
       eso una fecha pasada puede resolver un rollo distinto al que el panel muestra "ahora").
    4. **Orden fijo de impresoras + grupos colapsables**: el catálogo se mostraba alfabético
       (`orderBy: codigo`); el usuario pidió el orden real de planta (MS 1-6, MP 7-8, RG NEXT/ONE,
       Mimaki 3-6) partido en dos secciones colapsables — "Impresoras MS DT" (MS 1-6 + MP 7-8) e
       "Impresoras DP" (RG NEXT, RG ONE, MK3-6). Agregadas columnas `orden`/`grupo` a
       `costeo.Impresora` (migración `20260812210311_impresora_orden_grupo`), sembradas desde el
       índice/agrupación ya correctos del arreglo `IMPRESORAS_COSTEO` en `seed.ts`. `orderBy` de
       `listarImpresoras()`/`panel()` en `costeo-rollos.service.ts` cambiado de `codigo` a `orden`.
       Componente nuevo `apps/web/src/components/shared/grupo-colapsable.tsx` (`useState` local,
       sin Radix — no había necesidad de animación ni control externo) aplicado al grid de
       `tab-panel.tsx` (Gestión de Rollos) y a la barra lateral `panel-impresoras.tsx`
       (Reposiciones); **no** se tocó el selector de impresora de `tab-montaje.tsx` (pantalla
       táctil de F2, patrón de interacción distinto) — solo hereda el nuevo orden del backend, sin
       agrupar. Verificado con curl que ambos endpoints devuelven el orden/grupo correctos.
    5. **Bug real: el import de OP nunca escribía `idLineaProducto`** — el usuario notó que
       Reposiciones/Órdenes siempre mostraban "Línea de producto: —" y preguntó por qué, mostrando
       una captura del sistema legacy donde el campo `CLIENTE` en realidad mezcla cliente + línea
       (`BSN Basketball`, `BSN Jersey`...) — hallazgo ya documentado en
       `ANEXO_A_Hallazgos.md §2.3` y la razón por la que F1 modeló `costeo.LineaProducto` como
       catálogo separado (`{idCliente, nombre}`) desde el principio. El modelo estaba bien, pero
       `costeo-ordenes.service.ts` nunca resolvía ni escribía ese campo al importar — un vacío real
       de F3, no una decisión de diseño ni un malentendido del usuario. Corregido: nueva columna
       "Línea de producto (nombre, opcional)" en la plantilla de import (posición 3, junto a
       Cliente), resuelta contra `costeo.LineaProducto` por `(idCliente, nombre)`. Si el nombre no
       existe para ese cliente, la fila queda **pendiente** en el preview — mismo patrón que
       Producto faltante, confirmado con el usuario — y no se crea la OP hasta darla de alta.
       Verificado con curl: línea inexistente → error de pendiente; línea creada directo en BD →
       preview la resuelve y el import la escribe correctamente en `orden_produccion`.
       El usuario confirmó construir ya una pantalla mínima de alta (en vez de dejarlo por edición
       directa en base de datos, dado que F8 va a generar líneas nuevas seguido): `GET/POST
       /costeo/ordenes/lineas-producto` y `GET /costeo/ordenes/clientes` en
       `costeo-ordenes.service.ts`/`.controller.ts` (gateados con `costeo.orden.importar`, el mismo
       permiso que ya requiere el import — sin permiso nuevo), con validación de cliente existente
       (404) y línea duplicada por `(idCliente, nombre)` (409). Frontend: botón "Líneas de
       producto" en `ordenes-page.tsx` abre `components/modal-lineas-producto.tsx` — formulario
       simple (Select cliente + input nombre) más una tabla de las ya creadas, sin flujo de
       aprobación (a diferencia de Producto, que si tiene alta real en `/catalogo` con receta y
       costos asociados). Verificado con curl (alta nueva, cliente inexistente → 404, línea
       duplicada → 409) — **no verificado visualmente en navegador**, Playwright/automatización de
       navegador no estaba disponible en esta sesión; falta una pasada manual del usuario o una
       sesión donde sí esté disponible antes de dar esto por completamente cerrado. De paso, se
       aprovechó la línea "Basketball" creada durante la prueba con curl para dejarla real en el
       catálogo y asignársela a la OP de ejemplo `26OP000001` — ahora Reposiciones/Órdenes muestran
       Cliente: BSN SPORTS / Línea: Basketball en vez de "—".
  - **Espejo hacia Google Sheets legacy (posterior al commit de F3, sin commitear todavía)**: el
    usuario recordó que el formulario legacy (`Forma 1`, `Código.gs`) escribe cada reposición en
    dos Google Sheets que siguen alimentando los Dashboards de Google Data Studio, y preguntó si
    el ERP nuevo hace lo mismo — no lo hacía. Confirmado con el código real del GAS legacy
    (`guardarRepo()`/`doPost()`) más los dos libros descargados como Excel para análisis
    (`DataREPOSMig.xlsx`, `ConsumosFinal DIGITEXSAMig.xlsx`, en la carpeta de análisis del
    usuario) — esto además ya estaba anticipado en las notas originales del usuario
    ("Forma 1 Formulario Web.txt"): *"La solución deberá ingresar los datos, tanto a la base de
    datos de PostgreSQL actual del ERP, como a las hojas de cálculo actuales."*
    - **Los dos libros**: `Registro` (ID `1Be8_xaVbMtQzQa518m8R5M7tWiwDjMJ8sWYX3Jkg62Q`) — detalle
      de reposiciones, 15 columnas fijas (FECHA·ORDEN·No. REPO·DEPARTAMENTO·RESPONSABLE·DEFECTO·
      BODEGA SAC·YARDAS PAPEL·TIPO PAPEL·TELA·YARDAS TELA·CLIENTE·EQUIPO·CALANDRA·NRollo) — y
      `Datos` (ID `1P5Q9iVr4hA-50SH18pPrtKMKPO0Y5THJ-KJ4QtuCBYY`, hoja compartida con Forma 2/
      consumo de producción) — mismas 15 columnas del legacy pero sin tela nunca (una reposición
      solo llena las columnas de papel ahí, igual que el legacy).
    - **NRollo**: a pedido explícito del usuario, se manda el valor que el ERP ya resolvió
      (`fn_rollo_en()` → `numeroFactura-totalRollos-secuencia`, mismo formato que
      `costeo.v_rollo_codigo`), **no** la búsqueda heurística del legacy (`buscarNRollo()`, que en
      los datos reales se queda en `"Buscando..."` sin resolver con frecuencia).
    - **Nunca bloquea el guardado** (confirmado con el usuario): `GoogleSheetsService`
      (`apps/api/src/common/google-sheets/`) nunca lanza — cualquier error de red/cuota/permiso
      queda solo en el log. Se dispara en segundo plano (`void this.espejarEnGoogleSheets(...)`,
      sin `await`) al final de `crear()` en `costeo-reposiciones.service.ts`, después de que la
      reposición ya quedó confirmada en Postgres.
    - **Anulaciones**: a pedido explícito del usuario, **no** se reflejan en los Sheets — el
      legacy tampoco borra ni marca filas (`appendRow` únicamente), y una reposición anulada en
      el ERP simplemente deja su fila ya escrita tal cual, para limpiarse a mano si hiciera falta
      ("no creo que pase eso").
    - **Credenciales**: service account de Google Cloud (`temperp@erpgas-505420.iam.gserviceaccount.com`,
      compartida con Editor en ambos Sheets por el usuario) — el archivo JSON vive en
      `apps/api/credentials/` (nunca se commitea, agregado a `.gitignore` junto con `*.pem`), y
      `apps/api/.env`/`​.env.example` tienen `GOOGLE_SHEETS_CREDENTIALS_PATH`,
      `GOOGLE_SHEETS_ID_REGISTRO`, `GOOGLE_SHEETS_ID_CONSUMOS`.
    - **Bug real encontrado y corregido durante la verificación** (el espejo no escribía nada, sin
      ningún error visible): `apps/api/src/config/env.validation.ts` valida `.env` con un schema
      Zod — `ConfigModule` de NestJS usa `dotenv.parse()` (no `dotenv.config()`, nunca muta
      `process.env` directo) y solo re-inyecta a `process.env` lo que sobrevive a ese schema. Las
      tres variables nuevas de Sheets no estaban declaradas ahí, así que Zod las descartaba en
      silencio — `GoogleSheetsService` las leía como `undefined` y el primer `if` de
      `agregarFila()` retornaba sin loggear nada. Corregido agregando las tres al `envSchema` como
      opcionales, más un `logger.warn()` nuevo en ese `if` para que un descuido similar con
      cualquier variable futura quede visible en vez de fallar en silencio. Dejado un comentario
      explícito en `env.validation.ts` advirtiendo esto para la próxima variable de entorno nueva.
    - **Verificado de punta a punta contra los Sheets reales** (no un mock): tras el fix, una
      reposición de prueba (`26OP000001`/`R07`) apareció correctamente en ambos libros con el
      formato de fecha exacto del legacy (`dd/MM/yyyy HH:mm`, zona `America/Guatemala`) y las
      columnas correctas; la reposición de prueba se anuló después en Postgres (no en Sheets,
      conforme al punto de arriba — la fila de prueba sigue ahí, visible por su comentario/defecto
      obviamente de prueba, sin necesidad de limpieza urgente dado el volumen del libro real).
    - **Gotcha de infraestructura de esta sesión, no del código**: el servidor dev de la API quedó
      con dos procesos `nest start --watch` corriendo en paralelo (uno huérfano de un restart
      anterior) peleando por el puerto 4000, causando reinicios en cascada que interrumpían el
      envío en segundo plano a mitad de camino y hacían parecer que el código fallaba — ya
      resueltos mata en dos veces todos los procesos `nest`/`dist/src/main` y arrancando uno solo.
    - **Columna P "Comentario" agregada solo en `Registro`** (pedido posterior del usuario): el
      campo `comentario` de la reposición (ya existente en el ERP desde antes) ahora se manda
      también como 16ª columna en la fila que va a `Registro`/`DataREPOSMig` — el usuario ya había
      puesto el encabezado "Comentario" en la columna P de esa hoja (confirmado vacío en las
      59,000+ filas antes de usarla). **Deliberadamente no se manda a "Datos"/ConsumosFinal** — ese
      libro no tiene columna equivalente y el usuario pidió explícitamente que fuera solo en el
      primero. Verificado contra el libro real: la fila de `Registro` trae el comentario en la
      columna P, la fila correspondiente de `Datos` queda igual que antes (sin comentario).
  - **Toggle "En blanco" en Órdenes (adelanto puntual de F4, diseño en
    [[f4-consumo-papel-diseno]] sigue pausado)**: al analizar la recolección de datos de Forma 2
    (consumo de papel), el usuario confirmó dos decisiones sobre los dos factores que capturaba
    el GAS legacy en `copiarDatos()`: **enguiamiento** se queda exactamente como está
    (`cantidad × 0.084375`, constante, ya modelado desde F1 en
    `costeo.LineaProduccion.enguiamientoYd` vía el import) — no había nada que cambiar ahí, mi
    lectura inicial de que convenía "un solo valor real por línea" era incorrecta y el usuario la
    corrigió con un ejemplo real de la hoja "Datos" en vivo. **"En blanco"**
    (`costeo.LineaProduccion.consumoEnBlanco`/`factorEnBlanco`, ya existían desde F1 con default
    `false`/`0.6` pero el import nunca los tocaba) es distinto: el legacy solo lo captura en
    ciertas OP, a mano, según si el operador de Diseño considera que se gastó papel en blanco —
    no es un dato que se sepa de antemano al cargar la OP. Plan acordado con el usuario
    ("Procede por favor"): las líneas se siguen importando siempre con `consumoEnBlanco=false`
    (el import de `costeo-ordenes.service.ts` no cambia), y se agrega un endpoint nuevo
    `PATCH /costeo/ordenes/lineas/:id` (`EditarLineaProduccionDto`, gateado por el mismo
    `costeo.orden.importar` que ya exige el import — sin permiso nuevo) que solo permite
    prender/apagar `consumoEnBlanco` después de importada, editable libremente. Frontend: nueva
    columna "En blanco" en la tabla de líneas de `ordenes-page.tsx`, un `Checkbox` por línea con
    actualización optimista (revierte sola si el servidor rechaza el cambio, ej. por permiso).
    Verificado con curl usando un usuario de prueba desechable con rol ADMIN (creado y borrado en
    la misma sesión, igual que en F2/F3) sobre una OP/línea también desechables: toggle a
    `true`/`false` reflejado correctamente en `GET /costeo/ordenes/:codigo`, 404 sobre id
    inexistente, 400 con body inválido, 401 sin token, y 403 con un rol sin
    `costeo.orden.importar` (probado con BODEGUERO). Toda la data de prueba (usuario, OP, línea)
    borrada al terminar. **Sigue pendiente, sin resolver todavía**: de dónde sale la LINE en sí
    (¿Excel externo, como hoy, o ya viene de lo importado en F3?) — es la única de las 3 preguntas
    originales de F4 que sigue abierta; el diseño completo de F4 (captura real de consumo,
    `ConsumoEstandar`, espejo a Google Sheets estilo Forma 2) no ha arrancado.
  - **Bug real de F3 encontrado y corregido al retomar el diseño de F4**: `desarrollo` estaba
    modelado como campo único de `costeo.OrdenProduccion`, asumiendo un solo valor por OP. El
    usuario compartió una captura real de la hoja "DatosOrigen" (fuente de Forma 2) más dos
    impresiones reales de OP del sistema actual (`26OP010439`, `26OP022119`) que prueban lo
    contrario: una misma OP siempre trae varios `Desarrollo` distintos, uno por línea/registro —
    el import ya leía `desarrollo` por fila (`FilaPreviewLinea.desarrollo`, columna 9 de la
    plantilla) pero al aplicar solo lo escribía una vez, tomando el valor de la primera fila que
    creaba la OP; cualquier línea posterior con un Desarrollo distinto se perdía en silencio. De
    paso se confirmó con el usuario (tras una primera hipótesis mía equivocada en sentido
    contrario) que **1 Orden de Compra = exactamente 1 Orden de Producción** ("por cada OC se
    realiza una OP"), así que `OrdenProduccion.ordenCompra` como campo único **no** tenía el mismo
    problema — no hizo falta ninguna tabla `costeo.OrdenCompra` nueva, solo mover `desarrollo`.
    Corregido: migración `20260818180000_desarrollo_a_linea_produccion` (quita `desarrollo` de
    `OrdenProduccion`, lo agrega a `LineaProduccion`), `aplicarImportarLineas()` ahora escribe
    `desarrollo` por línea en vez de por OP, `ordenes-page.tsx` movió la columna "Desarrollo" de
    la ficha de la OP (donde mostraba un solo valor engañoso) a una columna de la tabla de líneas.
    Verificado con curl: import de una OP de prueba con 2 líneas y `Desarrollo` distinto en cada
    una (`DES-AAA`/`DES-BBB`), confirmando que `GET /costeo/ordenes/:codigo` devuelve cada línea
    con su propio valor en vez de colapsarlos. Datos de prueba borrados al terminar. No afecta
    Reposiciones ni Rollos (ninguno de los dos usa `desarrollo`/`ordenCompra`).
  - **Módulo `costeo-estandar` — primer tramo real de F4 (Consumo de Papel)**: gestión completa de
    `costeo.ConsumoEstandar` (producto+talla → pulgadas/yardas de papel, versionado SCD2 desde F1).
    El usuario pidió explícitamente import masivo **y** alta uno-por-uno con validación anti-
    duplicado, preguntando si el `CONCAT(código,talla)` del legacy tenía una forma mejor de
    hacerse — respuesta: sí, ya estaba resuelto desde F1 sin saberlo: el schema usa FK reales
    (`idProducto`+`idTalla`) más un `EXCLUDE USING gist (id_producto, id_talla, vigencia)` a nivel
    de Postgres que hace imposible insertar dos consumos que se solapen en fechas para el mismo
    producto+talla — no fue necesario diseñar nada nuevo, solo construir encima. Backend:
    `apps/api/src/modules/costeo-estandar/` (`listar`, `crear` con pre-chequeo de solape para dar
    un 409 legible en vez de la excepción cruda de Postgres — mismo criterio que
    `costeo-rollos.service.ts:montar()` con el EXCLUDE de `montaje_rollo` —, `previewImportar`/
    `aplicarImportar` con patrón preview→aplicar estándar, `plantillaImportar`). Decisión del
    usuario sobre fechas: como la hoja "Consumos" legacy no trae fecha de vigencia, "Vigente desde"
    es opcional y en blanco toma la fecha de hoy (nunca se inventa una fecha pasada); "Vigente
    hasta" opcional, en blanco = sin fecha de corte. Producto/Talla inexistentes quedan pendientes
    en el preview, mismo patrón que Órdenes — nunca se crean automáticamente. Rutas gateadas
    `costeo.estandar.ver` (listar, plantilla) / `costeo.estandar.administrar` (crear, import) — los
    22 permisos ya existían desde F1, sin permiso nuevo. `ANALISTA_COSTOS`/`GERENCIA_COSTEO`
    ganaron `recetas.catalogo.ver` (necesario solo para el selector de Producto/Talla del
    formulario de alta, que llama `/recetas/productos`/`/recetas/tallas` — mismo criterio ya usado
    con Operador Reposiciones y su selector de tela, no otorga acceso al módulo Recetas en sí).
    Frontend: `apps/web/src/features/costeo-estandar/` (`estandar-page.tsx` con tabla + búsqueda
    por código de producto, botones "+ Nuevo consumo"/"Importar plantilla" ocultos sin
    `costeo.estandar.administrar`; `components/modal-consumo-estandar.tsx` con
    `AutocompleteBuscador` para Producto — mismo componente ya usado en Cotización, no uno nuevo).
    Ruta `/costeo/estandar` en `App.tsx` (`RutaConPermiso`) e ítem nuevo en `sidebar.tsx`.
    **Bug real encontrado de paso** (mismo patrón que `OrdenProduccion.codigo`/`Reposicion.codigoRepo`
    en F3): la columna generada `yardas` (`pulgadas_papel / 36.0 STORED`) nunca se había declarado
    en el schema Prisma de `ConsumoEstandar` — sin declararla, Prisma tampoco la lee, así que
    `yardas` habría vuelto `undefined` en toda respuesta de esta API. Corregido agregando el campo
    con `@default(dbgenerated())`, sin migración (la columna ya existía en la base desde F1).
    Verificado con curl de punta a punta usando un usuario de prueba desechable con rol ADMIN
    (creado y borrado en la misma sesión, igual que en F2/F3): alta uno-por-uno (`yardas` calculada
    correctamente, ej. 18 pulgadas → 0.5 yardas), rechazo 409 de un rango que se solapa con uno ya
    vigente, 404 de producto inexistente, 400 de pulgadas negativas, alta de una talla distinta sin
    solape real (OK); import con 4 filas (2 válidas, 1 duplicada dentro del mismo archivo, 1 con
    producto inexistente) — preview marcó las 2 inválidas correctamente y `aplicar` solo creó las 2
    válidas; descarga de plantilla (200 OK); 403 en listar y crear con un rol sin
    `costeo.estandar.ver`/`administrar` (probado con BODEGUERO). Toda la data de prueba borrada al
    terminar. **Esto es solo el catálogo/versionado de consumo estándar** — la pantalla real de F4
    que descuenta papel del rollo montado por OP (buscar OP → ver líneas pendientes → resolver
    consumo+rollo automático → confirmar) y el espejo a Google Sheets siguen sin construirse.
  - **Reemplazo automático de versiones en Consumo Estándar** (pedido posterior del usuario, tras
    revisar cómo se vería un producto con varias actualizaciones): con 5 actualizaciones × 13
    tallas por producto, cerrar la versión anterior a mano antes de cargar la nueva sería
    inmanejable. Implementado en `costeo-estandar.service.ts` (`resolverReemplazo()`, usado por
    `crear()`, y su equivalente en `previewImportar()`/`aplicarImportar()`): al cargar un
    producto+talla que ya tiene una fila vigente sin fecha de corte, se resuelve solo en vez de
    rechazar — **fecha posterior**: cierra la fila anterior (`vigente_hasta` = la nueva fecha) y
    crea la nueva, mismo patrón que `costeo-rollos.service.ts:montar()` con el montaje anterior;
    **misma fecha (mismo día)**: no se puede representar como un rango separado porque
    `vigente_desde`/`vigente_hasta` son columnas `date` sin hora y el CHECK de la base exige
    `vigente_hasta > vigente_desde` estrictamente — en ese caso se **corrige** el valor de la fila
    existente en el lugar, sin crear ninguna fila nueva. Casos ambiguos (más de una fila solapada,
    o fecha nueva anterior a la vigente) se siguen rechazando con 409 — no se adivina cuál
    reemplaza a cuál. **Bug real encontrado con curl al probar esto** (antes de agregar la
    distinción por día): reemplazar el mismo día tiraba 500 (`PrismaClientKnownRequestError`,
    Postgres `23514`, viola `ck_consumo_estandar_vigencia`) porque el primer diseño cerraba la fila
    vieja con `vigente_hasta` = fecha de la nueva sin importar si caían el mismo día — corregido
    comparando por día calendario (`inicioDelDia()`) antes de decidir cerrar-y-crear vs. corregir
    en el lugar. El listado (`GET /costeo/estandar`) cambió su default: solo muestra la versión
    vigente **hoy** de cada producto+talla (antes mostraba todas, lo que sería ilegible con
    historial acumulado) — `?historial=true` expone todas las versiones; frontend con un checkbox
    "Ver histórico" en `estandar-page.tsx`. `aplicarImportar()` devuelve `{creados, reemplazados,
    corregidos}` y el mensaje de éxito del import los desglosa. Verificado con curl: alta v1 →
    alta v2 con fecha futura (reemplaza, v1 queda cerrada en la fecha de v2, listado default
    muestra solo v1 hasta que llegue esa fecha) → intento de fecha anterior a la vigente (409,
    ambiguo) → import repetido el mismo día para el mismo producto+talla (corrige en el lugar, se
    confirmó que sigue existiendo una sola fila en la base, no dos) → listado con/sin
    `historial=true` (3 vigentes hoy vs. 4 filas totales, incluyendo la futura). Datos de prueba
    borrados al terminar.
  - **Validación de fechas mal escritas en el import** (pedido del usuario antes de cargar el
    archivo real de 3,687 filas): `previewImportar()` usaba `fechaCelda()` directo sobre las
    columnas "Vigente desde"/"Vigente hasta", que devuelve `null` tanto si la celda está vacía como
    si tiene texto que no se pudo interpretar como fecha — un typo pasaba desapercibido como si la
    celda estuviera en blanco (tomaba el default de "hoy" en vez de marcarse como error). Corregido
    capturando también el texto crudo de la celda (`textoCelda()`) para distinguir ambos casos: si
    hay texto pero `fechaCelda()` devolvió `null`, ahora es un error explícito ("Vigente desde" no
    se pudo interpretar como fecha: "..."). Verificado con curl: fecha con texto suelto en "Vigente
    desde" → error; en "Vigente hasta" → error; celda vacía → sigue usando hoy sin error; fecha real
    válida → se respeta tal cual. Usuario de prueba borrado al terminar.
  - **Bug real de punta a punta encontrado al cargar el archivo real de 3,687 filas** (el usuario
    mandó captura del modal con filas de error gigantes ilegibles, más el archivo real para
    analizar): `previewImportar()` solo saltaba la fila 1 del Excel, pero la plantilla que genera
    `plantillaImportar()` trae 4 filas de preámbulo antes de los datos — título (fila 1),
    instrucciones (fila 2, celda combinada), fila en blanco (3), encabezado (4) — confirmado
    inspeccionando el archivo real con un script (no visualmente, es un archivo de datos). Las
    filas 2 y 4 se leían como si fueran datos reales (la celda combinada de instrucciones devuelve
    el mismo texto larguísimo en cada columna vía ExcelJS, por eso una fila se veía como un bloque
    gigante en el modal — "Producto" terminaba siendo el párrafo completo), inflando el conteo real
    de 3,687 a 3,689 filas y sumando 2 errores espurios. Corregido saltando hasta la fila 5
    (`FILA_INICIO_DATOS = 5`, constante nueva) en vez de solo la fila 1. **Se encontró y corrigió el
    mismo bug en el import de Órdenes** (`costeo-ordenes.service.ts`, ya committeado desde antes) —
    usa exactamente la misma estructura de plantilla (título+instrucciones+blanco+encabezado), así
    que tenía el mismo problema latente sin haber sido detectado porque las pruebas con curl de esa
    fase usaban archivos de prueba armados a mano sin el preámbulo real. Verificado con curl contra
    el archivo real del usuario (3,687 filas — no un archivo sintético): el preview ahora devuelve
    exactamente 3,687 filas (antes 3,689), la primera es la fila 5 del Excel (`TIR145L`), la última
    es la fila 3691, y los 3,650 errores restantes son todos "Producto no existe" (esperado, solo
    hay 4 productos reales cargados hoy) — confirmado que no se escribió nada en la base (solo se
    corrió el preview, nunca el aplicar). Usuario de prueba borrado al terminar. **El mismo bug
    exacto se encontró y corrigió 3 veces más** (mismo patrón de plantilla de 4 filas en todo el
    proyecto, código ya committeado desde antes): `recetas-productos/productos.service.ts`
    (`previewImportarAltas`, el import de altas masivas de productos) y `recetas-insumos/
    insumos.service.ts` (los 2 imports de ese módulo — precios e altas de insumos). Los 3 usan la
    misma constante `FILA_INICIO_DATOS = 5`. El import de "Productos+Receta" (`importar-recetas`,
    hojas "Productos"/"Receta") **no** tiene el bug — su plantilla usa encabezado en la fila 1 sin
    preámbulo, confirmado revisando `agregarHojaProductosReceta()`/`agregarHojaLineasReceta()`
    antes de tocar nada ahí.
  - **Desarrollo↔Producto es biunívoco — hallazgo del usuario, verificado contra datos reales antes
    de tocar código** (2026-08-20): el usuario aclaró que un Desarrollo es un prototipo que, al
    aprobarse, se convierte en exactamente un Producto (relación uno a uno en ambos sentidos).
    Verificado con un script contra las **1,128 filas reales** de `DataDisev3.xlsx` (`DatosOrigen`,
    columnas Desarrollo/Item): **88 desarrollos únicos, 88 items únicos, cero excepciones** — no
    fue necesario tomarlo solo de palabra. Esto expuso 2 problemas reales:
    1. `recetas.productos.desarrollo` no tenía `@unique` — nada imponía la regla a nivel de base.
    2. `costeo.LineaProduccion.desarrollo` (agregado esta misma sesión al corregir el bug de F3 de
       "desarrollo colapsado por OP") quedaba redundante y riesgoso — dos fuentes de verdad para el
       mismo dato que se podían desincronizar.
    Corregido con migración `20260820120000_desarrollo_biunivoco_producto`: agrega `@unique` a
    `recetas.productos.desarrollo` (sin datos existentes que la violaran, verificado antes de
    aplicar) y quita la columna `desarrollo` de `costeo.linea_produccion` — el valor ahora se lee
    siempre vía `linea.producto.desarrollo` (`ordenes-page.tsx` actualizado). El import de Órdenes
    (`costeo-ordenes.service.ts`) ahora valida cruzado: si la fila trae un Desarrollo distinto al
    ya registrado para el producto resuelto, la fila queda pendiente con error explícito — si el
    producto todavía no tiene desarrollo cargado, no hay nada que validar todavía (no se inventa
    ni se asume). **Bug real encontrado en el camino, en código ya committeado desde antes**: con
    `desarrollo` ahora único, cualquier operación de alta/edición de producto (`crear()`,
    `editar()`, el import masivo de altas) podía chocar contra esa restricción — el manejo de error
    ya existente asumía que un P2002 (violación de unicidad) siempre era por `código`, dando
    mensajes engañosos ("ya existe el código X" cuando en realidad chocaba el desarrollo). Al
    corregirlo se encontró además que Prisma 7 con driver adapters (`@prisma/adapter-pg`) **no**
    expone el campo violado en `meta.target` (la forma "clásica" documentada) sino anidado en
    `meta.driverAdapterError.cause.constraint.fields` — confirmado disparando un P2002 real y
    volcando el error completo, no adivinado. Corregido con un helper (`violacionUnicaIncluyeCampo`)
    que busca el nombre del campo como substring en todo el `meta` serializado, robusto a la forma
    exacta. Se agregó también validación anti-duplicado de `desarrollo` en el preview del import de
    altas de productos (mismo criterio que ya tenía `código`: rechaza duplicado dentro del archivo
    y duplicado contra la base). Verificado con curl de punta a punta: alta con desarrollo → alta
    de otro código con el mismo desarrollo (rechazada, mensaje correcto) → mismo código otra vez
    (rechazada, mensaje correcto, confirma que ambos casos se distinguen) → preview de altas con
    desarrollo duplicado en archivo y desarrollo ya existente (ambos marcados) → import de OP con
    Desarrollo que no coincide con el del producto (rechazado) → import de OP con Desarrollo
    coincidente (aplicado, y `GET /costeo/ordenes/:codigo` devuelve el desarrollo desde
    `producto.desarrollo`, confirmando que la columna vieja de `linea_produccion` ya no existe).
    Datos de prueba borrados al terminar.
  - **4 hallazgos de UI en "Gestión de datos" (Recetas), reportados por el usuario probando la
    pantalla real, no relacionados con Costeo**:
    1. Cotización (`cotizacion-page.tsx`): los 5 filtros de búsqueda (Cliente/Deporte/Talla/
       Patrón/Desarrollo) solo tenían `placeholder` en el `SelectValue`, que nunca se llega a ver
       porque el valor por defecto es "Todos" (una opción real, no vacía) — el usuario no tenía
       forma de saber qué filtraba cada selector una vez cargada la página. Corregido agregando un
       `<Label>` visible arriba de cada uno.
    2. Precios de insumos (`tab-precios.tsx`): el import de precios no tenía plantilla descargable
       — a diferencia de todos los demás imports del proyecto (altas de insumos/productos, órdenes,
       consumo estándar), que sí la tienen. Agregado `plantillaPrecios()` en
       `insumos.service.ts`/`.controller.ts` (`GET /recetas/insumos/plantilla-precios`, gateado
       `recetas.insumos.editar` — mismo permiso que ya exige el import), mismo patrón visual que
       `plantillaAlta()` (2 columnas: Código, Costo nuevo).
    3. Insumos (`tab-insumos.tsx`): no tenía ningún filtro de búsqueda, Categoría ni Unidad — la
       pestaña de Precios (`tab-precios.tsx`) ya tenía exactamente esto implementado; se reusó el
       mismo patrón (filtrado client-side con `useMemo`, mismos componentes) en vez de inventar uno
       nuevo.
    4. Productos (`tab-productos.tsx`): no tenía filtro de búsqueda por código/descripción — a
       diferencia de Cotización, que sí busca por texto contra `/recetas/productos` en el servidor.
       Se agregó como filtro client-side (mismo criterio que Insumos/Precios, ya trae hasta 2000
       productos de una vez vía `listarProductos(estado)`) en vez de agregar un nuevo parámetro de
       búsqueda al servidor, para no duplicar dos formas distintas de buscar productos en el mismo
       módulo.
    Verificado: typecheck y lint limpios en ambos paquetes (un warning real de
    `react-hooks/exhaustive-deps` en Productos, corregido envolviendo `todosLosProductos` en su
    propio `useMemo`); `plantilla-precios` verificado con curl (200 OK, estructura de 4 filas de
    preámbulo + encabezado correcto en fila 4, coincide con lo que ya espera
    `previewImportarPrecios()`) y 403 con un rol sin `recetas.insumos.editar` (probado con
    BODEGUERO). Usuario de prueba borrado al terminar. **No se pudo verificar visualmente en
    navegador** (Playwright/automatización de navegador seguía sin estar disponible en esta
    sesión) — falta una pasada manual del usuario confirmando que los filtros se ven y funcionan
    bien en pantalla.
  - **Bug real: límite de tamaño de body JSON, encontrado con un import real de 1,281 altas de
    productos** — al hacer clic en "Aplicar", el usuario recibía `request entity too large` (413).
    Causa: `main.ts` solo ampliaba el límite de body (`express.raw`, 5mb) en las 6 rutas de subida
    de Excel (`RUTAS_IMPORT_EXCEL`) — el resto de la API, incluidos **todos** los endpoints
    "aplicar"/"altas" de todos los imports del proyecto (no solo productos), seguía con el límite
    **por defecto de Express de 100kb** para JSON normal, nunca se había topado porque ningún import
    anterior había tenido tantas filas a la vez. Corregido pasando `{ bodyParser: false }` a
    `NestFactory.create()` y registrando `express.json()`/`express.urlencoded()` propios con límite
    de 20mb. **Este primer arreglo rompió la subida real de Excel** (segundo bug encontrado
    probando en el navegador, no con curl): el registro inicial ponía los parsers JSON globales
    *antes* que las rutas raw de Excel, asumiendo — incorrectamente, ver más abajo — que el orden
    no importaba porque "los parsers JSON solo actúan sobre `Content-Type: application/json`,
    las subidas de Excel usan otro content-type". Eso resultó falso: `apiFetch` (`apps/web/src/
    lib/api.ts`) forzaba `Content-Type: application/json` en *cualquier* body que no fuera
    `FormData` — incluido el `File` crudo de una subida de Excel — así que el parser JSON global
    consumía el binario del .xlsx y tiraba `Unexpected token 'P' ... is not valid JSON` ("PK" son
    los bytes mágicos de un .xlsx, que es un ZIP). Corregido en dos frentes: (1) `apiFetch` ahora
    tampoco fuerza el content-type cuando el body es un `Blob`/`File` (antes solo excluía
    `FormData`); (2) en `main.ts`, las rutas raw de Excel se registran *antes* que los parsers JSON
    globales, para que la coincidencia sea por ruta y no dependa de qué content-type mande el
    cliente — defensa en profundidad, no solo el fix del cliente. Verificado con curl: un POST de
    ~285KB sin token dio 401 (no 413, confirma que el tamaño ya no rechaza antes de llegar al guard
    de autenticación); reproduciendo el bug exacto (el .xlsx real de la plantilla, con
    `Content-Type: application/json` a propósito, igual que mandaba el navegador) el preview
    respondió 201 con las filas leídas correctamente, no el error de JSON; y un login normal con
    JSON chico siguió funcionando. Usuario de prueba borrado al terminar.
  - **Descripciones largas empujaban la tabla de Productos fuera de la pantalla**, reportado por el
    usuario tras importar los ~1,281 productos reales: la columna Descripción ya tenía
    `whitespace-normal` (el wrap sí estaba activo, visible en pantalla), pero sin un ancho máximo —
    con `table-layout: auto` (el default), una descripción larga seguía empujando el ancho total de
    la tabla hasta sacar la columna "Acciones" de la vista, sin que el scroll horizontal disponible
    fuera evidente. Corregido agregando `max-w-xs` junto a `whitespace-normal` en
    `tab-productos.tsx` (tabla real + diálogo de import). El usuario pidió aplicar la misma
    corrección al resto de columnas de descripción con el mismo patrón dentro de Gestión de datos:
    `tab-insumos.tsx` (tabla real + diálogo de import), `tab-precios.tsx` (tabla real + diálogo de
    import), `modal-import-recetas.tsx` (descripción de producto — no se tocó `insumoCodigo` de esa
    misma tabla, es un código corto, no una descripción larga), `modal-receta.tsx`. Encontrado el
    mismo patrón también en Costeo (`costeo-estandar`, `costeo-ordenes`, `costeo-reposiciones`) y en
    Cotización de Recetas (`card-receta.tsx`, `carrito-acumulados.tsx`, `modal-resumen.tsx`) — no se
    tocaron, quedan fuera de lo reportado (Gestión de datos), pendiente si el usuario lo pide ahí
    también.
  - **`max-w-xs` solo en Descripción dejó la tabla de Productos desbalanceada** (reportado de
    inmediato tras el punto anterior): Descripción quedó muy angosta, mientras que Cliente —sin
    ningún límite— seguía muy ancha, y las columnas de la derecha (Estado/Acciones) seguían sin
    verse completas. El usuario preguntó por ajuste manual de ancho por columna (tipo hoja de
    cálculo) — es una funcionalidad real de construir (manijas de arrastre + estado por columna, no
    existe en el componente `Table` de shadcn que usa el proyecto), no un cambio chico; se dejó
    pendiente para pedirla aparte si hiciera falta. En su lugar, en `tab-productos.tsx` se pasó la
    tabla a `table-layout: fixed` (`className="table-fixed"` en `<Table>`) con un ancho fijo
    explícito por columna en cada `<TableHead>` (`w-28` Código, `w-96` Descripción, `w-48` Cliente,
    `w-16` Talla, `w-24` Deporte/Costo/Estado, `w-28` Precio venta, `w-56` Acciones) — con
    `table-layout: fixed` el ancho de cada columna ya no depende de "lo que el navegador decida
    según el contenido", se respeta el asignado y el contenido envuelve (`whitespace-normal`,
    agregado también a Cliente) o se trunca con elipsis (`truncate`, en Código y Deporte, que no
    necesitan varias líneas) dentro de ese ancho. Solo se aplicó en `tab-productos.tsx` — es la
    única tabla de Gestión de datos con Cliente/Talla/Deporte, las demás (Insumos, Precios) tienen
    menos columnas y no fueron reportadas con este problema; mismo criterio si se pide ahí después.

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
- **Deploy de rutina**: `scripts/deploy.sh` (`git pull` → `pnpm install` → **`prisma generate`** →
  `prisma migrate deploy` → build de `api`/`web` → `pm2 restart digitexsa-api`) — pero antes de que
  ese script sirva hay que activar nvm en la sesión
  (`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`), no está metido en el script todavía.
  - **El `prisma generate` explícito se agregó el 2026-09-23**, después de que el mismo fallo
    rompiera dos despliegues. `apps/api` lo tiene como `postinstall`, pero cuando no hay
    dependencias nuevas pnpm reporta *"Already up to date"* y **no corre los postinstall**, así que
    el cliente se queda con el schema viejo y el build revienta con `Property 'X' does not exist`.
    Lo peligroso es el estado en que deja el servidor: **`migrate deploy` ya corrió** (la base queda
    migrada) pero el build falla, así que `dist/` y PM2 siguen con la versión anterior. Es un estado
    seguro mientras la migración sea aditiva, pero hay que terminar el despliegue a mano
    (`prisma generate` → build → `pm2 restart`).
  - **⚠️ El cuerpo del script vive dentro de `main()` y `main "$@"` se llama en la última línea.
    No es estilo.** El script hace `git pull` **de sí mismo**, y bash lee el archivo por partes
    guardando un offset: si el pull cambia el largo del script a mitad de corrida, la siguiente
    lectura cae en otro lado. **Medido, no supuesto**: simulando el pull sobre la versión sin
    wrapper, el script **se cortó justo después del `git pull` y salió con código 0** — se saltó
    install, migraciones, build y restart, y *reportó éxito*. Ese es el peor modo de falla posible
    para un deploy: silencioso y con exit 0. Con el cuerpo en `main()`, bash parsea el archivo
    completo antes de ejecutar nada; la misma simulación corre los 6 pasos hasta "Listo" aunque el
    archivo se reemplace por uno de 2 líneas. **Nunca sacar el wrapper.**
    - Corolario: un cambio a `deploy.sh` entra en vigor recién en el **siguiente** despliegue. Para
      estrenarlo de inmediato, hacer `git pull` a mano en el servidor antes de correrlo.
  - **⚠️ El bit de ejecución de `deploy.sh` vive en git, y faltaba (2026-09-28).** Un despliegue
    falló con `-bash: ./scripts/deploy.sh: Permission denied`: el archivo estaba como `100644` en
    el índice, o sea **nunca** fue ejecutable. Funcionaba porque alguien le había hecho `chmod +x`
    a mano en el servidor, y el `git pull` que reescribió el archivo (el commit del wrapper
    `main()`) le borró ese bit. Corregido con `git update-index --chmod=+x` sobre `deploy.sh` y
    `setup-recetas-dev.sh`, así que ahora sobrevive a cualquier checkout.
    - **Lo peligroso de este fallo no es el script sino lo que vino después**: se había pegado el
      deploy y el seed como dos comandos seguidos, así que al abortar el primero el **seed corrió
      igual, contra el código viejo**, y su salida de éxito ("Seed completo", todos los catálogos)
      hacía parecer que el despliegue había funcionado. No hubo daño —el seed es idempotente
      consigo mismo y el upsert del admin usa `update: {}`, que no toca su contraseña— pero
      **ningún permiso nuevo se creó**, porque esos viven en el `seed.ts` que no se había bajado.
    - *Lección*: encadenar `deploy.sh` y el seed en una sola pegada oculta el fallo del primero.
      Conviene correrlos por separado y mirar que el deploy llegue a "Listo", o unirlos con `&&`.
    - Mientras tanto, `bash scripts/deploy.sh` funciona sin importar el bit — es la salida cuando
      un checkout viejo todavía no tiene el modo corregido.
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
- **Caché de Nginx: `index.html` no se cachea, los assets sí (corregido el 2026-09-23).** Tras un
  despliegue, el usuario no veía una pestaña nueva en el servidor aunque **el bundle desplegado sí
  la traía** — verificado con grep sobre el `.js` real y con un navegador limpio, que sí cargaba la
  versión nueva. Era el navegador del usuario con el `index.html` viejo cacheado. Dos causas, las
  dos de config:
  1. **`index.html` se servía sin ninguna cabecera `Cache-Control`.** Sin ella el navegador aplica
     *caché heurístico* (inventa un tiempo de vida, típicamente ~10% de la antigüedad del archivo).
     Como los bundles llevan hash, `index.html` es el ÚNICO archivo que debe revalidarse siempre, y
     era justo el que se cacheaba a ciegas. Ahora manda `no-cache` — que no impide cachear, obliga a
     revalidar: con el ETag que ya existía, es un 304 de unos bytes.
  2. **Cualquier asset inexistente devolvía `index.html` con HTTP 200**, porque
     `try_files $uri $uri/ /erp/index.html` atrapaba también `/erp/assets/*`. Comprobado pidiendo un
     nombre inventado: 200 con HTML. Eso convierte un bundle borrado en `Unexpected token '<'` y
     pantalla en blanco, sin ningún 404 que apunte a la causa. Ahora `/erp/assets/` es un bloque
     propio con `try_files $uri =404` y `Cache-Control: public, max-age=31536000, immutable`.
  - Config real en `/etc/nginx/sites-available/erpapp` (backup previo en `erpapp.bak-2026-09-23`);
    el ejemplo del repo (`infra/nginx/digitexsa-erp.conf.example`) quedó igual. Verificado tras el
    `reload`: index 200 con `no-cache`, assets con `immutable`, inexistentes con **404**, y la app
    cargando sin errores de consola.
  - **`sudo` en ese servidor pide contraseña**, así que Claude no puede tocar Nginx: hay que pasarle
    los comandos al usuario. El patrón que funcionó fue dejarle el archivo listo en `~/` con `scp`
    (sin sudo) y darle el `cp` + `nginx -t` + `systemctl reload` para pegar.
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
- JWT de acceso (15 min, claims `{sub, username, idEmpresa, roles, permisos}`) + refresh token
  **opaco** (no JWT) de 30 días, hasheado (SHA-256) en `refresh_tokens`, cookie httpOnly
  `path=/erp/api/auth`. Rotación en cada refresh; reutilizar un refresh ya rotado/revocado
  revoca toda la sesión (detección de robo de token).
- **Login por `username`, no por email** (sesión posterior a la migración inicial de `core`):
  `<input type="email">` en el login bloqueaba con la validación nativa del navegador en cuanto el
  usuario escribía algo que no fuera un correo real (ej. "Administrador") — el usuario pidió poder
  loguearse con un nombre simple (`juan`, `lissette`) en vez de un correo completo, notando además
  que el correo es un dato que cambia y no aporta nada funcional hoy (no hay recuperación de
  contraseña ni notificaciones por email). `core.Usuario.username` (`String @unique`, patrón
  `^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$`, ver `apps/api/src/common/username.ts`) es ahora el
  identificador real de login; `email` pasa a **opcional** (`String? @unique`) — solo un dato de
  referencia, sin validar formato salvo que se provea. Migración
  `20260815180000_usuario_username_login` agrega la columna y hace backfill de `username` desde el
  local-part del email existente (`admin@digitexsa.com` → `admin`), verificado sin colisiones
  contra los 8 usuarios reales del ambiente antes de aplicarla. `seed.ts` gana
  `SEED_ADMIN_USERNAME` (default `admin`), sin reemplazar `SEED_ADMIN_EMAIL` (el admin sigue
  teniendo un email real por defecto, solo que ya no es lo que se usa para loguearse).
  `usuarios.service.ts` ahora expone `editar()` (`PATCH /usuarios/:id`, username + email +
  nombre) — antes el email solo se fijaba al crear, sin forma de corregirlo; cambiar username o
  email es seguro para el historial porque `idUsuario` (entero, inmutable) es lo único que
  referencian `creadoPor`/`anuladoPor` en todo el schema, nunca ninguno de los dos. Verificado con
  curl: login viejo con `email` en el body (400, ya no es un campo válido), login nuevo con
  `username`, usuario creado sin email (`email: null`), formato de username inválido (400),
  username duplicado (409), edición de username+email con login posterior confirmando el cambio.
- Guards globales vía `APP_GUARD`: `JwtAuthGuard` (bloquea todo por defecto; `@Public()` para
  login/refresh) + `PermissionsGuard` (`@RequirePermissions('codigo.punto.accion')`, a nivel de
  método o de controller completo).
- **✅ `PermissionsGuard` es fail-CLOSED desde 2026-08-31** (era el hallazgo de seguridad que estuvo
  pendiente varias fases). Antes, un endpoint sin `@RequirePermissions` devolvía `true` y quedaba
  abierto a cualquier usuario autenticado. El problema no era el daño de entonces sino el **modo de
  falla**: olvidar el decorador en un controller nuevo abría esa operación sin ningún síntoma — sin
  error, sin log, y las pruebas manuales no lo detectan porque quien prueba suele ser admin. De cara
  a Inventario/Compras/Ventas (Fase 3), que mueven stock y dinero, no valía la pena sostenerlo.
  - **Exposición real que había** (auditada con un script sobre los 102 endpoints): 91 gateados, 3
    `@Public`, y **8 fail-open**, todos de lectura. Cuatro eran inocuos (`/auth/me`,
    `/auth/seleccionar-empresa`, `/monedas`, `/monedas/tasas-cambio`); `/empresas` y `/empresas/:id`
    listaban **todas** las empresas (fuga multi-tenant, teórica hoy porque existe una sola); y
    `/roles` y `/permisos` exponían el **catálogo completo del modelo de seguridad** a cualquier
    autenticado — un operario de planta podía leerlo. No entrega credenciales, pero es material de
    reconocimiento.
  - **Decorador nuevo `@SoloAutenticado()`** (`auth/decorators/solo-autenticado.decorator.ts`) para
    lo que legítimamente no necesita permiso. Lo importante es que la decisión queda **escrita**: al
    leer el código se ve que "sin permiso" fue deliberado y no un descuido. No confundir con
    `@Public()`, que además saltea la autenticación.
  - `/roles` y `/permisos` pasaron a `plataforma.roles.administrar`; `/empresas` a
    `plataforma.empresas.administrar`. Ambos permisos ya existían en el seed sin gatear nada.
  - **`verificarRutasGateadas()`** (`common/verificar-rutas-gateadas.ts`, llamado desde `main.ts`
    entre `app.init()` y `app.listen()`): recorre los controllers y **aborta el arranque** si alguna
    ruta no declara nada. Esto es lo que de verdad cierra el problema a futuro — convierte el olvido
    en un error ruidoso en desarrollo, con el nombre de la ruta, en vez de un 403 tardío y confuso en
    producción.
    - ⚠️ Usa `DiscoveryService` + `MetadataScanner`, **no** el router de Express. Los decoradores se
      pueden poner **a nivel de clase** (`@RequirePermissions` sobre el `@Controller`, como en
      `usuarios` y `referencias`), y desde el router solo se ve la función handler, sin su clase. Una
      primera versión leía el router y reportaba **15 falsos positivos** por exactamente eso. Requirió
      registrar `DiscoveryModule` en `app.module.ts`.
  - **Semántica del decorador: es Y, no O.** `permisosRequeridos.every(...)` exige TODOS los
    permisos listados. Hoy ningún endpoint declara más de uno, pero el frontend usa **O** para decidir
    qué mostrar en la navegación; no confundir ambas. Documentado en el guard.
  - **Verificado**: el script de auditoría pasó de 8 endpoints sin gate a **0**; con dos usuarios de
    prueba (ADMIN y COTIZADOR) se confirmó que `/roles`, `/permisos` y `/empresas` dan 200/403 según
    el rol, que `/auth/me` y `/monedas` pasan con ambos, y que un endpoint ya gateado de antes sigue
    igual. Y se probó el arranque quitando **a propósito** un `@SoloAutenticado()`: el servidor no
    levantó y nombró exactamente `GET /monedas/tasas-cambio (MonedasController.listarTasasCambio)`.
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
  - **Navegación y edición** (sesión posterior): `/usuarios` se sacó del sidebar principal — no es
    un módulo de negocio como Recetas/Costeo, es administración de plataforma, así que mezclarlo
    con la grilla de módulos o el sidebar de navegación era un error de categoría. Ahora vive
    detrás de un desplegable en el círculo de iniciales de `shell.tsx` (antes puramente decorativo,
    sin `onClick`) — mismo patrón que Gmail/Slack/Linear, y pensado para escalar: los permisos
    `plataforma.roles.administrar`/`plataforma.empresas.administrar`/`plataforma.auditoria.ver` ya
    existen en el seed sin pantalla propia todavía; cuando se construyan, son ítems nuevos dentro
    de ese mismo desplegable, no tiles ni ítems de sidebar nuevos. Requirió un componente
    `components/ui/dropdown-menu.tsx` nuevo (no existía en el kit shadcn de este proyecto).
    De paso se agregó `editar()` (`PATCH /usuarios/:id`, nombre + email) — antes el email solo se
    fijaba al crear, sin forma de corregirlo. Cambiarlo es seguro para el historial: `idUsuario`
    (entero, inmutable) es lo que referencian `creadoPor`/`anuladoPor` en todo el schema, nunca el
    email — confirmado revisando `costeo.prisma` antes de construirlo. Verificado con curl: edición
    completa, edición parcial (el email no se borra si no se manda), y conflicto por email
    duplicado (409).
  - **Gestión de datos también se sacó del sidebar** (misma sesión): a diferencia de Usuarios, no
    es administración de plataforma — es parte del flujo de Recetas (catálogo de insumos/productos
    que alimenta la cotización), así que vivir como ítem propio del sidebar principal, al mismo
    nivel que Recetas, era el mismo error de categoría. Ahora es un botón dentro de
    `cotizacion-page.tsx`, en la misma barra que USD/GTQ/Historial (`/catalogo` vía `Link` con
    `asChild` en `Button`), gateado por el mismo permiso que ya usaba en el sidebar
    (`recetas.insumos.editar`/`recetas.productos.editar`/`recetas.importar`).
  - **Reorganización de roles granulares de Costeo, tras pruebas del usuario con un usuario real
    por rol** (misma sesión): encontró que Operador Impresión podía ver las pestañas "Ingreso a
    bodega"/"Corregir ingreso" de Gestión de Rollos, que no le correspondían.
    - **2 bugs reales de UI encontrados y corregidos**: (1) `rollos-page.tsx` mostraba las 4
      pestañas sin filtrar por permiso — el backend sí rechazaba la escritura sin
      `costeo.rollo.ingresar`, pero la pestaña/formulario se veían igual. Ahora "Montaje" exige
      `costeo.rollo.montar`/`desmontar` e "Ingreso"/"Corregir ingreso" exigen
      `costeo.rollo.ingresar`. (2) `sidebar.tsx` agregaba el ítem "Recetas" **sin ninguna
      condición** — cualquier usuario autenticado lo veía. Ahora exige `recetas.cotizaciones.ver`
      (sesión posterior, ver arriba). Mismo patrón de bug también corregido en el botón "Anular"
      de Reposiciones (`reposiciones-page.tsx`), que no chequeaba `costeo.reposicion.anular`.
    - **Tensión real encontrada y resuelta con el usuario**: el selector de "Insumo de tela" del
      formulario de Reposiciones lee `/recetas/insumos`, gateado por `recetas.catalogo.ver` — el
      mismo permiso que originalmente daba acceso al módulo Recetas completo. El usuario confirmó
      separar el gate del sidebar a `recetas.cotizaciones.ver` (más específico — solo
      Cotizador/Editor/Admin) para que Operador Transferencia pueda tener `recetas.catalogo.ver`
      (necesario solo para ese selector) sin que el módulo Recetas le aparezca en la navegación ni
      pueda generar cotizaciones.
    - **Roles recortados/nuevos** (`seed.ts`, `ROLES_GRANULARES_COSTEO`): `OPERADOR_IMPRESION`
      recortado a solo `costeo.rollo.ver`/`montar`/`desmontar` (Panel + Montaje, sin
      orden/consumo/estándar/dashboard que no usa ninguna pantalla hoy — F4/Consumo de Papel ni
      existe todavía). `OPERADOR_TRANSFERENCIA` recortado a
      `costeo.rollo.ver`/`orden.ver`/`reposicion.ver`/`reposicion.crear`/`recetas.catalogo.ver`
      (solo la pantalla de Reposiciones + su panel lateral de impresoras). Dos roles nuevos:
      `BODEGUERO` (`costeo.rollo.ver`/`ingresar` — ingreso y corrección de factura de papel + panel
      de estado, sin montar/desmontar en la impresora) y `DISENO` (mismo alcance que Operador
      Impresión: Panel + Montaje, departamento distinto). `ANALISTA_COSTOS`/`SUPERVISOR_PRODUCCION`/
      `GERENCIA_COSTEO`/`ADMIN_IT_COSTEO` sin cambios (no mencionados por el usuario).
    - **Bug real de infraestructura del seed, encontrado al recortar permisos**:
      `upsertRolConPermisos()` en `seed.ts` solo agregaba filas `rol_permisos`, nunca las quitaba
      — recortar la lista de permisos de un rol y volver a correr el seed no alcanzaba para
      quitarle el acceso viejo (verificado con SQL directo: los permisos recortados seguían ahí
      tras el primer reseed). Corregido agregando un `deleteMany` al final de la función
      (`idPermiso: { notIn: idsPermisosDeseados }`) para que el seed reconcilie de verdad, no solo
      agregue. Re-verificado idempotente (dos corridas seguidas, mismo conteo de filas por rol) y
      con SQL directo que cada rol quedó con exactamente los permisos esperados, ni uno más.
    - **Gap real encontrado probando con usuarios reales por rol**: Operador Reposiciones (ver
      abajo) seguía pudiendo *ver* el módulo Recetas navegando directo a `/recetas` por URL — el
      link del sidebar ya estaba oculto, pero **ninguna ruta del frontend tenía guard por
      permiso**, solo `RutaProtegida` (autenticación + selección de empresa). Como el rol sí tiene
      `recetas.catalogo.ver` (necesario para el selector de tela de Reposiciones), la página de
      Recetas cargaba y dejaba navegar el catálogo aunque no pudiera guardar cotizaciones. No era
      un problema exclusivo de Recetas — las otras rutas (`/catalogo`, `/costeo/rollos`,
      `/costeo/ordenes`, `/costeo/reposiciones`, `/usuarios`) tenían el mismo hueco, solo que
      nadie lo había notado todavía. Corregido de forma general en `App.tsx`: `RutaConPermiso`
      nueva (exige al menos uno de una lista de permisos — mismo criterio "OR" que ya usa
      `sidebar.tsx`/`cotizacion-page.tsx` — o redirige a Inicio) envolviendo cada ruta sensible,
      cada una con el mismo permiso que ya usa su link de navegación correspondiente.
    - **Operador Transferencia → Operador Reposiciones** (solo el nombre visible; `codigo` interno
      queda igual a propósito — cambiarlo en el `upsert` por `codigo` habría creado un rol nuevo en
      vez de renombrar el existente, dejando huérfanas las asignaciones ya hechas a usuarios reales
      de prueba). Refleja mejor que el alcance real del rol es solo la pantalla de Reposiciones.

  - **F4 — Fase A (datos del estándar) completada, 2026-08-31.** Es el requisito de la pantalla de
    captura: sin estándares cargados, F4 calcularía cero para todo.
    - **2,982 filas de `costeo.ConsumoEstandar` importadas** desde el archivo real del usuario
      (`ERP plantilla_consumo_estandar.xlsx`, 3,079 filas de datos), cubriendo 381 productos.
      Verificado que la columna generada `yardas` calcula bien (`TIR145L` talla L: 49.75 pulgadas →
      1.3819 yd) y que el re-import es idempotente: la segunda corrida devolvió
      `{creados: 0, corregidos: 2982}` sin duplicar.
    - **97 filas quedaron fuera**, todas por producto inexistente (21 códigos: `BSNCWP09`, `SBRDS4`,
      `FBBELT-22`…). Decisión del usuario: no darlos de alta ahora — con el refactor de desarrollos,
      crear un producto exige un desarrollo aprobado con receta, así que no es una carga trivial.
      La pantalla de F4 debe avisar explícitamente "sin estándar cargado" cuando toque una de esas.
    - **⚠️ Bloqueante encontrado: faltaban 142 tallas.** El catálogo tenía 13 (`YXS…4XL`) y el
      archivo real usa 155 — las 142 faltantes bloqueaban 583 de las 3,079 filas. Son las mismas que
      F1 dejó fuera con el criterio "se dan de alta conforme aparezca una orden que las necesite";
      resultó que sí están en uso. Sembradas en `seed.ts` (`TALLAS_ADICIONALES`), sin migración de
      schema: la más larga tiene 7 caracteres y la columna es `VARCHAR(10)`.
    - **Selectores de talla agrupados** (`components/shared/select-tallas.tsx`, usado por
      modal-desarrollo, modal-producto y modal-consumo-estandar). Con 155 opciones una lista plana es
      inusable. Dos niveles, ambos pedidos/validados por el usuario:
      1. **"Más usadas" primero**, con las 13 originales. Medido contra el catálogo real: esas 13
         concentran el **80.4%** del uso (la 14ª, `5XL`, baja de 289 filas a 25) — el corte es
         nítido, no una impresión. Se descartó la alternativa de "elegir grupo y después talla":
         obligaría a dos clics siempre, incluso para `L`.
      2. Debajo, el resto por línea de prenda (`Youth·Adulto·Hombre·Mujer·Ladies Fit·Numérica·
         Pantalón·Combinada`), usando el `grupo` que ya existía en el modelo desde F1.
      Cada talla aparece **una sola vez** (las frecuentes no se repiten en su línea: dos ítems con el
      mismo `value` romperían el `<Select>`). Verificado en navegador: 155 opciones, cero duplicados.
    - `orden` se unificó en una sola escala (`base*4` dentro del bloque de su grupo) para que cada
      variante quede junto a su base: `YXS · YS · YS+2 · YS+4 · YM …`. Antes las 13 originales
      conservaban `orden` 1-13 y quedaban todas antes de las nuevas, dejando `YS+2` lejos de `YS`.
    - Columna nueva `recetas.tallas.frecuente` (migración `20260831190000_talla_frecuente` + su
      rollback). Se prefirió una columna a una lista incrustada en el frontend: queda explícita en el
      modelo y **ajustable con un UPDATE**, sin desplegar, cuando el uso cambie. Es solo de
      presentación — no participa de ningún cálculo, la combinación producto+talla se resuelve por
      `nombre`.
    - **⚠️ Bug propio encontrado al correr el import real**: `aplicarImportar()` reventaba con
      `P2028` (transacción expirada a los 5s). La causa era el endurecimiento hecho poco antes —
      re-resolver el solape server-side agregó **una consulta por fila**, o sea ~3,000 idas a la base
      dentro de la transacción. Con 4 filas de prueba no se notaba. Corregido resolviendo **en lote**:
      una sola consulta trae todos los solapes, la resolución ocurre en memoria y la transacción
      queda solo con las escrituras. De 5s (agotado) a **3.6s para 2,982 filas**. Se dejó además
      `timeout: 120s` como red, porque son ~3,000 escrituras.
    - **Atribución**: las 2,982 filas quedaron a nombre del usuario `admin`. El usuario desechable no
      se pudo borrar (`consumo_estandar_creado_por_fkey` es `RESTRICT` — el rastro de auditoría
      protegiéndose, como debe), así que se reasignó `creado_por` antes de borrarlo.
    - ~~**Producción NO tiene nada de esto todavía**~~ — **desactualizado**: al desplegar el
      2026-09-30 se comprobó que producción ya tenía las 158 tallas y 2,985 estándares. Se
      cargaron en algún momento posterior a esta nota. Van cuando se despliegue F4 — la migración y el seed son parte del
      despliegue, y el import de datos es un paso manual aparte.
    - **Sigue sin construirse**: Fase B (backend de captura), C (la pantalla responsive PC/tablet/
      teléfono) y D (espejo a Google Sheets).

  - **F4 — datos de OP reales cargados (2026-08-31), previo a la Fase B.** El usuario aportó
    `OrigenConsumo DIGITEXSA Mig.xlsx` (hoja `DatosOrigen`, el formato vivo de Google Sheets que hoy
    alimenta el cálculo de consumo). Es la misma estructura de 237 columnas de `DataDisev3` pero
    acotada a lo vigente: **253 líneas, 67 OP, 13 productos, 2 clientes, 4 impresoras**.
    - **Convertido con `apps/api/scripts/convertir-origen-consumo.mjs`** a la plantilla del import de
      Órdenes que ya existía, en vez de agregarle al ERP un lector para un formato legacy que va a
      desaparecer. Resultado: **253/253 filas válidas, cero errores**; aplicado en 1s → 67 OP y 253
      líneas nuevas (68 OP en total contando la de ejemplo de F3), 729 combinaciones de talla,
      7,969 piezas.
    - **Las 10 tallas que usa el archivo caben en las 13 de `TALLAS_IMPORT_LINEAS`**, así que el
      límite de esa lista (fija en código) no bloqueó nada. Con 155 tallas en el catálogo, sí es algo
      a revisar cuando aparezca una OP con tallas de hombre/mujer/ladies.
    - **⚠️ 31 códigos de producto estaban truncados en la base**: les faltaba el paréntesis de cierre
      (`BBALL-M (1096` en vez de `BBALL-M (1096)`), heredado del import masivo de productos. No es
      límite de columna — `codigo` es `VARCHAR(40)` y los truncados miden 13-16. El usuario confirmó
      que el paréntesis sí es parte del código. Corregidos con un UPDATE, tras verificar: cero
      colisiones con códigos existentes, cero cotizaciones/consumo estándar/líneas de OP afectadas, y
      **ninguna FK apunta a `productos.codigo`** (todas usan `id_producto`), así que renombrar es
      seguro. Sin esto, 59 líneas de `UA-FB03MP(M-L-X)` no habrían resuelto.
    - **Cliente `UNDER ARMOUR` creado** (código 411). Los datos admitían dos lecturas: la columna
      CLIENTE del legacy mezcla cliente con línea de producto (ver §2.3 de ANEXO_A), y los productos
      `UA-*` están asignados a BSN SPORTS en la base, lo que sugería que Under Armour fuera una línea
      de BSN. **El usuario confirmó que es cliente aparte.**
    - **Dos columnas van deliberadamente vacías en el archivo convertido**:
      - `Desarrollo`: el origen usa `3082/25` y la base `2500003082` — el mismo desarrollo en dos
        notaciones. El import valida que coincidan, así que escribirlo habría rechazado las 253
        filas. El código de producto es la llave confiable y el producto ya tiene su desarrollo
        registrado (ahora con FK, es autoritativo).
      - `Línea de producto`: un primer intento puso ahí el nombre del cliente. Como Under Armour es
        el cliente, eso habría creado una línea espuria — y peor, el import exige que la línea exista
        para ese cliente, así que habría rechazado todo. Detectado revisando el archivo generado
        antes de importarlo.
    - **Dato que condiciona el diseño de la Fase C**: de las 729 combinaciones producto+talla
      cargadas, **175 (24%) no tienen consumo estándar** — 66 de las 253 líneas están afectadas. El
      aviso "sin estándar cargado" no es un caso de borde sino algo cotidiano: debe mostrarse como un
      estado normal de la línea que impide enviarla, no como un error.
    - Autoría de las OP y líneas reasignada al usuario `admin` (el usuario de prueba desechable no se
      puede borrar mientras sea `creado_por`, por la FK `RESTRICT`).

  - **F4 — Fase B (backend de captura) completada, 2026-08-31.** Módulo nuevo
    `apps/api/src/modules/costeo-consumo-papel/`, con los permisos que ya existían desde F1
    (`costeo.consumo.ver` / `.capturar` / `.anular` — sin permiso nuevo).
    - `GET /costeo/consumo-papel/orden/:codigo` — la OP con sus líneas, tallas y cantidades, el
      estándar vigente resuelto y el consumo YA calculado en el servidor (convención #1). Devuelve
      por línea tres estados que la pantalla necesita: `completa` (todo enviado), `sinEstandar`
      (nombres de las tallas sin estándar) y `enviable`.
    - `POST /costeo/consumo-papel` — captura una línea completa. `PATCH /:id/anular` con el mismo
      patrón `anulado_en` de Reposiciones.
    - **Las tres fórmulas salieron del `Código.gs` legacy, no de interpretación** (líneas 183-205):
      `consumo = estándar_yardas * cantidad` (columna M), `enguiamiento = cantidad * 0.084375`
      (columna K), `en blanco = cantidad * 0.6` (columna L). **La tercera corrigió un supuesto
      previo**: el "en blanco" se calcula sobre la CANTIDAD, no sobre el consumo — calcularlo sobre
      el consumo habría dado un número muy distinto.
    - El rollo NUNCA se teclea ni se acepta del cliente: se resuelve con `fn_rollo_en(impresora,
      fecha)` y de ahí sale el tipo de papel, igual que Reposiciones. Si no hay rollo montado en ese
      instante se rechaza con 409 en vez de guardar un dato indeterminado.
    - Se guarda `id_consumo_estandar` (corrección #4 de §6.2): el recosteo futuro puede reproducirse
      con la versión del estándar que regía ese día, no con la de hoy.
    - `procesada_en` se marca en la línea en vez de borrar el origen (corrección #3).
    - **Columna nueva `costeo.linea_produccion.factor_enguiamiento`** (migración
      `20260831210000_linea_factor_enguiamiento` + rollback), default `0.084375`. Es la corrección #2
      de §6.2: la constante deja de estar incrustada en el código y pasa a ser un default
      configurable por línea. No confundir con `enguiamiento_yd`, que es el total que Diseño teclea
      y que F4 usa solo como contraste.
    - **⚠️ Bug propio, corregido: la idempotencia no puede hacerse con try/catch en Postgres.** El
      primer intento atrapaba el `P2002` del índice único parcial y seguía con la talla siguiente —
      patrón que funciona en otros motores, pero en Postgres **una sentencia fallida aborta la
      transacción entera** (`25P02: current transaction is aborted`), así que reenviar una línea ya
      procesada devolvía 500. Corregido consultando antes qué tallas ya están enviadas y salteándolas;
      el índice único sigue siendo la garantía real ante concurrencia. Habría alternativa con
      SAVEPOINT, pero consultar antes es más simple y además permite informar qué se salteó.
    - **Verificado con curl contra las 68 OP reales** (usuario desechable, borrado al terminar):
      lectura de OP con líneas enviables y no enviables, captura exitosa con cálculo verificado a mano
      contra SQL (2XL: 2 × 0.9097 = 1.8194; enguiamiento 2 × 0.084375 = 0.1688), rechazo 400 de una
      línea sin estándar nombrando las tallas faltantes, reenvío idempotente
      (`{creadas: 0, yaEstaban: [...]}`), anulación y doble anulación (409). Datos de prueba borrados.
    - **Nota de proceso**: durante las pruebas se anuló por error una reposición preexistente (se usó
      `min(id_consumo_papel)` sin verificar cuál era). Se detectó al revisar los totales por rollo,
      que no cuadraban, y se revirtió. Al probar sobre una base con datos de sesiones anteriores,
      conviene elegir los ids a tocar explícitamente, no por agregación.
    - **Falta**: Fase C (pantalla responsive PC/tablet/teléfono) y D (espejo a Google Sheets).

  - **F4 — Fase C (pantalla "Envío de órdenes impresas") completada, 2026-08-31.**
    `apps/web/src/features/costeo-consumo/`, ruta `/costeo/consumo`, ítem de sidebar "Envío de
    impresas" gateado por `costeo.consumo.ver`.
    - **Un solo flujo para los tres tamaños, no tres pantallas.** El usuario pidió que funcionara en
      PC, tablet y teléfono. En vez de una tabla ancha (que en teléfono obliga a scroll horizontal) o
      tres implementaciones, la pantalla usa **tarjetas que reflowean**: 1 columna en teléfono, 2 en
      tablet (`md`), 3 en escritorio (`xl`). La unidad de decisión es la LÍNEA, así que cada tarjeta
      se basta a sí misma para responder "¿es ésta?". Verificado con Playwright en 390×844, 820×1180
      y 1500×950: **cero desborde horizontal** en los tres.
    - **Campos mostrados** (criterio: lo mínimo para confirmar con certeza qué se está descontando):
      LINE, item, desarrollo, impresora, tipo de papel, tallas con cantidad, y el consumo desglosado
      en estándar + enguiamiento + en blanco. **Deliberadamente fuera**: fechas de cliente/entrega,
      prioridad, imagen, estatus y descripción larga — existen en la OP y se ven en Órdenes, pero acá
      competirían por atención en el momento de descontar papel, y en teléfono son ruido.
    - **Tres señales, que son las que evitan el error caro**:
      1. **"Falta estándar"**: badge, las tallas afectadas marcadas una por una en la grilla, botón
         deshabilitado y el motivo escrito. Con los datos reales aparece en 66 de 253 líneas (24% de
         las combinaciones), así que se trató como **estado normal**, no como error.
      2. **"Ya enviada"**: tarjeta atenuada, sin botón. El índice único lo impide igual en la base,
         pero verlo antes es mejor que un 409.
      3. **Contraste de enguiamiento**: si lo que Diseño tecleó difiere en más de 0.15 yd del
         calculado, se avisa. Ese dato antes no se usaba para nada.
    - La cabecera de la OP es `sticky`: identifica lo que se está por descontar y queda a la vista
      mientras se recorren las líneas. Trae el resumen (líneas, por enviar, enviadas, sin estándar).
    - El buscador acepta solo el correlativo (`10345`) o el código completo, reusando
      `normalizarCodigoCosteo` de F3. `inputMode="numeric"` para que el teléfono abra el teclado
      numérico.
    - Al capturar se invalida también la query de Rollos: el consumo descuenta del rollo montado y el
      panel de Gestión de Rollos mostraría papel disponible desactualizado.
    - **Verificado con clic real en el navegador** (no solo curl): buscar OP → enviar una línea →
      mensaje "2 talla(s) enviada(s)" sin errores de consola, y en la base los cálculos exactos
      (2XL: 2 × 0.9097 = 1.8194; enguiamiento 0.1688), el rollo resuelto solo (montaje 11), la
      versión del estándar guardada y `procesada_en` marcada. Datos de prueba borrados; las 5
      reposiciones preexistentes quedaron intactas.
    - **Falta**: Fase D (espejo a Google Sheets hacia la hoja "Datos"/ConsumosFinal, reusando
      `GoogleSheetsService`, llenando las columnas que Reposiciones deja vacías).

  - **F4 — 4 hallazgos del usuario probando la pantalla, corregidos (2026-09-01)**:
    1. **La tabla de Consumo Estándar se cortaba en la columna Talla.** Tenía sus 6 columnas pero sin
       contenedor con scroll ni anchos fijos: la descripción del producto empujaba la tabla más allá
       del ancho de la ventana y las columnas de fecha quedaban invisibles, sin señal de que hubiera
       más. Mismo defecto y mismo arreglo que las tablas de Gestión de datos: `table-fixed` con
       anchos en porcentaje, `min-w`, contenedor `overflow-x-auto` y `break-words` en la descripción.
    2. **⚠️ `UA-FB03MP(M-L-X)` aparecía sin consumo estándar — error de secuencia propio.** El import
       de los 2,982 estándares se corrió ANTES de corregir los 31 códigos truncados, así que las
       filas de ese producto cayeron entre las 97 rechazadas por "producto no existe" (la base tenía
       `UA-FB03MP(M-L-X` sin el paréntesis). Al corregir los códigos nunca se reimportó. Resuelto
       reimportando: +3 filas (M, L y XL — justo las tallas que usan sus líneas de OP), las 2,982
       existentes corregidas en el lugar sin duplicar, y la OP `26OP010345` pasó de 2 líneas
       bloqueadas a 0. **De los 31 códigos corregidos solo ése está en el archivo de estándares**;
       los otros 30 siguen sin estándar por ausencia en el archivo, no por el truncamiento.
       *Lección*: si se corrigen códigos de producto después de un import que los resuelve por
       código, hay que reimportar — el import no se entera solo.
    3. **La pantalla obligaba a adivinar qué OP existen.** Solo tenía el buscador por código, así que
       sin saber de memoria los números no había forma de encontrar trabajo. Se agregó
       `GET /costeo/consumo-papel/pendientes?idImpresora=` + `components/panel-pendientes.tsx`: panel
       arriba con selector de impresora que lista las OP con líneas sin enviar (líneas, piezas,
       cliente), y un clic abre la orden. Con los datos reales ofrece 53 órdenes.
       Dos decisiones al construirlo: el backend consulta **líneas y no órdenes**, porque una misma OP
       puede repartirse entre varias impresoras y agrupar por OP mostraría trabajo de otra máquina; y
       el criterio de "pendiente" es *no tener ningún consumo vigente*, **no** `procesada_en` — esa
       marca se pone en el primer envío aunque queden tallas sueltas.
    4. **Pregunta del usuario: sí queda registrado quién envía.** `consumo_papel.creado_por` es
       **NOT NULL** (no puede quedar vacío) junto con `creado_en`; al anular se guardan
       `anulado_por`, `anulado_en` y el motivo. Además se escribe un registro en `core.auditoria`.
       Verificado contra el schema real. Esa FK es lo bastante estricta como para impedir borrar un
       usuario que haya creado datos: hay que reasignar `creado_por` primero.

  - **F4 — envío masivo, panel ordenado y carga de rollos por plantilla (2026-09-01/02)**, todo a
    partir de pruebas del usuario sobre la pantalla real:
    1. **El panel de pendientes saturaba la pantalla** — listaba las 53 órdenes como un muro plano
       de botones sobre el resto del contenido. Ahora se agrupa **por impresora** en secciones
       colapsables (reusa `GrupoColapsable`), que es como piensa el operario ("¿qué me toca en la
       MS 2?"), tiene buscador propio (orden/cliente/producto) y **se colapsa solo al elegir una
       orden** — vuelve con "Ver trabajo pendiente". Dos detalles encontrados al verificar: el
       encabezado contaba órdenes sumando por grupo (una OP repartida entre dos impresoras se
       contaba dos veces) y decía "1 órdenes". `defaultAbierto` de `GrupoColapsable` **solo se lee
       al montar**, así que la `key` incluye si hay búsqueda activa: sin eso, filtrar dejaba los
       resultados escondidos detrás de un clic.
    2. **Envío masivo** — checkbox por línea, "Seleccionar todas (N)" y "Enviar seleccionadas (N)".
       Solo se puede marcar lo enviable (marcar algo bloqueado o ya enviado solo generaría fallas
       en el resumen). Cuando la orden abarca más de una impresora aparece además un botón por
       máquina, para no mezclarlas sin querer — en los datos reales hoy ninguna OP se reparte, pero
       el modelo lo permite. El endpoint pasa a recibir `idsLineaProduccion: number[]` (máx. 500) y
       **procesa cada línea en su propia transacción a propósito**: si se mandan 50 y 3 fallan
       porque su impresora no tenía rollo montado, no tiene sentido perder las 47 buenas. Devuelve
       `{enviadas, yaEstaban, fallidas}` y la pantalla agrupa los motivos, que se repiten mucho.
    3. **La fecha de impresión no tenía control detrás.** El error del servidor ya decía "montá el
       rollo primero, **o corregí la fecha**", pero no había forma de corregirla: el DTO aceptaba
       `fecha` desde F4-B y el frontend nunca la mandaba. Es el caso normal de una orden impresa
       ayer, con ese rollo ya desmontado. Se agregó un campo "Fecha y hora de impresión" (vacío =
       ahora) en la barra de acciones, con el aviso de que se descuenta del rollo montado **en ese
       momento**, no del actual. Se manda como instante completo (`toISOString()`) porque
       `datetime-local` da `2026-09-02T14:30` sin zona y el servidor guarda `timestamptz`. Se
       limpia al abrir otra orden: una fecha vieja olvidada descontaría del rollo equivocado sin
       que nada lo delate. Verificado montando y desmontando un rollo de prueba en MS 1: sin fecha
       falla con el mensaje del usuario, con la fecha del montaje pasado entra y queda ligado a
       **ese** `id_montaje_rollo`.
    4. **Gestión de Rollos no tenía import ni plantilla** — era el único módulo sin ellos, y es lo
       que bloquea todo el flujo: sin rollos no hay montaje, y sin montaje no se puede enviar nada.
       `GET /costeo/rollos/plantilla-importar` + `importar/preview` + `importar/aplicar`, gateadas
       las 3 con `costeo.rollo.ingresar` (el mismo permiso que ya exige el alta manual, sin permiso
       nuevo), registrada la de preview en `RUTAS_IMPORT_EXCEL` de `main.ts`. Frontend: botón
       "Importar plantilla" en la pestaña Ingreso a bodega, reusando `ImportPreviewDialog`.
       - **Una fila = factura + tipo de papel + cantidad**, no una fila por factura: una factura
         real del proveedor puede traer más de un tipo de papel (el `editarIngreso` de F2 ya lo
         contemplaba por rollo). Repetir el número de factura en varias filas las agrupa en un solo
         `factura_papel` con los rollos numerados corridos — verificado: 3+2 rollos de dos papeles
         distintos quedaron como una factura con `total_rollos = 5` y secuencias 1-5.
       - La plantilla lleva una **hoja "Tipos de papel"** con los códigos activos: sin eso hay que
         adivinarlos, que es justo lo que deja filas pendientes.
       - Reglas del preview, una por regla verificada con un archivo de prueba: tipo de papel
         inexistente/inactivo, fecha no interpretable (distinguida de celda vacía, mismo criterio
         que Consumo Estándar), cantidad no entera o ≤ 0, costo negativo, factura ya cargada en la
         base, **misma factura con dos fechas distintas** dentro del archivo, y **fila repetida
         exacta** (pegar dos veces duplicaría los rollos en silencio; repetirla con otro tipo de
         papel sí es válido y no se marca).
       - `aplicar` **re-resuelve todo server-side** (tipo de papel por código, inexistencia de la
         factura) — el preview corre en el servidor pero su salida pasa por el navegador. Probado
         con POST directo: tipo inexistente → 400, cantidad negativa → 400, factura de 40
         caracteres → 400 (la columna es `VARCHAR(30)`), y nada se creó en ninguno de los casos.
    5. **El error de "sin rollo montado" ahora lleva al arreglo.** El usuario aclaró que esperaba
       que la fecha fuera simplemente el momento de presionar "Enviar" — y **eso es exactamente lo
       que pasa por defecto** (`dto.fecha ? new Date(dto.fecha) : new Date()`, el campo nuevo va
       vacío). Lo que confundía era el mensaje: ponía "montá el rollo primero, o corregí la fecha"
       con las dos salidas al mismo nivel, cuando montar el rollo es la que aplica casi siempre y
       ajustar la fecha es la excepción (orden impresa antes, con ese rollo ya desmontado). Ahora
       el mensaje **nombra la impresora** y ordena las dos salidas, y el aviso de la pantalla trae
       dos botones: "Ir a montar el rollo" (enlaza a `/costeo/rollos?tab=montaje`) y "Ajustar la
       fecha de impresión" (abre el campo, sin navegar). El backend lanza una `ConflictException`
       con **respuesta estructurada** (`{message, motivo: 'SIN_ROLLO_MONTADO', idImpresora}`) y
       `capturarLote` la propaga como `sinRollo: true` en la falla — comparar el texto del mensaje
       en el frontend se rompería al reescribirlo. `rollos-page.tsx` pasó a leer la pestaña de
       `?tab=` (`useSearchParams`, `<Tabs>` controlado), **validada contra los permisos**: un
       `?tab=montaje` con un rol sin `costeo.rollo.montar` cae en Panel de estado en vez de dejar
       la página vacía — verificado con un usuario BODEGUERO.
    6. **Dos defectos de layout corregidos de paso**, ambos preexistentes: el `<Table>` de
       `ImportPreviewDialog` empujaba el diálogo más ancho que la ventana en pantallas angostas —
       un hijo flex no baja de su ancho de contenido sin `min-w-0`, así que la tabla no scrolleaba
       adentro de su contenedor (afecta a los 6 imports del proyecto, no solo a éste); y en
       `tarjeta-linea.tsx` el `flex-wrap` mandaba el badge de estado a su propia línea cuando la
       descripción era larga.
    - Verificado en navegador (Playwright) a 1440, 820 y 390 px, y con curl usando usuarios de
      prueba desechables (ADMIN y uno sin `costeo.rollo.ingresar` → 403 en las 3 rutas). Toda la
      data de prueba borrada al terminar. **Nota**: la pantalla de Gestión de Rollos en sí sigue
      desbordando a 390 px (es de F2, nunca se hizo responsive) — el diálogo de import ya no, pero
      la página que lo contiene sí; queda pendiente si se quiere usar desde teléfono.

  - **Despliegue a producción y tres pendientes menores cerrados (2026-09-21)**:
    1. **`4c3d9f3` desplegado en `192.168.2.13`** (envío masivo, fecha corregible, import de rollos
       por plantilla). Sin migraciones ni cambios de seed, así que fue `git pull` + build +
       `pm2 restart`: `migrate deploy` reportó "No pending migrations". Verificado desde fuera —
       `/` redirige a `/erp/`, el frontend sirve 200 y las tres rutas nuevas de import devuelven
       401 sin token; en el log de arranque, **110 rutas, todas declarando su acceso**. *Nota al
       verificar con curl*: mandarle GET a una ruta POST da 404 en Nest y parece "no existe" —
       hay que usar el método correcto antes de diagnosticar nada.
    2. **Atajo desde "Envío de impresas" hacia Órdenes de Producción.** Faltaba el camino inverso:
       quien no encuentra su OP no tenía cómo saber que las órdenes se cargan en otro módulo (el
       usuario lo buscó en Gestión de Rollos, que es de rollos). Aparece en dos lados, gateado con
       `costeo.orden.ver`: en el aviso de "no existe la OP" y en el estado vacío del panel de
       pendientes. En el panel solo se muestra **si no hay búsqueda activa** — con un filtro puesto,
       "no hay nada" significa que ese filtro no matchea, y ofrecer el atajo ahí confunde.
       `PanelPendientes` recibe el atajo como prop `pieVacio` en vez de construirlo: depende de
       permisos y rutas, que no son asunto de ese componente.
    3. **La tira de pestañas desbordaba la ventana en teléfono** (`components/ui/tabs.tsx`, afecta
       a Gestión de Rollos y a Gestión de datos, los dos consumidores de `Tabs`). No era el
       contenido de las pestañas: la tira es `w-fit` y con 4 pestañas medía 430px contra 358
       disponibles. Ahora se limita al ancho del padre y scrollea, con `shrink-0` en los triggers
       para que scrollee de verdad en vez de aplastarse (ya traían `whitespace-nowrap`, el texto se
       habría salido del botón). Cuando las pestañas entran no cambia nada — verificado a 820 y
       1440 px.
       - **⚠️ Trampa encontrada a mitad de camino**: con `overflow-x-auto`, el `justify-center` que
         traía la tira empujaba el primer ítem a un **offset negativo** (medido: la primera pestaña
         en `x=-17`), fuera del alcance del scroll — se veía cortada y no había forma de llegar a
         ella. Centrar no hacía nada de todos modos, porque la tira es `w-fit`/`h-fit` y nunca le
         sobra espacio, así que pasó a `justify-start`. Documentado en el componente, que es un
         primitivo de shadcn modificado.
       - De paso, en Gestión de datos las filas de botones de acción de `tab-insumos.tsx` y
         `tab-precios.tsx` eran `flex gap-2` sin `flex-wrap` y también se salían. Las tres páginas
         (Rollos, Gestión de datos, Envío de impresas) ahora entran a 390, 820 y 1440 px.
    4. **`.gitignore`: los `.xlsx` de `apps/api/scripts/` no estaban ignorados.** El directorio se
       versiona porque ahí vive `convertir-origen-consumo.mjs`, así que el `Origen.xlsx` (693 KB con
       órdenes, clientes y precios reales) y su salida quedaban como untracked — un `git add -A` los
       habría subido al repo de GitHub.
    5. **Decisión del usuario: la plantilla de Órdenes se queda con 13 tallas.** Sigue sin poder
       cargar una OP con tallas de hombre/mujer/ladies (el catálogo tiene 155), pero con los datos
       de hoy no bloquea nada. Revisar cuando aparezca una OP que las use.

  - **Costos de los 4 productos reales: local y producción quedaron iguales (2026-09-22)**. Venían
    divergiendo desde el despliegue de agosto. Toda la diferencia salía de dos cosas, y **una de las
    dos la diagnostiqué al revés** — queda anotado para que nadie repita el error:
    1. **Una línea de receta de más en local, que sí era basura**: `BSN-FB01N` tenía
       `173001 PAPEL TISSUE, consumo 99, sin área` además de la legítima (`1.525`, área
       Transferencia). 99 yardas de papel tissue por camiseta no tenía sentido al lado de 1.525, y
       venía del backfill de `producto_insumos` (`id_desarrollo_insumo = 1`, la fila más antigua de
       la tabla). Producción nunca la tuvo. **Borrada por el usuario**; aportaba Q78.16.
    2. **⚠️ El precio de `174014 WARP 340 GRS` NO estaba mal en local: Q9.99 es el precio real**,
       confirmado por el usuario. Yo había concluido lo contrario —que el bueno era el `44.713811`
       de producción— razonando que 44.71 "tiene cara de promedio ponderado" y 9.99 es
       "sospechosamente redondo". **Eso era una inferencia mirando el número, no un dato**, y
       resultó falsa: el valor viejo de producción era el desactualizado. Producción ya quedó
       corregida a 9.99.
    **Estado final, verificado en ambos lados**: `BSN-FB01ESPN 98.8343 · BSN-FB01N 50.7940 ·
    BSN-FB02NB 47.0583 · BSN-YFB02NB 44.7118`, idénticos.
    - ⚠️ **Esos cuatro números son la foto del 2026-09-22 y YA NO son los vigentes.** El 2026-09-24
      el usuario actualizó precios de insumos (`core.auditoria`: `insumos | UPDATE | admin`), así
      que en local hoy dan `99.0771 · 70.8427 · 75.1541 · 72.8077`. Es actividad normal de negocio,
      no una regresión. **No usar la lista de arriba como control de integridad** — si un análisis
      futuro la toma como "lo correcto" va a diagnosticar un problema que no existe; para comparar
      local contra producción hay que sacar la foto de los dos lados en el momento. No hace falta tocar nada más, y **si un
    análisis futuro vuelve a marcar el 9.99 como sospechoso, está equivocado**.
    - *Lección de método*: "número redondo" no es evidencia de dato de prueba. Cuando el dato es de
      negocio y no hay forma de verificarlo contra el sistema (acá `costeo.insumo_costo` está vacía
      —nada la escribe todavía— así que no había historial que consultar), hay que **preguntar antes
      de recomendar**, no razonar desde la forma del número.
    - *Lección operativa*: dar una ruta de clics sin nombrar el ambiente hizo que un cambio cayera en
      producción por error (`192.168.2.13` en vez de `localhost:5173`), justo después de una sesión
      trabajando contra el servidor. **Nombrar siempre la URL completa en cada paso.** Se detectó
      comparando `core.auditoria` de los dos lados, que fue lo que reconstruyó la secuencia exacta —
      vale la pena mirar ahí primero cuando un cambio "no aparece".
    - La pantalla de Precios (Gestión de datos → Precios de insumos) **no tiene ningún bug**,
      verificado con clic real: el botón pasa de `Guardar cambios (0)` deshabilitado a
      `Guardar cambios (1)` al escribir y responde "1 precio(s) actualizado(s)". Ese contador entre
      paréntesis es la señal de si hay algo pendiente de guardar. Ojo: guarda el precio y lo registra
      en `core.auditoria`, pero **no** crea versión en `costeo.insumo_costo`.

  - **Cinco tallas combinadas agregadas a la plantilla de Órdenes, y decisiones de cierre
    (2026-09-22)**:
    1. **La plantilla pasó de 13 a 18 tallas** (30 → 35 columnas). Las nuevas son combinadas —
       cubren un rango en una sola prenda, no dos prendas: `YS-YM`, `YL-YXL`, `2XS-XS`, `S-M`,
       `L-XL`. De las cinco, **solo `S-M` y `L-XL` existían** en el catálogo; las otras tres se
       sembraron (`TALLAS_ADICIONALES` en `seed.ts`), 155 → 158 tallas.
       - **⚠️ Las tallas nuevas SIEMPRE van al final de `TALLAS_IMPORT_LINEAS`.** El parser lee
         desde la columna 18 (`IDX_TALLA_INICIO`) y las tallas son las últimas columnas, así que
         agregar al final deja seguir cargando los archivos ya armados con la plantilla vieja: las
         columnas que les faltan se leen vacías y se saltan. **Insertar en el medio correría todas
         las siguientes y haría que un archivo viejo cargue cantidades en la talla equivocada, en
         silencio** — el peor modo de falla posible acá. Queda advertido en el comentario de la
         constante.
       - Verificado con el `destino.xlsx` real de 30 columnas (el convertido de OrigenConsumo): las
         253 filas siguen leyendo sus tallas idénticas (fila 1 = M 8, L 19, XL 8). Los 253 "errores"
         que devuelve son el detector de duplicados — ese archivo ya se importó en agosto —, no una
         regresión. Y con un archivo nuevo usando `YS-YM`/`YL-YXL`/`L-XL`: preview sin errores,
         aplicar creó la OP, y la base quedó con 4/6/9 contra las tallas correctas. Datos de prueba
         borrados.
       - Al grupo `COMBINADA` se le dio un `orden` lógico (youth primero: 1162→1170) en vez de
         compartir todas el 1160, que las dejaba alfabéticas en el selector de tallas.
    2. **`Football.png` se queda.** Se llegó a borrar por el aviso de "escudo de la NFL" que traía
       este archivo desde una sesión anterior, y se revirtió al revisarla de verdad: el usuario ya la
       había editado (es la última de tres versiones suyas) y el emblema que queda no es una marca
       legible. Ver el punto 2 de "Pendiente ahora mismo" arriba para el detalle. *Lección*: antes de
       borrar un asset por un aviso heredado, **mirar el archivo** — el aviso no decía cuál de las
       versiones del usuario estaba en el repo, y resultó ser la ya corregida.
    3. **Decisión del usuario: el doble conteo en los Dashboards no es riesgo hoy.** La pantalla de
       Envío de impresas todavía no se usa en producción, y cuando se use será en un solo lado. El
       aviso de la Fase D queda como contexto, no como pendiente.
    4. **Decisión del usuario: el repositorio de `01_erp` NO se borra.** Simplemente no se toca más.
       Queda como respaldo frío; la app sigue apagada desde el 2026-08-31.

  - **`montaje_rollo.desmontado_por` — quién cerró el rollo (2026-09-22)**. Pregunta del usuario:
    si un rollo dura varios días y lo desmonta otro operario, ¿cómo queda registrado? Respuesta que
    había: **quedaba solo en `core.auditoria`**, no en la tabla — `desmontar()` ya registraba el
    UPDATE con su `id_usuario`, pero `montaje_rollo` tenía `creado_por` y nada más, así que
    responder "¿quién cerró este rollo?" exigía SQL a mano y ninguna pantalla lo mostraba.
    - **No era una decisión, era una asimetría**: las otras tablas con acción de cierre
      (`consumo_papel`, `reposicion`) sí guardan los dos actores (`creado_por` + `anulado_por`).
    - **Por qué importa más de lo que parece**: el desmontaje es donde se teclea `yardas_finales`, y
      de ahí sale la merma (usadas físicas − consumo registrado). Es una cifra de la que alguien
      responde. El usuario aclaró que en el uso normal cada operario tiene su impresora asignada y
      monta/desmonta él mismo — los cruces son la excepción —, pero quiere el registro para saber
      quién hace su trabajo, y **pidió un reporte de estas transacciones para cuando se construya el
      módulo de Reportes** (pendiente, no hecho acá).
    - Migración `20260922160000_montaje_desmontado_por` (+ `rollback.sql`): columna nullable con FK
      `RESTRICT` hacia `core.usuarios`, más `CHECK (desmontado_por IS NULL OR desmontado_en IS NOT
      NULL)` — impide el estado imposible de "alguien desmontó algo que sigue montado"; no exige lo
      inverso porque el histórico previo puede no tener autor.
    - **Backfill desde la auditoría**: el dato ya existía ahí, así que la migración lo recupera con
      una subconsulta correlacionada sobre `core.auditoria`. En local recuperó el único montaje
      histórico desmontado. **Producción tenía 0 montajes** (Gestión de Rollos no se ha usado ahí
      todavía), así que allá la migración es puramente estructural.
    - **Ventaja real sobre dejarlo solo en auditoría**: la FK `RESTRICT` protege el rastro. En
      `core.auditoria` el `id_usuario` es `ON DELETE SET NULL` — borrar un usuario borra su nombre
      del histórico, y se vio pasar con los usuarios de prueba de sesiones anteriores. Con la
      columna, la base directamente impide borrar a quien desmontó (verificado).
    - `detalleMontaje()` devuelve ahora `montadoPorUsuario` y `desmontadoPorUsuario` resueltos. Los
      nombres se traen con una consulta aparte y no con `include` porque `creadoPor`/`desmontadoPor`
      son enteros **sin `@relation`** a propósito desde F1 (evitar ~12 arrays inversos en
      `core.Usuario`). El modal de desmontaje muestra "Montado por X" antes de cerrar.
    - **⚠️ Al aplicar la migración por primera vez falló con `42P10`**: el backfill usaba
      `UPDATE ... FROM LATERAL (...)` referenciando la tabla destino, que Postgres no permite. El
      DDL sí se había aplicado, así que la migración quedó **a medias y marcada como no terminada**,
      lo que bloquea las siguientes. Se resolvió corriendo su `rollback.sql`, marcándola con
      `prisma migrate resolve --rolled-back`, corrigiendo el SQL y reaplicando. *Lección*: un
      `migrate deploy` que falla a mitad no deja la base como estaba — hay que revisar qué quedó
      aplicado antes de reintentar.
    - Después del cambio de schema hizo falta **`prisma generate` explícito**: el typecheck fallaba
      con "desmontadoPor no existe". Es el mismo tropiezo ya documentado en el despliegue de agosto.
    - **Verificado simulando el caso real**: dos usuarios desechables, uno monta y el otro desmonta.
      La respuesta de la API trae los dos nombres, la base guarda los dos ids, y borrar al que
      desmontó lo rechaza la FK. Montaje y usuarios de prueba borrados al terminar.
    - **Por qué "Yardas finales" arranca VACÍO en el desmontaje (pregunta del usuario, 2026-09-23)**.
    Propuso precargarlo con el restante calculado para no tecleárselo a mano. **No se hizo, y no es
    por seguridad**: ese campo es la lectura **física** del rollo, y la merma sale exactamente de su
    diferencia contra lo que el sistema calculó
    (`merma = (yardasAlIniciar − yardasFinales) − consumoEsteMontaje`). Precargarlo con el restante
    —que es `yardasAlIniciar − consumoEsteMontaje`— da **merma 0 por construcción**: cualquiera que
    confirme sin mirar deja un 0, y la métrica entera pierde sentido. Es el caso clásico de un
    default que parece cómodo y anula la medición que justifica el campo.
    - Lo que **sí** se hizo, porque la fricción que señaló es real: un atajo de un clic
      —*"Coincide con lo calculado (1040.43 yd) — usalo solo si no hubo merma"*— que llena el campo
      con el restante. Mismo ahorro de tecleo, pero como **acto deliberado**, no como valor que
      aparece solo.
    - La merma ya se recalculaba en vivo al teclear; ahora además **avisa cuando es negativa**
      ("Negativa: revisá la lectura"). Una merma negativa significa que se usó menos papel del
      registrado como consumido — no es desperdicio, es un dato que no cuadra: o la lectura está
      mal, o se cargó consumo de más.
    - Verificado con clic real: campo vacío al abrir, merma "—" sin lectura, el atajo deja 0.00,
      una lectura menor da merma positiva (1030 → +10.43) y una mayor la marca en rojo
      (1080 → −39.57).

  - **Pestaña "Historial" nueva en Gestión de Rollos** (`components/tab-historial.tsx` +
      `GET /costeo/rollos/montajes`, gateada con `costeo.rollo.historial`). El usuario probó montar y
      desmontar y preguntó dónde veía el resultado: **el dato se guardaba pero no había pantalla**.
      El Panel de estado solo muestra el montaje VIGENTE de cada impresora, así que al desmontar el
      registro desaparecía de la vista, y `GET /costeo/rollos/:id` —que sí devuelve el historial del
      rollo— no lo consumía nadie en el frontend.
      - Una fila por montaje, del más reciente al más antiguo, con impresora, rollo, quién montó y
        cuándo, quién desmontó y cuándo, consumo de esa sesión y yardas finales. Filtro por
        impresora.
      - Badge **"Cambio de turno"** solo cuando lo cerró alguien distinto del que lo montó. Lo
        normal es que sea la misma persona (cada operario tiene su impresora), así que se marca la
        excepción y no el caso corriente — que es justo lo que el usuario quiere poder ubicar.
      - Los nombres se resuelven en **un solo lote** para toda la lista, y el consumo con el
        `consumoPorMontajeIds()` que ya existía: nada de una consulta por fila.
      - Es la base del reporte de transacciones pendiente. Verificado en navegador a 1440 y 390 px,
        sin desborde ni errores de consola, mostrando los 4 montajes reales de la base.

  - **Historial restringido, pantalla renombrada y acceso de operarios (2026-09-25)**, todo a
    partir de pruebas del usuario con un usuario real por rol:
    1. **Permiso nuevo `costeo.rollo.historial`.** El usuario pidió que el Historial fuera por ahora
       solo para administradores; estaba gateado con `costeo.rollo.ver`, que es lo mismo que el
       Panel de estado, así que lo veía cualquier operario. Vive en `PERMISOS_COSTEO`, con lo cual
       lo reciben ADMIN y ADMIN_IT_COSTEO y ningún rol granular de planta (esos listan sus permisos
       uno por uno). Abrirlo después es agregarlo a un rol desde `/usuarios`, sin tocar código. La
       pestaña del frontend se oculta con el mismo permiso — el endpoint ya rechazaba, pero la
       pestaña se veía igual (mismo patrón de bug ya corregido antes en Ingreso a bodega).
    2. **"Envío de impresas" → "Impresión de OPs"** en el sidebar y en el `<h1>` de la página. El
       código de dos letras del ítem pasó de `EI` a `IO`, que había quedado del nombre viejo.
    3. **Operador Impresión y Diseño ganaron `costeo.consumo.ver` + `costeo.consumo.capturar`.**
       El usuario notó que no veían "Impresión de OPs": montaban el rollo pero no podían registrar
       lo que imprimían, que es justamente su trabajo. Sin `costeo.consumo.anular` (corregir un
       envío ya hecho es de supervisión) y **sin `costeo.orden.ver`** — las OP las cargan
       Diseño/Analista por import, no el operario; el efecto visible es que no les aparece el
       atajo "Ir a Órdenes de Producción" cuando una OP no existe.

  - **Login: un usuario con varios roles en la misma empresa los usa TODOS a la vez
    (2026-09-25)**. El usuario reportó que a `santiago` —3 roles en Digitexsa + 1 en la otra
    empresa— el login le pedía elegir **uno**, y para cambiar de tarea tenía que cerrar sesión y
    volver a entrar.
    - **El diagnóstico fue el contrario de lo que parecía**: `claimsParaEmpresa()` **ya unía** los
      roles y permisos de todas las asignaciones del usuario en la empresa elegida. El bug estaba
      en `empresasActivasDe()`, que devolvía **una fila por asignación** en vez de una por empresa,
      con un campo `rol` en singular. Consecuencias: la pantalla mostraba la misma empresa repetida
      3 veces y parecía un **selector de rol**, y `login()` —que autoselecciona cuando hay
      exactamente 1 entrada— lo obligaba a elegir aunque hubiera **una sola empresa**. Es decir,
      elegir "OPERADOR_IMPRESION" ya le daba los 3 roles; lo que estaba mal era lo que la pantalla
      le decía.
    - `EmpresaDisponible.rol: string` pasó a `roles: string[]` (backend y frontend), agrupando por
      empresa. La pantalla de selección lista los roles como **información**, no como opciones.
    - **Cambiar de empresa sin cerrar sesión**: ítem nuevo en el desplegable del círculo de
      iniciales (`shell.tsx`), visible solo con más de una empresa. Llama al mismo
      `/auth/seleccionar-empresa`, que reemite el token con los permisos de la empresa nueva, y
      limpia la caché de react-query (los datos cargados eran de la empresa anterior).
    - **Multi-empresa sí sigue pidiendo elegir, y debe seguir haciéndolo**: el `idEmpresa` del JWT
      es el alcance de la sesión (hoy solo sella `core.auditoria`, pero el diseño es multi-tenant).
      Lo que se eliminó es la pregunta cuando no hay nada que elegir.
    - **Verificado** con un usuario desechable que replicaba a `santiago` (3 roles en empresa 1 + 1
      en empresa 2, creado y borrado en la misma sesión): con 2 empresas el login devuelve 2
      opciones —no 4— cada una con sus roles, y al elegir Digitexsa el token trae los 3 roles y los
      9 permisos unidos; quitándole la segunda empresa, el login entra **directo** sin pantalla de
      selección. En navegador: el encabezado muestra los 3 roles, el sidebar los 5 ítems que
      corresponden, y el cambio a la otra empresa desde el desplegable dejó el sidebar en 3 ítems
      con un solo rol, sin cerrar sesión.
    - ⚠️ **Tras desplegar esto, los usuarios tienen que cerrar sesión y volver a entrar**: los
      permisos viajan en los claims del JWT, así que un token emitido antes del reseed no trae los
      `costeo.consumo.*` nuevos. Mismo caso ya documentado en el despliegue del 2026-08-31.

  - **Costeo separado por empresa — el `idEmpresa` por fin decide qué datos se ven (2026-09-28)**.
    Estrenando el cambio de empresa del avatar, el usuario vio que parado en Digitalpro le
    aparecían las órdenes de Digitexsa.
    - **No era un filtro mal puesto: NO HABÍA separación por empresa en ningún dato.** `id_empresa`
      existía en 3 tablas, las tres de `core` (`empresas`, `usuario_empresa_rol`, `auditoria`). Ni
      una de `recetas` ni de `costeo` la tenía, así que el `idEmpresa` del token decidía permisos y
      sello de auditoría, **nunca qué datos veías**. El selector no creó el problema, lo hizo
      visible — y el riesgo de transaccionar en la empresa equivocada ya existía sin él.
    - **Alcance decidido por el usuario, no inferido**: se separa **solo Costeo**; `recetas`
      (clientes, productos, desarrollos, insumos, cotizaciones) queda como **catálogo corporativo
      compartido**. Y la **planta es una sola con equipos compartidos**: `impresora`, `tipo_papel`,
      `calandra`, `factura_papel`, `rollo_papel` y `montaje_rollo` **no** se parten.
      `consumo_estandar` tampoco — es una propiedad del producto, y los productos son compartidos.
    - **Consecuencia deliberada de compartir la planta**: el "Restante" de un rollo en el panel de
      Gestión de Rollos suma el consumo de **las dos** empresas. Es lo correcto (el papel físico es
      uno solo), pero conviene saberlo antes de diagnosticarlo como un error de cuentas.
    - Migración `20260928120000_costeo_por_empresa` (+ `rollback.sql`), con respaldo de `core` y
      `costeo` antes de aplicar. `id_empresa` va en **`orden_produccion`** (la raíz: consumos y
      reposiciones lo heredan por su OP) y en **`linea_produccion`**.
      - La columna en `linea_produccion` **no es simetría**: (a) `codigo_line` era UNIQUE global y
        el LINE viene del pedido del cliente, así que dos empresas podrían repetirlo; (b) la
        consulta de trabajo pendiente de Impresión de OPs recorre líneas, no órdenes.
      - **FK compuesta `(id_orden_produccion, id_empresa)` → `orden_produccion`**, no una FK suelta
        a `core.empresas`: es lo que garantiza *en la base* que la empresa de una línea sea siempre
        la de su orden. Requiere un UNIQUE sobre ese par en la raíz (redundante como restricción,
        pero Postgres lo exige para apuntarle una FK).
      - **El correlativo de la OP no lo genera el ERP** — viene del código que se importa
        (`26OP010439`), o sea del sistema con el que Diseño ya trabaja. Por eso `UNIQUE (anio,
        correlativo)` pasó a `(id_empresa, anio, correlativo)`: cada empresa trae su numeración y
        Digitalpro debe poder tener su `26OP000001`. Es **más permisivo** que lo anterior, así que
        no puede invalidar datos existentes.
      - `OrdenProduccion.codigo` **perdió el `@unique` de Prisma**, que además nunca existió en la
        base (`idx_op_codigo` siempre fue un btree común). Declararlo era una mentira que habilitaba
        un `findUnique({codigo})` sin respaldo real.
    - **Propiedad que hizo segura la migración de código**: cambiar el `@@unique` rompió la
      compilación en los 4 `findUnique({ anio_correlativo })`, o sea que el compilador obligó a
      visitar cada punto de entrada. Los tres servicios (`costeo-ordenes`, `costeo-reposiciones`,
      `costeo-consumo-papel`) resuelven la OP por un único punto, así que el filtro quedó
      concentrado. Donde el id llega del cliente (`editarLineaProduccion`, `capturarUna`, `anular`,
      `obtener`) se usa **`findFirst` con la empresa y no `findUnique`**: un registro de la otra
      empresa tiene que verse como **inexistente**, no como existente-pero-prohibido.
    - **`@EmpresaActual()`** (`auth/decorators/empresa-actual.decorator.ts`): decorador de parámetro
      que resuelve `idEmpresa` del JWT y tira **403** si es null (el estado entre el login y la
      selección de empresa). Va como parámetro del handler a propósito — si el servicio lo pide, el
      controlador está obligado a declararlo, así que no se puede olvidar en silencio y terminar con
      un `where` sin filtro.
    - **Verificado de punta a punta** con un usuario desechable con ADMIN en las dos empresas: sin
      empresa seleccionada → 403; en Digitexsa la OP `26OP010345` con sus 5 líneas, 200 líneas
      pendientes y 11 reposiciones; en Digitalpro **la misma OP da 404**, 0 pendientes y 0
      reposiciones. En SQL: la FK compuesta rechaza mover una línea a otra empresa, el LINE sigue
      siendo único dentro de la empresa, y dos empresas ya pueden tener el mismo `26OP000001`.
    - **Fuera de alcance a propósito**: `costeo.orden_facturacion` y `costeo.empleado` están vacías
      y sin módulo construido (F5 y RRHH) — su tenencia se decide cuando se diseñen, no adivinando
      hoy. `/usuarios` sigue listando todos los usuarios (es administración de plataforma).
    - ⚠️ **Pendiente de decisión si Digitalpro llega a producir**: el espejo a Google Sheets escribe
      a los libros de Digitexsa que alimentan Data Studio. Hoy no importa porque Digitalpro no tiene
      datos, pero su consumo caería en los mismos libros.

  - **Identidad visual por empresa (2026-09-28)**. Pedido del usuario junto con lo anterior: "evitar
    confusiones que posiblemente repercutan gravemente al hacer una transacción de una empresa en
    otra".
    - Columna nueva `core.empresas.color_marca` (`VARCHAR(7)` + CHECK de formato `#RRGGBB`), en la
      misma migración. En la base y no incrustado en el frontend, mismo criterio que
      `recetas.tallas.frecuente`: se ajusta con un UPDATE, sin desplegar. Digitexsa `#203080` (el
      azul que ya era `--accent-brand`), Digitalpro `#0f766e` — deliberadamente lejano en tono, no
      una variante del azul.
    - Tres señales a la vez: **franja** de color arriba del encabezado (periférica, se ve sin
      mirarla), **chip** con el nombre de la empresa teñido con su color, y el **tile del sidebar**
      con el mismo color. El nombre va escrito en el chip **a propósito**: una señal de color sola
      no sirve para quien no distingue bien los colores. El título del sidebar pasó de "Digitexsa
      ERP" fijo al de la empresa activa.
    - **Falta el logo por empresa**: solo existe `logo-digitexsa.png` en el repo. Cuando el usuario
      dé un archivo para Digitalpro, entra igual que el color (columna en `core.empresas` + `<img>`
      en el tile del sidebar).

  - **Dos excepciones con permiso propio, en vez de estar siempre disponibles (2026-09-28)**. El
    usuario pidió que ciertas acciones "solo se puedan hacer si un administrador las habilita".
    Elegido de las tres opciones planteadas: **permiso asignable desde `/usuarios`**, no un
    interruptor global ni un flujo de aprobación caso por caso.
    1. **`costeo.consumo.fecha_manual`** — habilita el campo "Fecha y hora de impresión" de
       Impresión de OPs. Sin él no se ve el control (ni el atajo del aviso de "sin rollo montado") y
       **el servidor rechaza con 403 cualquier `fecha` en el cuerpo**. El caso normal no cambia:
       sin fecha se descuenta del rollo montado ahora.
    2. **`costeo.reposicion.impresora_sin_rollo`** — el selector de impresora de Reposiciones ahora
       ofrece **solo las que tienen un rollo montado ahora**; antes listaba las 14 y elegir una sin
       rollo terminaba siempre en un 409 al guardar. Con el permiso se ven todas, marcadas
       "· sin rollo".
       - **El servidor valida lo mismo, no es cosmética**: sin el permiso exige rollo montado
         **ahora**, no solo en la fecha enviada — si no, la regla se esquivaba retrocediendo la
         fecha del formulario. El mensaje de rechazo nombra las dos salidas (elegir otra impresora,
         o pedir el permiso).
    - Los dos viven en `PERMISOS_COSTEO`, así que los reciben **ADMIN y ADMIN_IT_COSTEO** y ningún
      rol de planta (esos listan sus permisos uno por uno). Verificado con SQL tras el reseed.
    - **Son permisos OPCIONALES, así que no pueden ir en `@RequirePermissions`** (que exige TODOS
      los que lista — ver la nota de semántica Y del guard). Se resuelven en el controlador desde
      `usuario.permisos` y se pasan al servicio como booleano.
    - **Verificado con curl y con clic real**: operario con fecha → 403 / sin fecha → 201; admin con
      fecha → 201. Operario sobre impresora sin rollo → 409 con el mensaje nuevo; admin sobre la
      misma → pasa ese chequeo y cae en el 409 original de "no hay rollo en ese momento" (correcto:
      el permiso no inventa un rollo, deja apuntar a una fecha en que sí lo había); operario sobre
      impresora con rollo → reposición creada. En navegador el operario ve exactamente `MS 3` y
      `MS 5` —las dos con rollo montado, confirmado contra SQL— y el admin las 14.

  - **Pantalla de Roles y permisos — y la corrección que la motivó (2026-09-28)**. El usuario
    preguntó "¿cómo habilito la fecha a un usuario en Impresión de OPs?" y la respuesta honesta era
    **que no se podía**. Yo había escrito que el permiso era "asignable desde `/usuarios`", y eso
    era **inexacto**: `/usuarios` asigna **roles**, no permisos; los permisos de cada rol vivían
    solo en `seed.ts`, y `/roles`/`/permisos` eran de solo lectura (`@Get` nada más). La única
    salida por interfaz era darle un rol enorme (ADMIN_IT_COSTEO trae los 27 permisos de Costeo)
    para habilitar uno solo.
    - ⚠️ **El atajo obvio era una trampa**: insertar la fila a mano en `core.rol_permisos` funciona
      hasta el próximo seed. `upsertRolConPermisos()` **reconcilia** (borra todo permiso que no esté
      en su lista — se corrigió así a propósito en una sesión anterior), o sea que el ajuste
      desaparecería en silencio en el siguiente despliegue.
    - **Columna nueva `core.roles.personalizado`** (migración `20260928140000_roles_editables` +
      rollback). Es lo que resuelve ese choque, y sin ella la pantalla sería inútil. La regla: el
      seed define el **punto de partida** de un rol; en cuanto alguien lo edita desde la pantalla,
      el rol queda `personalizado` y `upsertRolConPermisos()` hace early-return sin tocarle los
      permisos. La contracara —que un permiso nuevo de una release futura no le llegue solo— es
      deliberada, la pantalla lo dice, y el seed **lo imprime al terminar** (`Roles personalizados
      (el seed NO les tocó los permisos): ...`) para que no pase inadvertido.
      - El **catálogo** de permisos se sigue sembrando siempre, antes de decidir nada sobre el rol:
        es lo que hace que un permiso nuevo aparezca en la pantalla para poder asignarlo a mano.
    - **ADMIN no es editable, a propósito.** Por definición tiene todos los permisos y el seed lo
      reconcilia siempre, así que es el camino de recuperación si otro rol queda mal configurado.
      Si se dejara personalizar, un permiso nuevo dejaría de llegarle y nadie se enteraría hasta
      necesitarlo. Rechazado en el servicio, y en la pantalla con badge "No editable".
    - **Guarda anti-bloqueo**: no se puede quitar `plataforma.roles.administrar` de un rol que el
      propio actor tiene (perdería el acceso a la pantalla). No es absoluta —ADMIN siempre puede
      recuperarlo— pero evita el tropiezo obvio. Mismo espíritu que las guardas ya existentes en
      `usuarios.service.ts`.
    - **`PATCH /roles/:id/permisos` recibe el conjunto COMPLETO, no un delta**: mandar un delta
      obligaría a distinguir "no lo mandé" de "lo quité", que es donde se cuelan los errores. Los
      códigos se resuelven contra el catálogo real y uno inventado es un 400 explícito.
      `POST /roles` crea roles nuevos (nacen vacíos y ya `personalizado`). **No hay borrado de
      roles** — convención #4, y un rol con asignaciones no debería desaparecer.
    - **45 descripciones de permisos sembradas** (`DESCRIPCIONES_PERMISOS` en `seed.ts`). El campo
      `descripcion` existía en el modelo **sin usarse**, y sin él la pantalla es un muro de códigos
      con puntos: `costeo.consumo.fecha_manual` no le dice nada a quien tiene que repartirlos. Se
      escriben en cada corrida (`update: { descripcion }`), así que corregir un texto en el seed
      alcanza para que cambie en pantalla.
    - Frontend: `apps/web/src/features/roles/`, ruta `/roles` (`RutaConPermiso` con
      `plataforma.roles.administrar`) e ítem nuevo en el desplegable del avatar junto a Usuarios —
      exactamente donde la nota de esa sesión anticipaba que iría. Lista de roles a la izquierda,
      permisos del elegido a la derecha **agrupados por dominio y recurso** derivados del propio
      código (con 45 permisos una lista plana es ilegible), buscador, "marcar todos" por recurso, y
      Guardar habilitado solo si hay cambios.
    - **Verificado con curl y en navegador**: alta de rol, reemplazo de permisos (el rol queda
      `personalizado`), ADMIN rechazado (400), permiso inexistente (400), rol inexistente (404),
      código de rol en minúsculas (400), rol duplicado (409), y la guarda anti-bloqueo (409 al
      quitarse el permiso a sí mismo, 200 cuando lo hace un admin sobre un rol ajeno). **La prueba
      que importó**: se le dio `costeo.consumo.fecha_manual` a OPERADOR_IMPRESION por la API, se
      corrió el seed, y el permiso **sobrevivió** mientras DISENO (no personalizado) se reconcilió
      normal. En navegador: buscar "fecha" encuentra el permiso con su descripción legible, y ADMIN
      aparece con los checkboxes deshabilitados.
    - **Todo lo de la prueba se revirtió**: OPERADOR_IMPRESION volvió a sus 5 permisos del seed y a
      `personalizado = false`. **Qué rol recibe la excepción de la fecha es decisión del usuario**,
      que ahora la toma desde la pantalla sin pedir cambios de código.

  - **"No existe esa OP" ahora dice en qué empresa sí está (2026-09-28)**. Dos preguntas del usuario
    sobre el cambio de empresa, con respuestas distintas:
    1. **"¿Es normal que `admin` no tenga la opción de cambiar de empresa?"** — **Sí, y no es un
       bug del selector**: el acceso a una empresa viene de tener un **rol activo ahí**, y `admin`
       solo lo tiene en Digitexsa. No existe un "ADMIN ve todas las empresas" implícito, y está
       bien que no exista: si lo hubiera, el conjunto de empresas visibles dejaría de ser un dato
       explícito y auditable. Se resuelve asignándole el rol también en la otra empresa desde
       `/usuarios`. El selector aparece solo con más de una empresa — con una sola no hay nada que
       elegir.
    2. **"¿Cómo sé de qué empresa es la orden que quiero modificar?"** — **Eso sí era un hueco
       real, recién abierto por la separación por empresa de esta misma sesión.** Buscar una OP
       parado en la empresa equivocada devolvía un 404 plano ("No existe la orden de producción
       26OP010345"), que es engañoso —la orden existe— y deja sin saber qué hacer.
    - `common/op-otra-empresa.ts`: cuando la búsqueda falla, revisa si esa `(anio, correlativo)`
      existe en otra empresa y lo dice por nombre ("...pero sí existe en Digitexsa. Cambiá de
      empresa desde el menú de tu usuario"). Usado por los tres puntos de entrada — Órdenes,
      Reposiciones e Impresión de OPs.
    - ⚠️ **Solo nombra empresas donde el usuario TIENE rol activo.** Si la OP vive en una empresa a
      la que no tiene acceso, la respuesta sigue siendo el "no existe" pelado: confirmar lo
      contrario le contaría que otro inquilino tiene una orden con ese número, que es justo lo que
      la separación por empresa evita. Verificado con dos usuarios distintos.
    - Se llama **solo cuando la búsqueda ya falló**, así que no pesa en el camino normal.
    - **`ApiError` del frontend ahora lleva `motivo`** (`lib/api.ts`), tomado del cuerpo del error.
      Hacía falta porque el aviso de Impresión de OPs ofrecía ademas "Ir a Órdenes de Producción /
      las órdenes se cargan por plantilla desde ahí" — un segundo consejo que **contradice** al
      primero cuando el arreglo real es cambiar de empresa. El caso se distingue por
      `motivo: 'OP_EN_OTRA_EMPRESA'` y **no por el texto del mensaje**, que se rompe en cuanto
      alguien lo reescribe (mismo criterio que ya se había usado con `SIN_ROLLO_MONTADO`, que hasta
      ahora solo viajaba dentro de respuestas 2xx y no en excepciones).
    - **Verificado con curl y en navegador**: usuario con acceso a las dos empresas parado en
      Digitalpro → el mensaje nombra Digitexsa en las tres pantallas, con HTTP 404 y
      `motivo` en el cuerpo; usuario sin acceso a Digitexsa → mensaje pelado, sin filtración; OP
      inexistente → mensaje pelado y **conserva** el atajo de cargar por plantilla, que ahí sí
      corresponde. Usuarios de prueba borrados al terminar.

  - **Tabla de órdenes cargadas, con filtro por estado (2026-09-29)**. La pantalla de Órdenes solo
    tenía un buscador por código, así que —en palabras del usuario— "es difícil ver qué órdenes hay
    cargadas, a menos que sepas exactamente qué órdenes subiste". Era un problema de
    descubribilidad, no de búsqueda. Nació mostrando solo las pendientes (lo que él pidió) y en el
    mismo turno pidió poder ver también las ya impresas.
    - `GET /costeo/ordenes/listado?estado=pendientes|impresas|todas` (gateado `costeo.orden.ver`,
      con `@EmpresaActual()`) + `components/tabla-ordenes.tsx`. Un `estado` inválido cae en
      `pendientes`: no tiene sentido fallar la carga por un query param mal escrito habiendo un
      default obvio.
    - **"Pendiente" es el MISMO criterio que el panel de Impresión de OPs**: una línea sin ningún
      consumo de PRODUCCIÓN vigente. **No** se usa `procesadaEn`, que se marca en el primer envío
      aunque queden tallas sueltas — con esa marca una OP a medio enviar desaparecería de la lista
      teniendo trabajo por hacer. Reusar el criterio evita que las dos pantallas discrepen.
    - **`impresas` = ninguna línea pendiente**, expresado como `NOT { lineasProduccion: { some:
      pendiente } }` **más** `lineasProduccion: { some: {} }`. Lo segundo no sobra: sin él, una OP
      sin ninguna línea entraría en "impresas", porque un "ninguna pendiente" sobre un conjunto
      vacío es verdadero.
    - **Qué líneas se devuelven acompaña al modo**, para que cada uno responda una sola pregunta:
      `pendientes` trae solo lo que falta imprimir; `impresas` y `todas` traen la orden completa. En
      los tres casos cada línea viene con `impresa`, y la pantalla **solo muestra el badge en
      `todas`** — en los otros dos el estado ya lo dice el filtro elegido, repetirlo sería ruido.
    - **La consulta va por ORDEN, no por línea** (al revés que el panel de Impresión, que agrupa
      por impresora): así el `take` nunca parte una OP a la mitad.
    - **Columnas de talla dinámicas**, derivadas de las tallas realmente presentes en el resultado
      y ordenadas por el `orden` del catálogo — con los datos reales son **10** (`YM YL YXL S M L
      XL 2XL 3XL 4XL`), o sea una matriz parecida a la hoja de cálculo con la que ya trabajan.
      Renderizar las 158 del catálogo habría dado una tabla casi vacía. Una celda sin cantidad va
      **vacía y no en 0**: un cero se lee como "se pidieron cero", cuando lo cierto es que esa talla
      no va en esa línea.
    - **Las líneas van agrupadas bajo su OP** (como pidió el usuario): cliente, orden de compra y
      compromiso son de la orden; producto, impresora, fecha de cliente y tallas son de cada línea.
      Repetir los datos de la OP en cada fila ensancharía la tabla sin agregar información. El
      código de la OP en la cabecera es clickeable y abre su ficha en el buscador de arriba.
    - ⚠️ **El filtro de texto corre en el navegador sobre lo ya traído.** Por eso el tope del
      endpoint es **200** y no 50: con un tope bajo, filtrar por una OP que quedó fuera diría
      "ninguna coincide" aunque exista — un falso negativo que se diagnostica pésimo. Con el
      volumen real (67 OP) quedan todas cubiertas, y si alguna vez se supera, el estado vacío dice
      cuántas quedaron fuera y remite al buscador por código.
    - **Defecto de layout preexistente corregido de paso**: la fila de título + botones de la
      página era `flex ... justify-between` sin `flex-wrap`, así que en teléfono los dos botones no
      bajaban de renglón y empujaban el ancho de toda la página. Medido con un script que lista los
      elementos que se salen del viewport: el desborde a 390 px lo causaba eso, **no** la tabla
      nueva, que scrollea dentro de su `overflow-x-auto`. Mismo defecto y mismo arreglo que en
      `tab-insumos.tsx`/`tab-precios.tsx`. La página pasó además de `max-w-5xl` a `max-w-7xl` para
      que la matriz entre sin scroll en escritorio.
    - **Verificado con curl y en navegador** a 1600, 820 y 390 px, y con los tres modos: pendientes
      66 OP / 7,841 piezas, impresas 1 OP / 72 piezas, todas 67 OP / 7,969 piezas — la suma cierra,
      y 7,969 es el total de piezas cargadas que ya documentaba la carga de datos de F4. En el modo
      mixto se contaron 253 badges de línea sobre 320 filas (253 líneas + 67 cabeceras de OP).
      `estado` inválido cae en pendientes. Cero desborde horizontal en los tres anchos.
    - **Cómo se probó el modo "impresas" sin ensuciar nada**: con los datos reales no había ninguna
      OP impresa, así que ese modo saldría vacío y no probaría el filtro. Se insertó **por SQL** una
      fila mínima de `consumo_papel` sobre una OP de una sola línea, y se revirtió al terminar. Se
      usó SQL y no la captura real a propósito: capturar dispara el **espejo a los Google Sheets de
      producción**, y lo que había que probar era el listado, no la captura. Datos y usuario de
      prueba borrados al terminar.
    - **Responsive y colapsable, tras probarla el usuario (2026-09-29, mismo día)**: "solo se podría
      ver en PC, dado que si reduzco el tamaño de la ventana el contenido de la tabla no se ajusta",
      más el pedido de poder colapsar para ver solo las cabeceras.
      - **Dos presentaciones de los mismos datos, no dos pantallas.** En `xl` y más, la matriz con
        una columna por talla; abajo de `xl`, tarjetas apiladas con las tallas como texto compacto
        (`S 9 · M 11 · L 2 · XL 5 · 2XL 4`). Una matriz de 15 columnas no entra en un teléfono, y
        forzarla era exactamente el scroll horizontal que el usuario reportó. Mismo criterio que la
        Fase C de F4, que ya había resuelto PC/tablet/teléfono con tarjetas que reflowean.
      - ⚠️ **El corte va en `xl` (1280px) y no en `lg` (1024).** `lg` es viewport, pero el sidebar se
        lleva 248px: a 1024 quedan ~776 útiles y la matriz de 1000px volvería a scrollear. Medido en
        navegador a 1600/1280/1024/820/390 — tabla en los dos primeros, tarjetas en los tres
        últimos, **cero desborde horizontal en los cinco**.
      - **Las órdenes arrancan COLAPSADAS**, mostrando solo las cabeceras. El propósito de la
        pantalla es ver qué hay cargado, y eso lo responden las cabeceras; las líneas son el detalle
        al que se entra. Botones "Expandir todas"/"Colapsar todas", y cada OP alterna con un clic en
        su cabecera. El estado se guarda como el conjunto de **expandidas** (no de colapsadas): así
        el conjunto vacío es el default y las órdenes que lleguen después —otro modo, otro
        filtro— nacen colapsadas sin tener que tocarlo. Cambiar de modo lo limpia.
      - ⚠️ **Bug propio encontrado por los errores de consola de Playwright, no a ojo**: la cabecera
        de la tarjeta era un `<button>` y adentro lleva el código de OP, que también es un botón.
        **Un botón anidado es HTML inválido** y React lo reporta como error de hidratación. La
        versión de tabla no lo tenía porque su contenedor es un `<tr>`. Corregido pasando la
        cabecera a `<div onClick>` y extrayendo el chevron a un `<button>` propio con
        `aria-expanded` — que de paso arregla algo que no estaba: **antes no había forma de expandir
        con teclado**. Verificado: consola limpia en los cinco anchos.
      - *Nota*: los dos árboles se renderizan siempre y se muestra uno por CSS. Es más robusto que
        un hook de media query (no hay parpadeo al redimensionar) y con 67 OP no pesa, pero **los
        selectores de Playwright tienen que filtrar por `:visible`** o agarran el árbol oculto — se
        tropezó con eso al verificar.
      - **Verificado con clic real**: al cargar, 67 filas (solo cabeceras); un clic en una cabecera
        suma sus 3 líneas; "Expandir todas" llega a **318 filas = 67 cabeceras + 251 líneas
        pendientes**, que cuadra contra SQL (las 253 líneas totales menos 2 que ya tienen consumo de
        producción de pruebas anteriores — un "320" esperado de entrada era confusión mía entre
        líneas totales y pendientes); "Colapsar todas" vuelve a 67. El clic en el código de OP sigue
        abriendo su ficha **sin** alternar el colapso (`stopPropagation`). Usuario de prueba borrado
        al terminar.
    - **Anchos de columna, con las 5 tallas combinadas en pantalla (2026-09-29)**. El usuario
      advirtió que las 5 tallas combinadas agregadas a la plantilla (`YS-YM`, `YL-YXL`, `2XS-XS`,
      `S-M`, `L-XL`) **van a aparecer en cuanto haya órdenes que las usen**, y pidió achicar las
      columnas para que quepan sin montarse unos datos sobre otros, aclarando que **las cantidades
      rara vez pasan de 2 dígitos**.
      - **No hizo falta tocar qué columnas se muestran**: son dinámicas desde el principio, así que
        una talla aparece sola apenas una línea la usa. Se comprobó agregando las 5 combinadas a una
        línea real por SQL — el listado pasó de 10 a 15 columnas sin tocar código, y se revirtió.
      - **Medido antes de cambiar nada**, que fue lo que orientó el arreglo: las cuatro primeras
        columnas se llevaban **583px** (Línea 173 · Producto 190 · Impresora 109 · Fecha cliente
        111) con contenido mucho más corto. Lo que las inflaba era el **encabezado**: con
        `table-layout: auto` el navegador reserva lugar para "Fecha cliente" entero aunque abajo
        solo diga `28/05/26`. De ahí que la solución fuera acortar encabezados ("Impr.",
        "F. cliente") y pasar a `table-fixed` con anchos explícitos en una constante `ANCHO`.
      - El `min-w` de la tabla **crece con la cantidad de columnas de talla**
        (`ANCHO_FIJO + tallas.length * 36`) en vez de ser el `1000px` fijo de antes: agregar tallas
        ensancha la tabla en lugar de apretar las que ya estaban.
      - Los nombres combinados se dejan **envolver** (`whitespace-normal`, que vence al
        `whitespace-nowrap` del primitivo `TableHead`) en vez de ensanchar la columna — aunque con
        `text-[10.5px]` terminan entrando en un solo renglón igual.
      - **Verificado con las 15 tallas visibles** a 1600/1440/1280 px: la tabla entra completa en
        los tres (1246/1158/998 px, exactamente el ancho del contenedor), **cero celdas con texto
        cortado y cero encabezados cortados**, y la fila de encabezado sigue midiendo 40px — o sea
        una sola línea, ni `2XS-XS` necesitó envolver. A 1280, cada columna de talla queda en 36px.
        Datos de prueba revertidos (las piezas volvieron a 7,969) y usuario borrado.

  - **El "En blanco" se congela al capturar — hallazgo del usuario, confirmado en datos reales
    (2026-09-29)**. Preguntó qué pasa si una OP ya enviada sigue con el checkbox editable y el
    operario lo prende tarde. **No era hipotético**: en `26OP012625` las líneas `7011852716` y
    `-1` tenían el flag en `true` con `en_blanco_yd = 0.0000`, y `core.auditoria` mostró que el
    último cambio a `true` fue **posterior** a las capturas.
    - **Cómo funciona**: `capturarUna()` calcula `cantidad × factorEnBlanco` **con el flag que la
      línea tenía en ese instante** y lo guarda en `consumo_papel.en_blanco_yd`. Tocar el flag
      después cambia `linea_produccion` y **no toca la fila ya escrita**.
    - ⚠️ **La trampa peor: reenviar NO lo corrige.** La captura es idempotente — las tallas ya
      enviadas se saltean (`yaEstaban`) — así que prender el checkbox y darle "Enviar" otra vez no
      recalcula nada, y quien lo haga cree razonablemente que lo arregló.
    - **Escenarios que sí afecta**: (a) el costeo futuro queda corto en 0.6 yd por pieza; (b) el
      Google Sheet ya escribió la columna L vacía y los Dashboards leen eso; (c) corregirlo exige
      anular y recapturar, y como **las anulaciones no se espejan**, eso deja una fila duplicada en
      la hoja.
    - **Lo que NO afecta: el rollo.** El panel y la merma descuentan **solo `consumoYd`** —
      `enguiamiento_yd` y `en_blanco_yd` se registran pero nunca se restan del rollo. Verificado en
      `costeo-rollos.service.ts` (`_sum: { consumoYd: true }`). Sigue abierta la pregunta de si
      deberían descontarse; si algún día se decide que sí, este olvido pasaría a distorsionar
      también el stock del rollo.
    - **Hoy el daño está acotado** porque F5 (Ordenes de Facturación) no existe: nadie lee
      `en_blanco_yd` salvo el espejo a Sheets.

  - **Los dos arreglos que pidió el usuario (2026-09-29)**. Decidió no corregir los datos —el envío
    de esa OP era de prueba— pero sí el flujo:
    1. **El checkbox se bloquea una vez enviada la línea.** `editarLineaProduccion()` rechaza con
       **409** si la línea ya tiene consumo de PRODUCCIÓN vigente, con un mensaje que explica que
       el valor quedó congelado y que para cambiarlo hay que anular y recapturar. `buscarPorCodigo`
       devuelve ahora `enviada` por línea (mismo criterio, `take: 1` sobre `consumosPapel`) y
       `ordenes-page.tsx` deshabilita el `Checkbox` mostrando "ya enviada". La guarda va en el
       servidor **además** de la pantalla: ocultar el control no es un gate.
    2. **La plantilla de Órdenes gana la columna "En blanco (SI/NO)"**, porque los operarios saben
       antes de imprimir cuáles llevan ese consumo. Acepta `SI/SÍ/S/X/1/TRUE` y `NO/N/0/FALSE`;
       vacía es `false`.
       - ⚠️ **Va DESPUÉS de las columnas de talla y el parser la ubica POR NOMBRE de encabezado, no
         por índice.** Ponerla antes correría `IDX_TALLA_INICIO` y haría que un archivo armado con
         la plantilla vieja cargara cantidades en la talla equivocada, **en silencio** — el modo de
         falla ya advertido en el comentario de `TALLAS_IMPORT_LINEAS`. Y buscarla por nombre la
         deja a salvo de la próxima talla que se agregue, que la correría de lugar.
       - Una celda con texto no interpretable (`tal vez`) es un **error explícito de la fila**, no un
         `false` silencioso — mismo criterio que la validación de fechas del import de Consumo
         Estándar, y especialmente importante acá porque es el dato que después ya no se puede
         corregir.
    - **Verificado de punta a punta**: la plantilla real trae 36 columnas con "En blanco (SI/NO)" en
      la última; un archivo con `SI`/`NO`/vacía/`tal vez` dio `true`/`false`/`false`/error; un
      archivo **sin** la columna (simulando la plantilla vieja) cargó en `false` sin error y **con
      las tallas leídas correctamente** (`M: 5`), que era lo que había que probar; el `aplicar`
      escribió los flags como correspondía. La guarda: línea sin enviar → 200, línea enviada → 409.
      En navegador, las 4 líneas de `26OP012625` salen con el checkbox deshabilitado y "ya enviada",
      y una línea nueva sale editable. Datos y usuario de prueba borrados — la base volvió a 68 OP,
      253 líneas y 7,969 piezas.

  - **El rollo ahora descuenta los TRES conceptos, no solo la impresión (2026-09-30)**. Cierra la
    pregunta que había quedado abierta desde F4: el usuario confirmó que **enguiamiento, papel en
    blanco, consumo de impresión y reposiciones salen todos del rollo montado en ese momento**.
    - **Antes se restaba solo `consumoYd`.** El enguiamiento y el papel en blanco se registraban en
      `consumo_papel` pero nunca se descontaban, así que ese papel —que sí se gasta físicamente—
      terminaba cayendo en la **merma** del desmontaje como si fuera pérdida inexplicada. Con el
      cambio, la merma vuelve a medir solo lo que de verdad no se puede explicar.
    - **Las reposiciones ya se descontaban**, contra lo que parecía: escriben su papel en
      `consumoYd` y la agregación **nunca filtró por `origen`**. Sus filas traen enguiamiento y en
      blanco en 0 (default de la columna), así que sumar los tres campos no las altera — verificado
      contra el montaje 15, que es solo reposiciones y quedó idéntico en 9.0000 yd.
    - **Un solo lugar que tocar**: todo pasa por `consumoPorMontajeIds()` — el panel, el historial y
      el cálculo de merma del desmontaje lo usan, y `historialConsumoRollo()` también. Pasó de
      `_sum: { consumoYd: true }` a sumar los tres campos.
    - ⚠️ **La merma NO se guarda: se calcula en vivo** (`montaje_rollo` no tiene columna de merma,
      verificado contra el schema). O sea que este cambio reescribe también la merma que se muestra
      de montajes **ya cerrados**. Con los 4 montajes de prueba de hoy no importa, pero conviene
      saberlo antes de comparar contra un número anotado de antes.
    - La etiqueta del modal de desmontaje aclara ahora qué incluye el número
      ("impresión + enguiamiento + en blanco + reposiciones"), porque de ahí sale la merma y quien
      desmonta lo está comparando contra una lectura física.
    - **Medido antes y después sobre los datos reales**: montaje 11 pasó de 59.5689 a **64.2096 yd**
      (+4.6407 de enguiamiento), 20 de 0.8264 a 0.9108, 22 de 8.9097 a 9.6693, y 15 sin cambio. La
      API devuelve exactamente esos valores. El papel en blanco suma 0 en todos porque ninguna línea
      tenía el flag al capturar — mismo hallazgo de más arriba.
    - **Pedido en el mismo mensaje y ya construido**: el reporte consolidado, ver el punto
      siguiente.

  - **Alta de `BSNS-AC-8800A` / `BSNS-AC-8800Y` y sus 5 consumos estándar (2026-09-30)**. El usuario
    mandó una tabla de 5 consumos (arm sleeve volleyball adulto y youth, tallas combinadas) y pidió
    verificar si estaban cargados. **No lo estaban, y la causa era que los dos productos no
    existían** — el import deja pendiente cualquier fila cuyo producto no esté en el catálogo.
    - **Descartado antes de crear nada**: no eran un código escrito distinto (buscando `8800`,
      `AC-88` y `ARM SLEEVE` solo aparecen `CP3000`, `CSJ-ARMSLV` y `TI-AS1000`, que son otros
      productos), y **no figuran en ninguna de las fuentes del usuario** — se barrieron los 20+
      `.xlsx` de la carpeta de análisis buscando `BSNS-AC` y `ARM SLEEVE VOLLEYBALL`: cero
      coincidencias. O sea que descripción y cliente salieron solo de la captura.
    - ⚠️ **El bloqueo aparente era falso.** La regla "un producto exige un desarrollo APROBADO"
      parecía obligar a inventar una receta, porque `aprobar()` exige al menos una línea de insumo.
      Pero **solo 4 de los 1,285 desarrollos tienen receta**: los otros 1,281 —incluidos los tres
      arm sleeves que ya existían— quedaron `APROBADO` con **cero líneas** en el backfill de la
      migración de desarrollos. Un producto sin receta y con costo Q0.00 es el estado normal de
      este catálogo, no una anomalía, así que crear estos dos igual **no inventa ningún costo**.
    - Los desarrollos se crearon por la API y se aprobaron **por SQL**, que es la única parte que la
      API no puede expresar sin una receta que no existe. El CHECK `ck_desarrollo_aprobado_en`
      obliga a registrar `aprobado_en`, así que la aprobación quedó fechada y con autor. Los
      productos y los 5 consumos sí se crearon por los endpoints reales (201 en los 7 casos).
    - **Los códigos de desarrollo (`BSNS-AC-8800A-DES`, `BSNS-AC-8800Y-DES`) son un marcador
      trazable, no el número real**, que nadie conoce todavía. Es seguro: la FK
      `productos.desarrollo -> desarrollos.codigo` es **ON UPDATE CASCADE**, así que cuando aparezca
      el número verdadero basta un `UPDATE` sobre `recetas.desarrollos.codigo` y el producto se
      actualiza solo. Talla base elegida por criterio (`S-M` para adulto, `YS-YM` para youth), no
      por dato.
    - **Verificado**: las 5 filas cuadran con la tabla del usuario (17.5 → 0.4861, 18.5 → 0.5139,
      19 → 0.5278, 12.75 → 0.3542, 13.25 → 0.3681 — la columna `yardas` la calcula la base), cliente
      BSN SPORTS, vigentes desde hoy. El invariante `count(productos) = count(v_producto_costo)`
      sigue en pie (1,287 = 1,287). Autoría reasignada a `admin` y usuario desechable borrado.
    - **Pendiente del usuario**: receta y precio de venta de los dos (hoy Q0.00, como los otros
      1,281), y el número real de desarrollo si existe.

  - **F5-1A · El papel en blanco pasa a ser 4 yd POR ORDEN (2026-10-01)**. Planta reportó que el
    consumo en blanco es un monto fijo por orden, no un factor por prenda. Medido antes de tocar
    nada: en `26OP013300` (396 piezas) la regla vieja (`cantidad × 0.6`) habría cargado **237.60 yd
    contra las 4 que corresponden** — 59×, o sea **el 20% de un rollo** de ~1,100 yd en una sola
    orden.
    - **El cambio no es de fórmula, es de modelo.** El "en blanco" dejó de calcularse dentro de la
      captura por talla y pasó a ser **su propia fila** de `consumo_papel` (`origen='EN_BLANCO'`,
      sin línea ni talla). Migración `20261001120000_en_blanco_por_orden` (+ `rollback.sql`):
      columnas `consumo_en_blanco`/`en_blanco_yd` en `orden_produccion`, el CHECK de `origen`
      ampliado, `ck_consumo_papel_origen_regla` reescrito, e índice único parcial
      `(id_orden_produccion) WHERE origen='EN_BLANCO' AND anulado_en IS NULL`.
    - ⚠️ **Eso disuelve el bug del 2026-09-29**, no solo lo parchea. El problema era que el flag
      vivía en la línea y quedaba congelado al capturar: prenderlo después no hacía nada y reenviar
      tampoco lo corregía. Al ser una fila independiente se puede cargar **antes, durante o
      después** de enviar las líneas, cobrarlo dos veces es imposible **a nivel de base**, y
      deshacerlo es anular una fila con autor y motivo. Por eso se eliminó el 409 de "ya enviada":
      dejó de hacer falta.
    - **Dónde se carga**: si la orden no se imprimió todavía, marcarla solo guarda la intención y la
      fila se crea sola en el primer envío, contra el rollo que la imprima. Si ya se imprimió, se
      carga **al rollo que la imprimió** (el del último consumo de producción de esa orden), no al
      que esté montado ahora — así un olvido se corrige sin atribuirle papel a un rollo que nunca
      tocó esa orden.
    - **`consumo_yd` va en 0 y el monto en `en_blanco_yd`**, no al revés: `consumoPorMontajeIds()`
      ya suma los tres conceptos, así que el panel, el historial y la merma la recogen **sin tocar
      una línea de código**.
    - **Las columnas `consumo_en_blanco`/`factor_en_blanco` de `linea_produccion` se eliminaron.**
      Dejarlas sería tener dos fuentes de verdad para el mismo flag, que es exactamente el patrón
      que produjo el bug. El backfill las subió a la orden primero (una orden lleva papel en blanco
      si **cualquiera** de sus líneas lo tenía): 3 órdenes reales migradas.
    - El endpoint vive en **Consumo de Papel y no en Órdenes** (`PATCH
      /costeo/consumo-papel/orden/:codigo/en-blanco`), porque lo que hace es crear o anular consumo.
      Gateado con `costeo.consumo.capturar`; **quitar** un papel en blanco ya cargado exige además
      `costeo.consumo.anular`, resuelto como permiso **opcional** en el controlador (no en
      `@RequirePermissions`, que exige TODOS los que lista). `editarLineaProduccion` y su DTO se
      eliminaron.
    - **Plantilla de Órdenes**: la columna "En blanco (SI/NO)" se sigue leyendo por fila pero se
      guarda en la ORDEN. Si dos filas de la misma OP se contradicen, **ambas quedan con error
      explícito** en vez de elegir una en silencio. El texto del encabezado **no** cambió a
      propósito: el parser lo ubica por nombre, y renombrarlo haría que los archivos ya armados
      perdieran la marca sin avisar.
    - ⚠️ **El espejo a Google Sheets deja de llevar el papel en blanco** (columna L siempre vacía):
      una fila `EN_BLANCO` no tiene talla ni LINE, así que no encaja en las 15 columnas del libro
      legacy. Los Dashboards sub-reportan 4 yd por orden — muchísimo menos error que las 237 que
      recibían antes, pero queda como **decisión pendiente** del usuario.
    - **El reporte de consumo por OP no necesitó cambios**: no filtra por `origen`, así que las
      filas `EN_BLANCO` caen en la rama correcta y suman en su columna.
    - **Verificado** contra una instancia aislada en el puerto 4055 con los ids de Sheets apuntando
      a un libro inexistente (el `.env` local apunta a producción). Sobre `26OP013306`, una de las
      OP de 396 piezas: marcar sin producción → solo intención (`cargado:false`); primera captura →
      fila `EN_BLANCO` de 4.0000 creada sola; segunda captura de la misma OP → **sigue habiendo una
      sola fila**; desmarcar → anulada; volver a marcar ya impresa → cargada al montaje 23, el que
      la imprimió; operario sin `costeo.consumo.anular` → **403** con el mensaje correcto. El rollo
      descontó **4.0000 yd** de papel en blanco, no 237.60. Import con dos filas contradictorias →
      ambas con error; con ambas en SI → la orden queda marcada. En navegador: el checkbox quedó en
      la ficha de la orden, la columna de la tabla de líneas desapareció, marcar/desmarcar refleja
      "4 yd"/"No lleva" sin errores de consola. Todos los datos y usuarios de prueba borrados — la
      base volvió a 68 OP / 253 líneas / 7,969 piezas / 20 consumos.
    - **Lo que NO entra acá**: la vista tabular con selección por impresora, el envío masivo en
      tandas de 300, la exclusividad por impresora (tope, no muro) y el estado del rollo en el
      encabezado. Son 1B-1D, decididos con el usuario pero sin construir.

  - **F5-1B · El papel en blanco es 2-10 yd elegibles, y la vista pasa a tabular (2026-10-05)**.
    Cuatro pedidos del usuario en un mismo mensaje.
    - **El monto deja de ser 4 fijo**: ahora es un ENTERO entre 2 y 10 que el operario elige al
      marcar. Migración `20261005120000_en_blanco_entero_2_a_10` (+ rollback): el CHECK pasa de
      `>= 0` a `BETWEEN 2 AND 10` **más `= trunc()`**. El rango va en la base y no solo en el DTO
      porque es regla de negocio: un POST a mano o una corrección por SQL chocan con el mismo
      límite que el formulario. Verificado intentando violarlo: 1, 11 y 4.5 rechazados; 2, 7 y 10
      aceptados.
    - ⚠️ **Corregir la cantidad de una fila ya cargada ANULA Y RECREA, no edita en el lugar.** Una
      fila de `consumo_papel` es inmutable salvo por su anulación (misma regla que Reposiciones);
      pisarle las yardas dejaría el histórico diciendo que siempre fueron las nuevas. Verificado:
      corregir de 7 a 3 deja la de 7 anulada con el motivo *"Se corrigió el papel en blanco de 7 a
      3 yd"* y la de 3 vigente.
    - **Reporte, según la captura del usuario**: el **Detalle** pierde la columna "En blanco" y el
      monto se muestra en **Consumo**; la fila se identifica como **"En blanco por REPO"** en
      Producto. El **Resumen conserva** su columna. Sale gratis una sola regla sin `if`: como una
      fila PRODUCCION trae `enBlancoYd` en 0 y una EN_BLANCO trae `consumoYd` en 0, el detalle
      muestra **la suma de los dos** y da lo correcto en ambos casos. La etiqueta vive en
      `ETIQUETA_EN_BLANCO`, compartida con el espejo.
    - **El espejo a Sheets vuelve a llevar el papel en blanco**, cerrando la decisión que había
      quedado abierta en 1A: va en su propia fila con `ITEM = "En blanco por REPO"`, el monto en
      **CONSUMO YDS** y la columna EN BLANCO vacía — "tal cual aparece en el reporte", pedido
      textual del usuario. En la captura viaja dentro de `filasSheets` para que el lote mande todo
      en **una** llamada; en el marcado manual se dispara aparte. El armado de la fila está en
      `filaSheetsEnBlanco()`, un solo lugar: duplicarlo sería duplicar el contrato con un libro que
      leen los Dashboards.
    - ⚠️ **Desmarcar o corregir deja una fila huérfana en la hoja**: anular revierte en Postgres,
      pero las anulaciones no se espejan (el legacy solo hace `append`). Es la convención de
      siempre; con el en blanco ahora corregible a propósito va a pasar más seguido.
    - **Vista tabular en Impresión de OPs** (`components/tabla-pendientes.tsx`, reemplaza
      `panel-pendientes.tsx`): agrupada por **impresora → orden**, con casilla de envío por orden,
      "seleccionar todas" por grupo y global, y el control del papel en blanco (casilla + cantidad)
      **en la fila de la ORDEN**.
      - **El control va por orden y no por ítem** porque el valor es de la orden: N controles
        escribiendo lo mismo invitan a poner dos números distintos, que es la contradicción que ya
        hubo que validar en el import. Y **no escondido en el detalle**, porque obligaría a abrir
        orden por orden, justo lo contrario de una vista para trabajar la cola de corrido.
      - La cantidad **solo se habilita con la casilla marcada**: un número editable con la casilla
        apagada hace creer que ya se cargó algo.
      - **`pendientes` ahora agrupa en el servidor** y su tope pasó de 200 a **2500 líneas**: el
        tope es por línea, y con ~3.8 líneas por OP, 500 órdenes son ~1,900 — 200 truncaba la mitad
        de la cola sin ninguna señal. Devuelve `truncado` y la pantalla lo **dice** en vez de
        callarlo.
      - **El contador es de LÍNEAS, no de órdenes**: seleccionar MS 1 (17 órdenes) dice "Enviar
        seleccionadas (53)". Decir "3 órdenes" cuando son 47 líneas confunde al estimar el rollo.
      - **El detalle se trae a demanda** (`components/detalle-orden.tsx`) y reusa `TarjetaLinea` sin
        tocarla. Traerlo con la lista sería pedir miles de tallas que nadie va a mirar; react-query
        lo cachea, así que expandir y colapsar no reconsulta. Dentro de la tabla las tarjetas van
        **sin botón de envío**: ofrecer dos caminos de envío en la misma pantalla es lo que produce
        el "creí que ya lo había mandado".
      - ⚠️ **El detalle va en una fila propia con `colSpan`, pegada a la de su orden.** El primer
        intento lo renderizaba después de la tabla entera para evitar el `colSpan`: con 17 órdenes
        en un grupo, expandir la primera mostraba su detalle a 17 filas de distancia. Encontrado
        mirando la captura, no por un error.
      - **Envío en tandas de 300 líneas** (`LINEAS_POR_TANDA`), con un **solo resumen al final**:
        con ~1,900 líneas son ~7 tandas y siete mensajes serían ilegibles. El tope lo manda el
        espejo (300 líneas ≈ 1,500 filas en la hoja); cuando el espejo se retire puede subir.
      - `GrupoColapsable.titulo` pasó de `string` a `ReactNode` (compatible hacia atrás) para poder
        poner el nombre de la impresora y sus contadores con estilos distintos.
    - **Verificado**: contra una instancia aislada con ids de Sheets falsos, el rango, la
      corrección anular-y-recrear y la forma del reporte (el detalle ya no trae `enBlancoYd`, las
      filas salen como `En blanco por REPO` con el monto en `consumoYd`, el resumen conserva la
      columna y el total cierra). En navegador: 4 grupos de impresora con sus contadores, 66
      órdenes, seleccionar MS 1 → "(53)", el detalle abre bajo su fila con las tarjetas reales,
      marcar el papel en blanco habilita la cantidad y guardarla en 8 queda en la base. **Cero
      desborde horizontal a 1600, 1280, 820 y 390 px** y consola limpia. Datos y usuario de prueba
      revertidos.
    - **Bug de 1B encontrado al revisar lo que el usuario hizo en la pantalla, no por una prueba
      propia** (`core.auditoria`, 2026-10-05): el campo de cantidad guardaba en CADA tecla, así que
      elegir 7 con las flechas disparó **diez PATCH seguidos** (4·2·6·7·8·9·10·9·9·9). Sobre una
      orden sin imprimir solo ensucia la auditoría, pero sobre una **ya impresa** cada paso ANULA Y
      RECREA la fila de consumo, así que dejaría cinco pares anulado/creado para un solo cambio de
      opinión. Corregido: la cantidad se guarda **al salir del campo o con Enter** (estado local
      mientras se escribe, `useEffect` para resincronizar con el servidor), y un valor fuera de
      rango no se manda — vuelve el del servidor en vez de dejar creer que guardó algo. Verificado
      con clic real: la secuencia completa pasó de ~12 PATCH a **3**, y las flechas disparan **0**
      hasta salir del campo. *Lección*: mirar `core.auditoria` después de que el usuario prueba
      algo encuentra defectos que ninguna prueba propia iba a encontrar.

  - **F5-1C · Tope (no muro) al enviar a la impresora de otro operario (2026-10-05)**. Pedido del
    usuario: "regularmente se le asigna a un solo operario de impresión una sola impresora, por lo
    que NO debería otro usuario poder enviar consumos a una impresora que otro esté usando",
    eligiendo explícitamente **el tope sobre el muro**.
    - ⚠️ **No puede ser un bloqueo, y eso descartó mi primer diseño.** Había propuesto resolver la
      pertenencia por quién montó el rollo; el usuario aclaró que un operario puede montar en la
      tarde, retirarse, y otro desmontar en la noche — "debe ser posible esa situación". Un muro
      rompería el cambio de turno, que es operación normal.
    - **La señal es ACTIVIDAD REAL, no una asignación**: no existe "impresora asignada" en el
      modelo, es una costumbre de planta. `ocupacionDeImpresoras()` usa dos fuentes, en orden de
      fuerza: el último `consumo_papel` vigente de esa impresora (alguien está trabajando ahí
      ahora) y, si no hay ninguno en la ventana, quién montó el rollo que sigue puesto. Dos
      consultas con `DISTINCT ON`, no una por máquina. La actividad propia **nunca** ocupa:
      avisarle a alguien que él mismo la está usando lo entrenaría a confirmar sin leer.
    - **Ventana de 8 horas = un turno** (`VENTANA_OCUPACION_MS`), elegida por el usuario entre tres
      opciones. Demasiado corta y el aviso calla a mitad de un turno que sí es de otro; demasiado
      larga y se vuelve rutina que se confirma sin leer, el peor resultado para un tope. El mensaje
      lleva **el "hace cuánto" exacto** para que decida quien está frente a la máquina — con los
      datos reales se vio su valor: MS 2 apareció como "la usa Administrador · envió hace 7 h 14
      min", que un operario lee y entiende que ya no está.
    - **El tope vive en el servidor**, no en la pantalla: `capturarUna()` rechaza con
      `ConflictException` y **respuesta estructurada** (`motivo: 'IMPRESORA_OCUPADA'` más
      `idImpresora`/`impresora`/`usuario`/`desde`) si la impresora no viene en
      `idsImpresoraAjenaConfirmadas`. Es una **lista explícita y no un booleano**: un "sí, mandá
      todo" confirmaría a ciegas máquinas que el operario no vio nombradas. Verificado que
      confirmar una impresora distinta **no** habilita la otra.
    - La ocupación se resuelve **una vez por lote** en `capturarLote()`, no por línea: un envío de
      300 líneas de la misma máquina habría hecho 300 veces la misma consulta.
    - **Migración `20261005140000_consumo_impresora_ocupada_por`** (+ rollback): columna nullable
      `impresora_ocupada_por` con FK `RESTRICT` a `core.usuarios`, CHECK (`<> creado_por` — dos
      iguales no significan nada y ensuciarían cualquier reporte que cuente estos casos) e **índice
      parcial** (los casos marcados son la excepción; es lo que hace barato el reporte futuro).
      Guarda el **usuario** y no un booleano: "lo envié sobre la máquina de Pedro" es la pregunta
      que se va a querer responder. Sin backfill: nadie envió sobre impresora ajena porque la regla
      no existía, así que NULL es el valor correcto para todo el histórico.
      - El registro es lo que **le da dientes al tope**. La alternativa (dejarlo solo en
        `core.auditoria`) se descartó con el usuario por tres costos concretos: ahí `id_usuario` es
        `ON DELETE SET NULL` —borrar un usuario le borra el nombre al histórico, ya pasó con los de
        prueba—, habría que parsear el detalle JSON, y el reporte saldría más caro.
    - **La fila `EN_BLANCO` HEREDA la marca** (`asegurarFilaEnBlanco` ganó el parámetro). Ese papel
      sale del mismo rollo ajeno: sin esto, el total de la prueba habría sido 4.132 yd en vez de
      **9.1320**, o sea el reporte perdía más de la mitad.
    - **El mensaje va en hora de Guatemala, no en ISO.** El primer intento mandaba
      `2026-10-06T05:19:21.316Z`, que para el operario son las 23:19 del día anterior y no le dice
      nada. `desde` viaja además estructurado para que la pantalla diga "hace 12 min".
    - Frontend: aviso ámbar en el encabezado de cada impresora ("La usa Ana · envió hace 9 min"), y
      **el tope se resuelve desde el resumen del envío**, no con un diálogo previo: si el servidor
      frena líneas, el aviso agrupa **por máquina** (no por línea: repetir "Ana usa la MS 1"
      cincuenta veces no agrega nada) y ofrece **"Confirmar y enviar igual (N línea(s))"**, que
      reenvía SOLO las frenadas. Se eligió así sobre un pre-diálogo porque no estorba el camino
      normal y funciona aunque `pendientes` no conozca esa impresora — el servidor es el que sabe.
    - **Decisión del usuario: NO se extiende a Reposiciones.** El operario de reposiciones no está
      usando la impresora, pide papel para reponer; avisarle que "otro la está usando" sería ruido.
    - **Verificado** contra la instancia aislada (ids de Sheets falsos) con dos usuarios
      desechables, uno ocupando y otro enviando encima: el CHECK, la FK y el RESTRICT rechazando lo
      que deben (23514 / 23503 / 23001), Beto ve la ocupación y Ana no la ve sobre sí misma, 409 sin
      confirmar, envío correcto confirmando, y las filas marcadas en la base con el usuario justo.
      **Con clic real en navegador**: el aviso en el encabezado, el botón de confirmar, y tras
      confirmar "1 línea(s) enviada(s)" con la fila registrada a nombre de quien la tomó. Cero
      desborde a 1600/1280/820/390 px y consola limpia. Datos y usuarios de prueba borrados.

  - **F5-1D · Estado del rollo en el encabezado y estimado de lo seleccionado (2026-10-05)**.
    - **El estado del rollo lo devuelve `pendientes()`, NO el `panel()` de Gestión de Rollos.**
      Medido antes de decidirlo: de los 7 roles que ven Impresión de OPs, **ANALISTA_COSTOS no
      tiene `costeo.rollo.ver`**, así que pedirlo desde el navegador le habría dado 403 y un
      encabezado vacío. Es la misma lección del reporte de consumo.
    - Pero **no se recalcula**: `estadoDeRollosPorImpresora()` nuevo en `costeo-rollos.service.ts`
      (inyectado vía `CosteoRollosModule`, que ya se exportaba) reusa `consumoPorMontajeIds()`, la
      fuente del panel, del historial y de la merma. Verificado que da **exactamente lo mismo** que
      el panel en las tres impresoras con rollo (1074.9433 / 1099.0892 / 1100.0000) — ese contraste
      es el que delataría una segunda fuente de verdad.
    - **El estimado por orden se calcula en el servidor** (convención #1) con las mismas fórmulas
      de la captura y el estándar vigente hoy: estándar × cantidad + enguiamiento + el papel en
      blanco **que todavía no se cobró** (si ya tiene su fila, sumarlo haría creer que el rollo
      rinde menos). Los estándares de toda la cola se resuelven en **una** consulta, igual que en
      `buscarPorCodigo` — con ~2,500 líneas, una por línea sería inviable.
      - **Prueba dura, la que importa**: capturar `26OP012954` bajó el rollo **195.9366 yd** contra
        un estimado de **195.9365**. O sea el número predice lo que de verdad se descuenta,
        incluido el papel en blanco.
      - Una orden con tallas sin estándar muestra **"falta estándar"** y no un estimado parcial:
        ese número haría creer que el rollo alcanza. Son además las tallas que impiden enviarla.
    - **El aviso de "no alcanza" es aviso, no bloqueo** (el usuario: "no se da mucho... debe ser
      registrado y el valor negativo en rojo"). Con todo MS 1 seleccionado dice "1,929.97 yd de
      1,074.94 — no alcanza para todo el lote (faltan 855.03 yd). Se puede enviar igual; el rollo va
      a quedar en negativo y eso queda registrado". El restante negativo **no se arrastra al rollo
      siguiente**: es la medición de cuánto rindió de más o de menos ese rollo respecto de lo que
      declaraba el fabricante, que era justamente lo que se quería deducir.
    - La suma es **por grupo** y no global: el rollo es de esa máquina, sumar la selección de las
      otras daría un contraste sin sentido.
    - ⚠️ **"Sin rollo montado" y "rollo sin yardas declaradas" dicen cosas distintas.** Un primer
      texto mostraba el segundo en los dos casos, lo que mandaba a buscar un dato del rollo cuando
      el problema era que no hay rollo. Encontrado verificando MS 6, que es el caso real.
    - **Verificado en navegador** con los 4 grupos reales: el papel y las yardas con % en cada
      encabezado, MS 6 con "Sin rollo montado", la columna Estimado con los valores del backend, y
      el contraste en los cuatro casos (no alcanza ×2, alcanza, sin rollo). Cero desborde a 1600,
      1280, 820 y 390 px; consola limpia. Datos y usuario de prueba borrados.
    - **Las 12 yd por montaje y las 4 yd por interrupción quedan CERRADAS, y con eso se cierra el
      bloque F5-1 — pero porque YA ESTÁN REGISTRADAS, no porque se decidiera dejarlas fuera**
      (aclaración del usuario tras consultarlo en planta, 2026-10-05). Es una distinción que
      importa, porque lo contrario llevaría a diagnosticar mal la merma:
      1. **Las 12 yd del arranque ya vienen prorrateadas dentro del consumo estándar de cada
         prenda.** El operario las mencionó como "lo que se desperdicia al montar el rollo", que
         suena a consumo no contabilizado, pero contablemente ya estaban tomadas en cuenta al
         armar el estándar. O sea que modelarlas aparte (`origen='MONTAJE'`) las habría cobrado
         **dos veces**.
      2. **Las interrupciones SON el papel en blanco.** Las "4 yd" eran un aproximado que el
         operario dio de memoria; por eso el monto quedó configurable entre 2 y 10 en F5-1B, que
         es justamente lo que hacía falta: no siempre es el mismo.
      - **Consecuencia, y es buena**: la merma del desmontaje vuelve a medir **solo lo
        inexplicado**, sin arranques ni interrupciones legítimos adentro. Y el estimado de 1D es
        completo, no optimista: el arranque viaja dentro del estándar y el papel en blanco se suma
        aparte cuando falta cobrarlo.
      - ⚠️ **Una versión anterior de esta nota decía lo contrario** —que esas yardas caían en la
        merma y que el estimado era optimista—. Era incorrecto: se escribió antes de que el usuario
        confirmara el prorrateo. Si un análisis futuro encuentra esa afirmación en algún lado, está
        equivocada.
      - El **reporte de conciliación** (`rollo = Σ OP + arranques + interrupciones + merma`) pierde
        su motivo por lo mismo: no hay conceptos sueltos que conciliar, ya están todos dentro del
        consumo registrado.

  - **El desmontaje deja de pedir la lectura del rollo, y la merma se retira (2026-10-06)**. El
    usuario preguntó si no convenía que el valor se registrara solo, sin intervención. Mi primera
    respuesta fue que no —"es el único dato físico del sistema"—, **y estaba mal calibrada**: al
    preguntarle cómo se mide el rollo en planta, confirmó que **se estima a ojo por el diámetro**,
    sin instrumento. Eso cambia todo: pedir un número de cuatro decimales (`1031.7904`) sobre una
    estimación visual es falsa precisión, y la merma que salía de su diferencia medía, en buena
    parte, el pulso de quien estimaba.
    - **`yardasFinales` salió del DTO**: lo calcula el servidor como `iniciales − consumo
      histórico`, el mismo "Restante" del panel. Verificado inyectando `yardasFinales: 5` en el
      cuerpo: el servidor lo **ignoró** y guardó 1000. El `whitelist` del ValidationPipe descarta
      lo que el DTO no declara, así que el cliente ya no puede decidir un dato de inventario.
    - **Se sigue GUARDANDO aunque sea derivable**, y no es redundancia: congela cuánto quedaba en
      *ese* momento. Si después se carga consumo con fecha retroactiva contra ese montaje,
      recalcularlo daría otro número y el hecho histórico se perdería. Queda `null` si el rollo no
      trae `yardas_iniciales` — null dice "no se sabe" mejor que un 0 inventado.
    - **`merma` y `yardasUsadasFisicas` se quitaron de `detalleMontaje()`**, no solo de la
      pantalla. Con las yardas finales derivadas del propio cálculo, los términos se cancelan y la
      merma da **cero por construcción**: no medía nada, y un campo que siempre vale 0 termina en
      un reporte creyendo que significa algo. El modal muestra ahora "Queda en el rollo · es lo que
      se va a registrar" en su lugar.
    - **Qué se perdió, dicho explícito**: ya no se puede detectar a nivel de rollo que falten
      consumos por cargar, ni estimar en agregado si los rollos vienen con más o menos yardas de
      las que declara el fabricante. Era una medición ruidosa —se promediaba sobre muchos rollos—
      pero era la única. **Revertirlo es barato**: devolver `yardasFinales` al DTO y recuperar las
      dos líneas de cálculo, que quedaron documentadas en el servicio. La columna nunca se borró.
    - Verificado con curl (el valor inyectado ignorado, doble desmontaje 409, estado inválido 400,
      cuerpo vacío 400) y **con clic real en el navegador**: el modal sin campo numérico, sin la
      palabra "Merma", y el desmontaje completo en un clic guardando 1000.00 yd. Cero desborde a
      1500/820/390 px y consola limpia. Factura, rollo, montaje y usuario de prueba borrados.
    - **Dos cosas que se revisaron y NO hizo falta tocar**: dejar el campo vacío adrede ya era
      imposible (la pantalla cortaba y el DTO exigía el campo, 400), y declarar *menos* yardas de
      las reales **sube** la merma en vez de bajarla, así que nunca fue la vía para esconder
      desperdicio — el riesgo estaba en el sentido contrario. El usuario decidió **no** separar el
      papel descartado por daño de la merma inexplicada por ahora.

  - **Bitácora de usuarios — analizado y decidido, NO construido (2026-10-07)**. El usuario preguntó
    cómo ver qué hace cada usuario. **Pidió explícitamente no construirlo todavía**; queda esto
    anotado para no repetir el análisis cuando lo retome.
    - **Lo que YA existe**: `core.auditoria` con 365 registros desde el 2026-07-24 (usuario,
      empresa, entidad, id de entidad, acción, `datos_anteriores`, `datos_nuevos`, IP, user agent,
      fecha), y un `GET /erp/api/auditoria` gateado con `plataforma.auditoria.ver` — permiso que hoy
      solo tiene ADMIN. Cubre consumos, montajes, reposiciones, órdenes, usuarios, productos y
      desarrollos. Es lo que se usó en esta misma sesión para reconstruir las pruebas del usuario y
      encontrar el bug de los diez PATCH del campo de cantidad.
    - **Por qué ese endpoint no alcanza**: devuelve `idUsuario` y no el nombre; solo filtra por
      empresa y entidad —no por usuario ni por fecha, que es justo lo que se pregunta—; y tiene un
      tope fijo de 50 sin paginación. No lo consume ninguna pantalla.
    - ⚠️ **El problema de fondo: 112 de los 365 registros (31%) no tienen autor.**
      `auditoria.id_usuario` es `ON DELETE SET NULL`, así que **borrar un usuario le borra el nombre
      a todo su histórico**. Buena parte de esos 112 son usuarios de prueba desechables de sesiones
      anteriores, pero el mecanismo es idéntico para un empleado que se va. Choca de frente con el
      propósito de una bitácora — es la misma razón por la que `montaje_rollo.desmontado_por` se
      hizo con FK `RESTRICT`, que la auditoría no tiene.
    - **Decisión del usuario: guardar el username como TEXTO** en cada registro, no cambiar la FK a
      RESTRICT. Su criterio, textual: *"si el usuario se retira de la empresa, ya no me interesa,
      pero sí me interesa saber qué hizo"*. O sea el usuario debe poder borrarse y el rastro
      sobrevivirle — lo contrario de lo que se eligió para `desmontado_por`, y acá es lo correcto
      porque la auditoría no protege ninguna integridad referencial, solo narra.
      - Al implementarlo: el backfill recupera el nombre de **253 de los 365** registros (los que
        todavía tienen `id_usuario`). **Los 112 ya perdidos no vuelven** — ese dato se fue con los
        usuarios borrados.
    - **Alcance: no requiere nada nuevo.** `plataforma.auditoria.ver` ya existe y la pantalla de
      Roles permite asignarlo a cualquier rol sin tocar código ni desplegar. El usuario pidió
      poder dárselo a Gerencia y dejar abierto habilitarlo a otros: eso ya es exactamente cómo
      funciona hoy.
    - **Lo que faltaría construir**, por orden: (1) la columna de texto y su backfill; (2) extender
      `listar()` para devolver el nombre y aceptar filtros por usuario, rango de fechas, entidad y
      acción, con paginación; (3) la pantalla en el desplegable del avatar junto a Usuarios y Roles
      —donde ya estaba anticipado que iría—, mostrando el antes/después de cada cambio, que es el
      dato más útil y ya está guardado.
    - ⚠️ **La pantalla debe narrar en lenguaje natural, no volcar la tabla** (pedido del usuario
      2026-10-07, tras correr la consulta SQL de abajo: *"solo las personas técnicas lo
      entenderían"*). La forma que pidió, textual: *"el usuario kevin editó una orden en la fecha
      dd/mm/yyyy HH:mm desde la pc con IP xx.xx.xx.xx"*, y así para cada tipo de actividad según
      los campos disponibles.
      - O sea hace falta un **traductor de entidad+acción a frase**: `costeo.orden_produccion` +
        `UPDATE` → "editó una orden". Son ~15 combinaciones de entidad×acción en los datos
        actuales, así que es una tabla de textos, no lógica.
      - El `id_entidad` debería resolverse al código legible cuando exista (la orden #56 es
        `26OP013582`), no mostrarse como número — el número no le dice nada a quien lee.
      - `datos_anteriores`/`datos_nuevos` ya están guardados: el "de X a Y" es lo más útil del
        registro y conviene mostrarlo, pero traducido ("cambió el papel en blanco de 4 a 7 yd"),
        no como JSON crudo.
    - **Consulta que sirve mientras tanto**, sin construir nada:
      ```sql
      SELECT a.creado_en, COALESCE(u.username, '(usuario borrado)') AS usuario,
             a.entidad, a.accion, a.id_entidad, a.datos_anteriores, a.datos_nuevos
      FROM core.auditoria a
      LEFT JOIN core.usuarios u ON u.id_usuario = a.id_usuario
      WHERE a.creado_en >= now() - interval '7 days'
      ORDER BY a.creado_en DESC;
      ```

  - **Plantilla de Órdenes: fuera Enguiamiento e Imagen, y el parser deja de leer por posición
    (2026-10-07)**. Tres dudas del usuario probando la carga
    real, las tres verificadas contra el código y los datos antes de responder:
    1. **La línea de producto lleva SOLO el nombre, sin el cliente** (que ya va en su columna). Los
       valores reales son `Basketball`, `Jersey` y `Short`. El modelo guarda el par
       `(cliente, nombre)`, así que escribir `BSN Basketball` deja la fila pendiente. La confusión
       venía del legacy, donde el campo CLIENTE traía los dos pegados — justamente lo que motivó
       modelarlo como catálogo aparte.
    2. **El enguiamiento SÍ lo calcula el servidor** (`cantidad × factorEnguiamiento` al capturar
       el consumo). El valor de la plantilla **no alimentaba ningún cálculo**: su único uso era un
       aviso de contraste en Impresión de OPs. Y ese contraste vale poco, medido: el enguiamiento
       que Diseño teclea **es la misma fórmula redondeada a un decimal** (desviación media 0.02 yd
       sobre 1,128 filas reales), contra un umbral de 0.15 — o sea que compara el cálculo consigo
       mismo y prácticamente nunca salta.
    3. **`imagen` no la mostraba ninguna pantalla** (solo existía en el tipo, con un comentario que
       dice que se omite a propósito) y venía **vacía en las 253 líneas reales**. Entró en F3 por
       "no perder los campos que el `copiarDatos()` legacy descartaba", pero nadie la va a llenar a
       mano en un Excel.
    - La plantilla pasa de **36 a 34 columnas**. Las columnas siguen en la base —
      `enguiamiento_yd` toma su default 0 e `imagen` queda null— para cuando exista el módulo de
      Producción; lo que se quitó es la obligación de teclearlas.
    - ⚠️ **El riesgo real no era quitar las columnas sino el parser.** Leía TODO por índice fijo y
      las tallas desde `IDX_TALLA_INICIO = 18`, así que quitar dos columnas del medio corre todas
      las siguientes: un archivo armado con la plantilla anterior habría cargado las cantidades en
      **la talla equivocada, sin ningún error** — el modo de falla que ya estaba advertido en el
      comentario de `TALLAS_IMPORT_LINEAS`, y que esta vez iba a ocurrir de verdad.
      - Corregido: `resolverColumnas()` ubica **todas** las columnas por NOMBRE de encabezado
        (`ALIAS_COLUMNAS`, normalizado sin tildes), incluidas las tallas una por una. Los nombres
        viejos quedan como alias, así que las dos plantillas conviven: la vieja trae columnas de
        más que simplemente se ignoran.
      - **Verificado con los dos formatos en paralelo**: el archivo nuevo y el viejo (con
        Enguiamiento, Imagen y "Línea de producto") cargan **ambos** `M:7 · XL:3`. Sin esto el
        viejo habría cargado esas cantidades corridas dos tallas.
      - De paso, un archivo sin la fila de encabezado esperada ahora da **400 nombrando qué
        columnas faltan** —con el nombre legible, no el normalizado— en vez de leer filas vacías.
    - **Dos hojas de referencia nuevas** en la plantilla, mismo patrón que "Tipos de papel" del
      import de rollos: **Clientes** (código + nombre, 100 filas) y **Líneas de producto**. Esta
      última lleva el **cliente además del nombre** a propósito: el valor válido depende del
      cliente, así que una lista suelta de nombres dejaría elegir una que no existe para ése. Si no
      hay ninguna dada de alta, la hoja lo dice en vez de salir vacía.
    - ⚠️ **"Línea de producto" se renombró a "Deporte" y se REVIRTIÓ el mismo día.** Queda
      anotado porque el error de criterio es reutilizable: al renombrarlo verifiqué los *valores*
      del catálogo (y advertí que `Jersey` quedaba forzado) pero **no verifiqué si ya existía algo
      llamado "deporte"** en el sistema. Existía: `recetas.deportes`, con 9 deportes reales
      (Football, Basketball, Soccer, Baseball, Volleyball, Compression, Track, Training, Lacrosse).
      El usuario lo encontró al abrir la plantilla nueva.
      - **Son dos cosas distintas y ambas tienen razón de ser.** `costeo.linea_producto` es la
        agrupación comercial **por cliente** heredada del legacy (de ahí `Jersey` y `Short`), y
        `costeo.plantilla_insumo` cuelga de ella para F5. `recetas.deportes` es el catálogo global
        que valida `recetas.productos.deporte` vía `deporteEsValido()`.
      - **Dónde vive el deporte, decidido con el usuario**: en el PRODUCTO. Una camiseta de
        basketball lo es sin importar qué cliente la pida, así que una estadística por deporte sale
        de `linea_produccion → producto → deporte` **sin capturar nada nuevo en la OP**. Capturarlo
        también en la orden habría creado dos fuentes que se contradicen — y la de la OP es la peor
        de las dos: no tiene catálogo cerrado (acepta cualquier texto) y está partida por cliente,
        así que `Volleyball` y `Voleibol` serían deportes distintos para siempre.
      - ⚠️ **El corte por deporte NO se puede usar todavía**: el campo está en **4 de 1,287
        productos** (todos "Football") y en **0 de los 13** que usan las OP cargadas. El modelo está
        bien; lo que falta es llenarlo. Pendiente, con el usuario al tanto.
      - **El parser acepta los cuatro nombres** (`Línea de producto (nombre, opcional)`, el alias
        corto, y los dos con "Deporte" que existieron ese rato), así que cualquier archivo ya
        armado carga igual. Verificado con los tres encabezados sobre las mismas cantidades.
    - **Verificado con curl y en navegador**: plantilla de 34 columnas con 3 hojas, los tres
      encabezados viejos ausentes; preview y aplicar con la plantilla nueva (deporte válido pasa,
      uno inexistente queda pendiente con el mensaje que indica dónde darlo de alta) y lo escrito
      en la base con `enguiamiento_yd = 0`, `imagen = null` y las tallas correctas. En navegador el
      modal dice "Deportes"/"Deporte" y no queda ningún "Líneas de producto" en pantalla, consola
      limpia. Datos y usuarios de prueba borrados — la base volvió a 68 OP / 253 líneas / 7,969
      piezas.

  - **Cierre de sesión por inactividad, configurable por usuario y por rol (2026-10-07)**. El
    usuario preguntó en cuánto tiempo se cierra la sesión si deja la computadora, y la respuesta
    honesta era **que no se cierra nunca**. Lo construido es el cierre por inactividad; el **tope
    duro de 13 horas** quedó explícitamente **para después**, por decisión suya tras ver el costo de
    cada parte.
    - ⚠️ **Lo que había NO era un cierre de sesión, y confundirlos llevaba al arreglo equivocado.**
      El access token dura 15 minutos, pero `apiFetch` lo **renueva solo** con el refresh token de
      30 días en cuanto recibe un 401. O sea que una pantalla abierta se mantenía viva
      indefinidamente, y una abandonada con una pantalla que refresca sola (Impresión de OPs tiene
      `refetchInterval: 30_000`) **se renovaba para siempre sin que nadie la tocara**. Acortar el
      TTL del token no cerraba nada: solo renovaba más seguido.
    - **La actividad se mide por el teclado y el mouse, no por tráfico de red**
      (`mousedown · mousemove · keydown · touchstart · scroll · wheel`). Es la distinción que hace
      que esto funcione: contar las peticiones habría dejado vivas justamente las pantallas que se
      auto-refrescan, que es el caso que se quería cerrar.
    - **Cadena de resolución, de más específico a más general**: lo del **usuario** manda sobre lo
      del **rol**; con varios roles gana el **más corto**; si nadie opina, **15 minutos**. Se
      resuelve con `!= null` y no con `||`, porque **0 significa "nunca cerrar"** y un `||` lo
      habría tratado como "sin valor" — el bug clásico de este tipo de cadena.
    - Migración `20261007200000_inactividad_por_usuario_y_rol` (+ `rollback.sql`): columna
      `minutos_inactividad` **nullable** en `core.roles` y `core.usuarios`, con
      `CHECK (IS NULL OR BETWEEN 0 AND 1440)`. NULL y 0 dicen cosas distintas a propósito: NULL es
      "mirá el nivel siguiente", 0 es "nunca cerrar". El rango va en la base y no solo en el DTO,
      mismo criterio que el 2-10 del papel en blanco.
    - **El valor viaja en los claims del JWT**, así que el navegador no necesita pedirlo aparte y
      no hay una petición extra por sesión. La contracara: **cambiarlo le aplica al usuario en su
      próximo login**, no al instante.
      - ⚠️ `emitirSesion()` arma los claims a mano en **3 lugares** (login, selección de empresa,
        refresh). El campo nuevo se declaró **obligatorio y no opcional** justamente para que el
        compilador señalara los tres; con un `?` habría compilado perfecto dejando dos caminos
        emitiendo tokens sin el dato, y el síntoma sería "a veces no cierra".
    - **Aviso antes de cerrar, con un botón para seguir.** El aviso dura `min(60s, 20% del límite)`
      — **el primer intento usaba 60s fijos y con un límite de 1 minuto el banner quedaba visible
      todo el tiempo**, encontrado en la prueba de navegador, no por el typecheck. El reloj es un
      `setInterval` de 1 segundo y no un `setTimeout` largo: una laptop suspendida retrasa el
      timeout y despertaría con la sesión todavía abierta.
    - La última actividad se comparte entre pestañas por `localStorage`, con try/catch: tocar una
      pestaña mantiene vivas las demás, que es lo que espera cualquiera con el ERP abierto en dos
      lados.
    - **Dónde se edita**: en el usuario, dentro de su modal de `/usuarios`; en el rol, en `/roles`.
      - ⚠️ **El tiempo del rol NO marca el rol como `personalizado`**, a diferencia de sus permisos.
        Esa bandera existe para que el seed deje de reconciliar **permisos**, y encenderla por un
        cambio de tiempo de sesión le congelaría los permisos en el próximo despliegue sin que nadie
        lo haya pedido. Por lo mismo **ADMIN sí se edita acá** aunque no se editen sus permisos: el
        tiempo de inactividad no es algo que el seed garantice.
      - Los campos se manejan como **texto y no como número** en los dos formularios: vacío ("usar
        el del nivel siguiente") es distinto de 0 ("nunca cerrar"), y un `number` pierde esa
        diferencia.
    - ⚠️ **Bug propio, atrapado por el guard de arranque y no por mí**: al insertar el método nuevo
      en el controller quedó **entre** el `@RequirePermissions` existente y `@Patch('roles/:id/
      permisos')`, o sea le robó el decorador al método de abajo. `verificarRutasGateadas()` abortó
      el arranque nombrando exactamente `PATCH /roles/:id/permisos`. Es precisamente el modo de
      falla para el que se escribió ese guard: sin él, ese endpoint habría quedado abierto a
      cualquier autenticado sin ningún síntoma.
    - **Verificado**: el CHECK rechazando −5, 1500 y 4.5 por SQL directo; la cadena completa con 5
      logins reales (`15` por default · `60` solo del rol · `5` con dos roles · `3` del usuario
      sobre el rol · `0` que no cae al rol); el endpoint del rol en 9 casos (45/0/null OK, −5/1441/
      4.5 → 400, rol inexistente → 404, sin permiso → 403, ADMIN → 200) más que `personalizado`
      quedó en `false` y la auditoría registró el antes/después. En navegador: el aviso salió a los
      ~145s de un límite de 3 min con "33s" en el contador (exactamente `180 − min(60, 36)`),
      "Seguir conectado" lo escondió sin perder la sesión, y con un límite de 1 min la sesión sí
      llegó al login. La pantalla de Roles guarda, vacía y valida fuera de rango; el campo del
      modal de Usuarios persiste y vuelve a vacío. Cero desborde a 1440/820/390 px y consola
      limpia. Usuarios y roles de prueba borrados.
    - **Lo que falta, y por qué no está**: el **tope duro** necesita un instante de "cuándo empezó
      la sesión" que **no se renueve** en cada refresh — hoy no existe ningún campo así, y la
      rotación del refresh token borra cualquier rastro del original. Es trabajo aparte, no un
      ajuste del límite de arriba.

  - **Hoja "Consolidado" en el Excel del reporte (2026-10-06)**. Pedido del usuario: las dos hojas
    de detalle tienen columnas distintas (una habla de LINE/Producto/Talla y la otra de No.
    repo/Departamento/Defecto), así que juntarlas exigía copiar y pegar cada vez.
    - Cuarta hoja, **segunda en el orden** (después de Resumen), con **una fila por registro** y 18
      columnas: cada concepto en la suya y vacía donde no aplica, en vez de mezclar "LINE / No.
      repo" en una sola — una columna con dos significados no se puede agrupar ni filtrar.
    - La columna **Tipo** (`Impresión` / `En blanco` / `Reposición`) es lo que la vuelve útil: con
      ella sale cualquier corte en una tabla dinámica. El tipo de las filas de papel en blanco se
      deriva de `ETIQUETA_EN_BLANCO`, que ya viaja dentro del detalle de impresión desde F5-1B.
    - ⚠️ **Sin fila TOTAL a propósito.** Una fila de totales dentro del rango se cuela en cualquier
      tabla dinámica o filtro; el total ya vive en "Resumen", que es la hoja de lectura. Lleva en
      cambio **fila congelada y autofiltro** ya aplicados.
    - Las filas van ordenadas por fecha, mezclando tipos: leerla como línea de tiempo es lo que
      permite agrupar después. La tela va en su columna y **no suma al papel**, misma regla que el
      resto del reporte.
    - **Verificado generando el Excel real y leyéndolo de vuelta**: 23 filas = 17 de impresión + 6
      de reposiciones, repartidas en 16 Impresión / 1 En blanco / 6 Reposición, y la suma del
      consolidado da **87.7897 yd de papel y 7.4500 de tela**, exactamente los totales del reporte.
      Las otras tres hojas quedaron intactas.

  - **Reporte consolidado de consumo por OP, exportable a Excel y PDF (2026-09-30)**. Pedido junto
    con el descuento de los tres conceptos: *"Luego habrá que consolidar cuál fue el consumo de todo
    lo relacionado con una OP"*. Módulo nuevo `apps/api/src/modules/costeo-reportes/` +
    `apps/web/src/features/costeo-reportes/`, ruta `/costeo/reportes`, ítem de sidebar gateado con
    `costeo.dashboard.ver` (existía desde F1 sin gatear nada y su audiencia —Admin, Analista,
    Gerencia, Supervisor— es exactamente la del reporte; **no hizo falta permiso nuevo**).
    - **Alcance elegido por el usuario**, no inferido: varias OP con filtros (no una sola OP),
      resumen arriba y detalle abajo, y **yardas ahora, dinero cuando exista F5**.
    - Hasta ahora nadie sumaba por orden: Gestión de Rollos mira el rollo y Impresión de OPs mira la
      línea. Filtros de rango de fechas, cliente e impresora, aplicados **al presionar "Ver"** y no
      en cada tecla — con campos de fecha, recargar por tecla dispara consultas contra rangos a
      medio escribir.
    - **La tela va en columna propia y NO suma al total de papel**: es otro material y no sale del
      rollo. Sumarla daría un número sin significado físico.
    - **Las reposiciones se consultan aparte del consumo, no en la misma query**: una reposición de
      solo tela **no crea ninguna fila de `consumo_papel`**, así que leyendo solo esa tabla
      desaparecería del reporte.
    - **Las opciones de los selectores las devuelve el propio reporte**, no los catálogos de otros
      módulos. Verificado que hacía falta: de los 5 roles con `costeo.dashboard.ver`,
      ANALISTA_COSTOS no tiene `costeo.rollo.ver` y GERENCIA_COSTEO no tiene `costeo.orden.importar`,
      así que armar los selectores con `/costeo/rollos/impresoras` y `/costeo/ordenes/clientes` les
      habría dado **403 y un filtro vacío a dos de los cinco**. Salen del rango de fechas y **antes**
      de aplicar cliente/impresora, para que elegir uno no borre los demás de la lista (verificado en
      navegador: con UNDER ARMOUR puesto, el selector sigue ofreciendo BSN SPORTS).
    - Los filtros se interpretan en un helper del **controlador**, compartido por las dos rutas
      (datos y Excel): si una leyera las fechas distinto que la otra, el Excel no coincidiría con lo
      que se ve en pantalla. El PDF sale del diálogo del navegador vía **iframe oculto**
      (convención #9), sin librería de PDF en el servidor.
    - ⚠️ **Bug propio grave encontrado en la verificación en navegador, no con curl**: el estado
      vacío mostraba *"entre 31/12/2025 y 30/1/2026"* para un rango pedido del 1 al 31 de enero. El
      corrimiento de display delató un problema **de datos**: `new Date('2026-09-30')` es medianoche
      **UTC**, o sea las 18:00 del 29 en Guatemala, y el rango era `{gte: desde, lte: hasta}`. O sea
      que el rango arrancaba 6 horas antes de tiempo y —mucho peor— **se comía casi todo el último
      día**, así que un cierre de mes dejaba fuera lo impreso la tarde del último día sin ningún
      síntoma.
      - **Medido sobre las filas reales, no razonado**: pedir el día 29/09 solo devolvía **0 de 9**
        filas (las 9 están a las 23:58 UTC = 17:58 de Guatemala), y pedir del 01 al 29/09 devolvía
        **7 de 16**. Es el modo de falla peor posible para un reporte: número plausible, más chico
        de lo que corresponde, sin error.
      - Corregido anclando los días a **UTC-6** (Guatemala es fijo y **sin horario de verano**, así
        que el desfase es constante y un día calendario se puede anclar exacto) y haciendo el límite
        superior el inicio del día **siguiente**, con comparación **exclusiva** (`lt`, no `lte`) —
        así abarca el día pedido entero sin depender de la precisión del timestamp. Queda anotado en
        el código que si alguna vez volviera el DST hay que rehacerlo con una librería de zonas.
      - Los filtros se devuelven ahora como **texto `yyyy-mm-dd`** y no como `Date`. Un `Date`
        obliga al frontend a re-derivar el día calendario, que es justo de donde salía el
        corrimiento; el nombre del archivo Excel usa los mismos textos, porque `hastaExclusivo`
        pondría una fecha que el usuario nunca eligió. En pantalla y en el PDF conviven **dos
        formateadores a propósito**: `fecha()` para instantes reales (cuándo se imprimió, en hora de
        Guatemala) y `dia()` para los días calendario elegidos en los filtros, que se reordenan tal
        cual sin pasar por `Date`.
    - **El código del ítem de sidebar es `RS` y no el `RC` obvio**: con el panel colapsado esas dos
      letras son lo único que se ve, y `RC` ya es Recetas (`app/modulos.ts`) — dos ítems del mismo
      sidebar habrían quedado indistinguibles. `RP`, el otro candidato, es el tile "Reportes" del
      roadmap. Verificado con el panel colapsado: `IN RC CR OP RE IO CE RS`, sin duplicados.
    - **Verificado con curl y con clic real** (usuario desechable con ADMIN, borrado al terminar):
      el resumen de 3 OP cierra contra el total —67.3550 impresión + 5.4847 enguiamiento + 0 en
      blanco + 10.9500 reposiciones = **83.7897 yd**, más 7.4500 de tela aparte—, y ese total es
      **exactamente la suma de lo descontado de todos los rollos** (64.2096 + 9.0000 + 0.9108 +
      9.6693), que es el invariante que une este reporte con Gestión de Rollos. Filtro por cliente:
      BSN SPORTS da 73.2096 = 83.7897 − 10.5801 de UNDER ARMOUR. Excel con 3 hojas y fila TOTAL en
      negrita, cuyo contenido se leyó de vuelta y coincide celda por celda con la pantalla; PDF con
      sus 3 tablas y el subtítulo con los días correctos. Rango invertido y fechas mal formadas dan
      400 y la pantalla los muestra sin romperse; sin datos, los botones de exportar quedan
      deshabilitados. Cero desborde horizontal y consola limpia a 1600, 1280, 820 y 390 px.
    - **Los dos 401 que aparecen en consola al arrancar son `POST /auth/refresh` previos al login**
      —el refresh silencioso al montar la app, sin cookie todavía—, no de este módulo: después de
      entrar, el reporte no genera ninguno.

  - **Logo por empresa, y el espejo a Sheets cortado para Digitalpro (2026-09-30)**. Dos pedidos del
    usuario en el mismo mensaje, unidos por el mismo principio: con dos empresas conviviendo, lo de
    una no puede aparecer —ni escribirse— como si fuera de la otra. Migración
    `20260930120000_empresa_logo_y_espejo_sheets` (+ `rollback.sql`), dos columnas en
    `core.empresas`.
    - **`logo` se guarda como data URI, no como ruta.** No es capricho: los documentos se imprimen
      en un iframe oculto con su propio HTML, donde una ruta relativa depende del base de Vite y del
      prefijo de Nginx. Un data URI no depende de nada.
      - ⚠️ **Bug preexistente que esto destapó**: los tres documentos traían
        `<img src="/logo.png">`, que da **404** —el frontend se sirve bajo `/erp`—, y el
        `onerror="this.style.display='none'"` que lo acompañaba lo ocultaba en silencio. Medido:
        `/logo.png` → 404, `/erp/logo.png` → 200. O sea que **el logo no se vio nunca** en ninguna
        cotización, resumen ni requisición, aunque una nota anterior lo daba por corregido al copiar
        el archivo a `public/`. `apps/web/public/logo.png` quedó sin uso.
      - Viaja en la sesión (`EmpresaDisponible.logo`), ~19 KB por empresa. Se eligió eso sobre un
        endpoint aparte porque un `<img>` dentro del iframe de impresión no puede mandar el token.
      - `app/marca-empresa.ts` centraliza el hook y el bloque HTML del encabezado, así que los
        cuatro consumidores no repiten el `<img>`. La caja tiene tope de **alto y de ancho** con
        `object-fit: contain`: los dos logos tienen proporciones muy distintas (digiTEXSA ~5.8:1,
        digitalPRO ~2:1) y fijar solo una dimensión desborda uno o agranda el otro.
      - **Sin logo cargado cae al nombre en texto**, nunca al logo de la otra empresa — verificado
        en navegador con Digitalpro, que todavía no tiene archivo.
      - `apps/api/scripts/cargar-logo-empresa.mjs <CODIGO> <archivo>` carga uno nuevo. Cargar el de
        Digitalpro es `... CASTA logo.png`, **sin desplegar** — mismo criterio que `color_marca`.
        Tiene tope de 200 KB porque el archivo viaja en cada login y cada refresh.
      - **Los documentos impresos llevan la RAZÓN SOCIAL, no el nombre comercial.** La Requisición
        de Bodega decía `DIGITAL TEXTIL, S. A.` fijo en el código; hacerlo dinámico con
        `nombreComercial` lo habría degradado a `DIGITEXSA` mientras se lo arreglaba para
        Digitalpro. Por eso `EmpresaDisponible` ganó `razonSocial`.
    - **`espeja_sheets`, con DEFAULT `false`.** El usuario pidió que lo enviado desde Impresión de
      OPs en Digitalpro se guarde solo en PostgreSQL. Hasta ahora el espejo corría para cualquier
      empresa, así que el consumo de Digitalpro habría caído en los libros de Digitexsa y los
      Dashboards lo habrían contado como propio.
      - El default es `false` **a propósito**: el modo de falla de equivocarse acá no es perder una
        fila, es contaminar libros de producción con datos de otra empresa, y limpiarlos es a mano.
      - **Se aplicó también a Reposiciones**, que el usuario no nombró: escribe a los MISMOS libros,
        así que dejarlo abierto habría filtrado por la otra puerta lo que se cerraba por la primera.
    - ⚠️ **Cómo se verificó el corte sin tocar los libros reales**: el `.env` local apunta a los
      libros de producción, así que una captura de prueba con Digitexsa habría escrito ahí de
      verdad. Se levantó una **instancia aislada de la API en el puerto 4055** con
      `GOOGLE_SHEETS_ID_*` apuntando a un id inexistente, y se capturó en las dos empresas sobre
      datos desechables. Resultado medido en el log: **Digitalpro cero intentos de escritura**;
      **Digitexsa exactamente uno**, fallando contra el id falso
      (`Requested entity was not found`) — o sea que el espejo sigue vivo donde corresponde. Las dos
      capturas devolvieron `enviadas: 1`, confirmando de paso que el espejo nunca bloquea el
      guardado. Datos de prueba y usuarios desechables borrados; la base volvió a 68 OP / 253 líneas
      / 7,969 piezas.
    - **Verificado en navegador**: logo en el sidebar (150x26 px), en el PDF del reporte (190x33) y
      en la Requisición de Bodega (174x30), con `DIGITAL TEXTIL, S.A.` como encabezado; al cambiar a
      Digitalpro el sidebar cae al texto sin heredar el logo ajeno. Consola limpia.
      - *Nota de método*: `page.goto()` a una ruta interna **vuelve a pedir la selección de empresa**
        cuando el usuario tiene más de una — el access token vive solo en memoria y la recarga lo
        pierde. No es un bug: hay que navegar con clics. Y el iframe de impresión **se autodestruye
        al segundo**, así que hay que inspeccionarlo antes de ese plazo.
    - **Los dos logos ya están cargados** (`DIGITEXSA` 18 KB, `CASTA` 59 KB). El de digitalPRO lo
      cargó el usuario desde `C:\Users\PETER\Pictures\Logos\LOGO DIGITAL PRO.png`.
      - ⚠️ **Bug del script, encontrado por el usuario al correrlo**: fallaba con
        `SASL: client password must be a string`. La causa era que el script **no cargaba el
        `.env`** — yo lo había probado con `node --env-file=.env` desde `apps/api`, y él lo corrió
        desde la raíz, donde `DATABASE_URL` no está en el entorno; sin ella `PrismaPg` conecta sin
        contraseña y el error no menciona el `.env` por ningún lado. Corregido con
        `process.loadEnvFile()` resolviendo `apps/api/.env` **relativo al propio script**, así que
        ahora corre desde cualquier directorio.
    - **Tamaño de la caja del logo, medido con los dos reales** (digiTEXSA 983x169 ≈ 5.8:1;
      digitalPRO 1260x587 ≈ 2.15:1). La primera caja (38px de alto) dejaba a digitalPRO en
      **82x38 px con su bajada "your source for sublimation" ilegible**, al lado de un digiTEXSA de
      190x33. El tope de alto se subió para que el logo cuadrado alcance un tamaño comparable —
      para el apaisado sigue mandando el ancho, así que no cambia. Valores finales, verificados en
      navegador: sidebar `max-h 38 / max-w 150` (150x26 y 82x38), reporte `48 / 200` (200x34 y
      103x48), requisición `44 / 170` (170x29 y 94x44).
      - *Lección*: con logos de proporciones muy distintas, una caja que solo limita una dimensión
        hace que uno se vea bien y el otro diminuto. Hay que mirarlos juntos antes de fijar valores.
    - **El 404 de `GET /costeo/reposiciones/siguiente-numero` que aparece en consola al cambiar de
      empresa no es un bug**: es la respuesta correcta de "esa OP no es de esta empresa" (con el
      mensaje que nombra la otra). Verificado con curl: 200 en Digitexsa, 404 en Digitalpro.

  - **F4 — Fase D (espejo a Google Sheets) completada, 2026-09-21.** Cierra F4. Cada envío de
    consumo escribe además en la hoja **"Datos"** del libro `ConsumosFinal DIGITEXSAMig`, que es lo
    que alimenta los Dashboards de Data Studio. *Aclaración que hizo falta*: el espejo no tiene nada
    que ver con `01_erp` — los Sheets alimentan Data Studio, no la app legacy, así que apagar
    `01_erp` no lo vuelve innecesario.
    - **El mapeo se verificó contra la hoja real, no solo contra el `Código.gs`.** Las 15 columnas
      coinciden exactamente con `copiarDatos()`: `FECHA · LINE · OP · REPO · CLIENTE · IMPRESORA ·
      ITEM · TIPO DE PAPEL · TALLA · CANT · ENGUIAMIENTO · EN BLANCO · CONSUMO YDS · OBSERVACION ·
      NRollo`. **Una fila por TALLA**, no por línea.
    - **Una diferencia encontrada al leer la hoja real**: la columna N se llama `OBSERVACION`, pero
      el legacy siempre mandaba `""` ahí. El ERP sí tiene ese dato (la observación de la captura),
      así que ahora se manda. La columna L sigue yendo **vacía** —no `0`— cuando la línea no lleva
      papel en blanco, igual que el legacy, para no cambiarle el tipo de dato a una columna que los
      Dashboards ya leen.
    - **`agregarFilas()` nuevo en `GoogleSheetsService`**, una sola llamada para todo el lote.
      Importa de verdad: un envío de 50 líneas de 6 tallas son 300 filas, y de a una serían 300
      llamadas contra la cuota de Google. `agregarFila()` quedó como atajo, así que Reposiciones no
      cambió. Verificado en el log: un envío de 4 líneas produjo **una** llamada de 13 filas.
    - **Solo se espejan las tallas que de verdad se crearon.** Las ya enviadas se saltean antes de
      insertar, y mandarlas igual duplicaría filas en la hoja (el legacy también descarta duplicados).
      Verificado: reenviar una línea ya enviada devuelve `yaEstaban` y **no agrega ninguna fila**.
    - **Nunca bloquea el guardado**, misma regla que Reposiciones: se dispara con `void`, después de
      que la transacción de Postgres cerró, y `GoogleSheetsService` no lanza. **Probado de verdad**,
      no solo por diseño: apuntando a una pestaña inexistente, el envío devolvió 201 con sus 5
      tallas guardadas en Postgres y el error quedó solo en el log
      (`Unable to parse range: ...`).
    - **Las anulaciones no se reflejan**, igual que en Reposiciones: el legacy solo hace `append` y
      nunca borra ni marca filas.
    - **Diferencias deliberadas contra el legacy**: el NRollo va resuelto de verdad
      (`fn_rollo_en` → formato de `v_rollo_codigo`, ej. `0777-10-8`) en vez de la heurística que se
      queda en `"Buscando..."`; y **no se borra nada del origen** — el legacy borraba las filas ya
      procesadas de `DatosOrigen`, acá el origen es la base y la línea solo se marca con
      `procesada_en` (corrección #3 de §6.2).
    - **Cómo se verificó sin ensuciar el libro real**: el service account **no puede crear libros
      nuevos** (403), así que se creó una **pestaña temporal** `QA_FaseD_borrar` en el mismo libro,
      se apuntó el espejo ahí, se corrieron los envíos reales por la API, se leyeron las filas de
      vuelta columna por columna y se borró la pestaña al terminar. La hoja `Datos` nunca se tocó.
      Los consumos de prueba se borraron de Postgres y la base volvió a 252 líneas sin enviar.
    - ⚠️ **La Forma 2 legacy SIGUE EN USO.** Al leer la hoja real aparecieron filas escritas el
      **19/09/2026** (dos días antes de construir esto), con OP `26OP027980` y superiores — o sea
      producción corriente, mientras el ERP tiene cargadas las 68 OP de demo (`26OP0103xx`). Eso
      significa que **a partir de ahora hay dos escritores sobre la misma hoja**: si una OP se
      procesa en los dos lados, los Dashboards la cuentan dos veces. No es un problema del código —
      es una decisión operativa que hay que tomar antes de usar esto en producción: Diseño tiene que
      dejar de usar la Forma 2 para las OP que se manejen en el ERP. Pendiente de confirmar con el
      usuario.

### Despliegue del 2026-09-30 (`920cf14`) — ejecutado por SSH

`920cf14` (reporte de consumo por OP, listado de órdenes, marca por empresa y corte del espejo a
Sheets) desplegado en `192.168.2.13`, junto con `39b32b1` que venía sin pushear.

- **Claude tiene SSH sin contraseña como `erpadmin`**, así que el despliegue se hizo solo. `sudo`
  sigue pidiendo contraseña — irrelevante acá porque esta release no toca Nginx.
- Respaldo previo de `core` (`~/backups/core-antes-logo-20260930-151534.sql`, 48K) porque la
  migración altera `core.empresas`. La migración toca **solo `core`**, que es de `digitexsa_erp`,
  así que `migrate deploy` con la `DATABASE_URL` de la app alcanzó — no hizo falta partirla por
  dueños como en agosto.
- `bash scripts/deploy.sh` corrió los 6 pasos hasta "Listo". La API reinició con **116 rutas**
  (antes 113: las 2 del reporte más el listado de órdenes), todas declarando su acceso.
- **El logo de Digitalpro NO viaja en el código** (el de Digitexsa sí, embebido en la migración):
  se subió el archivo por `scp` a `/tmp` y se cargó con `cargar-logo-empresa.mjs CASTA`, borrando
  el temporal después.
- **Los arm sleeves se replicaron por SQL, resolviendo todo por nombre y código, nunca por id.**
  Eso no es prolijidad: las tallas tienen **ids distintos en cada ambiente** (`2XS-XS` es 440 en
  local y **298** en producción), así que copiar los ids habría cargado los consumos contra la
  talla equivocada, en silencio. Se hizo en una transacción con `ON_ERROR_STOP=1`.
- **Paridad verificada lado a lado**: `productos=1287 | vista=1287 | estandar=2990 | tallas=158 |
  logos=2` en los dos ambientes. Desde afuera: `/` redirige 302 a `/erp/`, el frontend da 200 y la
  API 401 sin token.
- **No hizo falta correr el seed**: esta release no agregó permisos (el reporte usa
  `costeo.dashboard.ver`, que existía desde F1). Sí hay que **cerrar sesión y volver a entrar**
  para ver los logos, porque viajan en los datos de la sesión.

## Desarrollo, dueño de la receta (refactor mayor del 2026-08-26/27)
Hasta ahora la receta (BOM) colgaba del **Producto** (`recetas.producto_insumos`) y `desarrollo` era
apenas una columna de texto libre en `recetas.productos`. Eso invertía el proceso real de la
fábrica: primero se crea un **Desarrollo** (el prototipo, con todos sus insumos), se costea, se
aprueba, y recién entonces se convierte en un Producto vendible. El usuario lo planteó así: *"una vez
creado un desarrollo y autorizado podemos asignarlo a un producto… el desarrollo será el prototipo
para una producción en masa"*. Plan completo en `C:\Users\PETER\.claude\plans\serene-popping-lemur.md`.

- **Decisiones tomadas con el usuario**: el desarrollo es dueño **permanente** de la receta (antes y
  después de aprobar); estados `BORRADOR` → `APROBADO` (dos, sin revisión intermedia); la **mano de
  obra se muda al desarrollo** (`minutosMo`/`costoMoMinuto`); Desarrollo ↔ Producto es **1:1**;
  la pantalla es una **pestaña nueva en Gestión de datos**; asignar desarrollo a un producto es
  **obligatorio y solo si está aprobado**; el desarrollo registra su **talla base**; `EDITOR` y
  `ADMIN` pueden aprobar.
- **⚠️ Sin llave foránea `productos.desarrollo → desarrollos.codigo`, a propósito.** Un agente de
  planificación afirmó que `01_erp` solo *leía* esa columna; verificándolo a mano contra
  `01_erp/app.js` resultó que también la **escribe** como texto libre en 4 lugares (alta de producto
  1195, edición 1232, y sus dos imports masivos 1380 y 1900). La confirmación del usuario ("ya no
  usamos `01_erp` para recetas") cubría la *edición de recetas*, que es otra pantalla. Poner la FK
  habría roto esos 4 endpoints con `23503`. La integridad la impone el backend nuevo
  (`exigirDesarrolloAsignable()`). **La FK se agregó el 2026-08-31** al apagar `01_erp` — ver
  "Baja de `01_erp`" más abajo. Documentado con comentario en el schema para que nadie lo "arregle" sin
  conocer el motivo.
- **Migración** `20260826120000_desarrollos_duenos_de_receta` (+ su `rollback.sql`), escrita a mano
  como siempre y aplicada con `migrate deploy`: crea `recetas.desarrollos` y
  `recetas.desarrollo_insumos`, backfillea **1,285 desarrollos** (uno por cada `productos.desarrollo`
  distinto, todos `APROBADO`, con `id_talla_base` resuelto por `LEFT JOIN` contra `recetas.tallas` —
  los 1,285 resuelven) y copia **47 de las 49** líneas de `producto_insumos` (las otras 2 son de
  `TEST-BULK-01`, que tiene receta pero no desarrollo), con un bloque `DO $$` que aborta si
  `copiadas + huérfanas ≠ origen`.
  - `desarrollo_insumos` usa `UNIQUE ... NULLS NOT DISTINCT (id_desarrollo, id_insumo, id_area)`,
    que **corrige de origen** un bug latente heredado de `producto_insumos`: ahí, con `NULLS
    DISTINCT`, se puede insertar dos veces el mismo insumo sin área y el `ON CONFLICT` nunca dispara.
  - **Dos vistas en vez de una**: `v_desarrollo_costo` (fuente única del costo de un prototipo) y
    `v_producto_costo` redefinida encima con `CREATE OR REPLACE` — mismas 6 columnas, mismo orden y
    mismos tipos, que es lo que mantiene a `01_erp` leyendo sin romperse. **Invariante que no se
    puede romper**: `v_producto_costo` debe devolver exactamente una fila por producto, incluidos
    los que no tienen desarrollo, porque `productos.service.ts` hace `JOIN` (no `LEFT JOIN`) contra
    ella — un producto que perdiera su fila desaparecería del catálogo sin ningún error visible. Por
    eso el `FROM` sigue siendo `recetas.productos` con `LEFT JOIN`s.
  - `recetas.producto_insumos` **no se toca**: queda congelada como respaldo, como red de seguridad
    para `01_erp` y como lo que hace posible el rollback.
- **Backend**: módulo nuevo `apps/api/src/modules/recetas-desarrollos/` (`desarrollos.service.ts` —
  listar/obtener/crear/editar/aprobar/reabrir + los 4 métodos de BOM re-parentados desde
  `productos.service.ts`; `desarrollos-import.service.ts` — plantilla/preview/aplicar). Reglas de
  negocio server-side: aprobar exige al menos una línea de insumo; **reabrir** se rechaza (409) si su
  producto está activo; el costo se lee siempre de `v_desarrollo_costo`, nunca se suma en el cliente.
  En `recetas-productos`, `crear()` y `editar()` exigen un desarrollo que exista, esté `APROBADO`,
  activo y libre; los 4 métodos de BOM y sus rutas se eliminaron.
- **Bug latente corregido de paso**: `editar()` usaba `EditarProductoDto = PartialType(...)` con
  `desarrollo: dto.desarrollo?.trim() || null`, así que un `PATCH` parcial que **omitiera** el campo
  lo ponía en `NULL` — ya venía desasignando el desarrollo (y el cliente, el patrón, la talla y el
  deporte) en silencio. Ahora solo se escribe lo que de verdad vino.
- **Import masivo**: el flujo combinado "Productos + Receta" quedó fuera de servicio (escribía el BOM
  en la tabla congelada) y se reemplazó por **"Importar desarrollos"** — hoja "Desarrollos"
  (código·descripción·cliente·talla base·minutos MO·costo MO/min·notas) + hoja "Insumos"
  (desarrollo·insumo·consumo·área) + hoja "Referencias". Mismo preámbulo de 4 filas que el resto
  (`FILA_INICIO_DATOS = 5`). El import de **altas de productos** sigue existiendo: su columna
  Desarrollo se resuelve contra `recetas.desarrollos` y una fila con desarrollo inexistente, inactivo
  o sin aprobar queda pendiente con error explícito. Las columnas "Minutos MO"/"Costo MO/min" de esa
  plantilla se conservaron (para que los archivos ya armados sigan cargando) pero se rotularon
  **(ignorado)** y ya no se escriben.
- **Hueco real cerrado**: `altas()` (el "aplicar" del import de productos) confiaba en las filas que
  mandaba el cliente — el preview corre en el frontend y no obliga a nada, así que un POST directo
  podía crear productos apuntando a desarrollos inexistentes o sin aprobar. Ahora revalida
  server-side contra el catálogo y usa el código canónico del catálogo al insertar, no el del Excel
  (una diferencia de mayúsculas ya no crea un desarrollo "distinto").
- **Permisos**: `recetas.desarrollos.crear` / `.editar` / `.aprobar`, nuevos, a `EDITOR` y `ADMIN`.
  `recetas.recetas.editar` **se conserva** (no se retiró como decía el plan original): sigue gateando
  las líneas de receta, que ahora viven en el desarrollo — el nombre por fin es literal. Lectura vía
  `recetas.catalogo.ver`, sin permiso nuevo. Los guards de `/catalogo` (`App.tsx`) y del botón
  "Gestión de datos" (`cotizacion-page.tsx`) se ampliaron para incluir los permisos de desarrollo.
- **Frontend**: `catalogo-page.tsx` pasa a 4 pestañas en el orden real del proceso — Precios de
  insumos · Insumos · **Desarrollos** · Productos. Nuevos `components/tab-desarrollos.tsx`,
  `modal-desarrollo.tsx`, `modal-receta-desarrollo.tsx` (el editor de BOM, con columnas C.Prom /
  C.Total, subtotal por categoría y costo unitario al pie — lo que el usuario pidió: "insumos por
  categoría para determinar el costo") y `modal-import-desarrollos.tsx`. Eliminados `modal-receta.tsx`
  y `modal-import-recetas.tsx`. En Productos: se fue el botón "Receta", entró una columna Desarrollo
  clickeable que abre la receta **en solo lectura**, y el campo Desarrollo de `modal-producto.tsx`
  dejó de ser texto libre — ahora es un `AutocompleteBuscador` limitado a aprobados y libres, y es
  obligatorio; los inputs de mano de obra se fueron (viven en el desarrollo).
- **Bug de invalidación corregido**: el editor de receta viejo invalidaba solo `['catalogo','receta',
  id]`, nunca `['catalogo','productos']`, así que la columna Costo quedaba con el valor viejo. El
  editor nuevo invalida receta + desarrollos + productos.
- **Verificación**: typecheck y lint limpios en ambos paquetes. **Paridad exacta de costos confirmada
  post-migración** contra la línea base de los 4 productos reales (BSN-FB01N 128.9588, BSN-FB02NB
  47.0583, BSN-YFB02NB 44.7118, BSN-FB01ESPN 98.8343 — idénticos), más el invariante
  `count(productos) = count(v_producto_costo)` = 1,287. Probado end-to-end con curl usando dos
  usuarios de prueba desechables (ADMIN y BODEGUERO, creados y borrados en la misma sesión):
  plantilla (200), preview que arranca en la fila 5 y marca los 6 casos de error (código duplicado,
  cliente inexistente, insumo repetido para el mismo desarrollo+área, consumo negativo, desarrollo
  inexistente, insumo inexistente), aplicar solo las válidas, re-import detectando los ya existentes,
  costo del desarrollo verificado a mano contra SQL, aprobar sin insumos (400) → aprobar (201),
  crear producto sin desarrollo / con BORRADOR / con inexistente / con uno ya tomado (los 4
  rechazados) → con el aprobado (OK), receta y mano de obra del producto heredadas del desarrollo,
  reabrir con producto activo (rechazo) → desactivar → reabrir (OK), altas masivas con desarrollo sin
  aprobar y sin desarrollo (ambas rechazadas), import de líneas hacia un desarrollo ya existente,
  403 en las 4 rutas con un rol sin permiso, 401 sin token, y una cotización completa de punta a
  punta (total 1,289.588 = 128.9588 × 10, snapshot de 11 líneas armado desde el desarrollo; las
  cotizaciones viejas siguen devolviendo `fuente: 'snapshot'` y la más antigua sigue resolviendo por
  el fallback `receta_actual`). Toda la data de prueba borrada al terminar — la base volvió a
  1,287 productos / 1,287 filas de vista / 1,285 desarrollos / 47 líneas de BOM.
  **Verificado en navegador** en la sesión del 2026-08-31, cuando Playwright pasó a estar disponible (ver más abajo). Queda una
  pasada manual del usuario por las 4 pestañas antes de darlo por cerrado.
- **Playwright ya está disponible (2026-08-31)** — `playwright` es devDependency de la raíz y los
  navegadores ya estaban en cache (`~/AppData/Local/ms-playwright`). Las notas de fases anteriores
  que dicen "no verificado en navegador, Playwright no disponible" son de sesiones previas: hoy sí
  se puede verificar visualmente, y conviene hacerlo antes de dar por cerrada cualquier pantalla.
- **Cuatro hallazgos de UI del usuario sobre la pestaña Desarrollos/Productos, corregidos y
  verificados en navegador**:
  1. **Tablas más anchas que la ventana**: `table-fixed` con anchos en rem sumaba ~1,424px, más que
     una ventana normal con el sidebar abierto, y las columnas de la derecha quedaban fuera de vista
     sin que el scroll horizontal fuera evidente. Pasadas a **porcentajes** (`w-[8%]`…) con
     `min-w-[860px]`: la tabla siempre entra y el texto crece hacia abajo. De paso se encontraron dos
     defectos no reportados: el badge de Estado se solapaba con el botón Editar, y los nombres de
     cliente de una sola palabra (`DALLASWEAR/WAITRESSVILLE`) se desbordaban pisando columnas
     vecinas — `whitespace-normal` no parte palabras, hacía falta `break-words`.
  2. **Filtros**: Productos ganó Cliente/Deporte/Talla (+ "Limpiar filtros") y Desarrollos ganó
     Cliente. Las opciones se derivan de las filas ya cargadas, no de endpoints nuevos.
  3. **Buscador de insumos de la receta**: devolvía `[]` con el texto vacío, así que al enfocarlo no
     se veía más que el placeholder y había que adivinar un código. Ahora lista el catálogo desde el
     foco, con filtro por Categoría y mostrando costo/unidad por opción.
  4. **Botón "Colapsar panel" invisible en páginas largas**: el `<nav>` crecía con el alto del
     contenido, así que `mt-auto` lo empujaba al final. El sidebar pasó a `sticky top-0 h-svh
     overflow-y-auto`.
- **`AutocompleteBuscador` ahora se renderiza en un portal — y el primer intento fue un bug propio.**
  La lista era hija `absolute` del input, así que la recortaba cualquier ancestro con overflow (el
  `DialogContent` tiene `overflow-y-auto`; un `Card` de shadcn trae `overflow-hidden`). Un primer
  arreglo agregó un prop `haciaArriba`, que solo movía el recorte de abajo hacia arriba. La solución
  real fue `createPortal` al `body` con `position: fixed`, midiendo el espacio disponible para elegir
  lado y alto. **Pero eso introdujo un bug peor, encontrado por code review y confirmado con
  Playwright**: un Dialog modal de Radix pone `pointer-events: none` en el `body` y solo lo reactiva
  dentro del `DialogContent`, así que la lista se veía pero **no se podía clickear**, y el clic
  contaba como interacción externa y **cerraba el modal**. Corregido con `pointerEvents: 'auto'` en
  la lista y `stopPropagation` del `pointerdown`. Verificado con clic real en los 4 consumidores
  (receta del desarrollo, alta de producto, consumo estándar, cotización).
- **Tres bugs más encontrados por code review y corregidos**:
  1. `tab-productos.tsx:invalidar()` no invalidaba `['catalogo','desarrollos']`, así que tras asignar
     un desarrollo el selector de "aprobados y libres" seguía ofreciéndolo y el alta siguiente era
     rechazada por el servidor.
  2. `modal-import-desarrollos.tsx`: `reiniciar()` hacía `setMensaje(null)` en el mismo lote que el
     mensaje de éxito; React los agrupa y ganaba el `null`, así que la confirmación del import nunca
     se veía. `reiniciar(limpiarMensaje = true)` ahora lo conserva tras aplicar.
  3. `desarrollos.service.ts:editar()` permitía desactivar un desarrollo cuyo producto seguía activo,
     mientras que `reabrir()` sí lo impedía — dejaba un producto vendible costeado desde un prototipo
     retirado y no reasignable. Ahora aplica la misma regla (409).
- **Import de desarrollos: línea repetida ya no tira 500.** `aplicar()` insertaba con un `create()`
  pelado y el preview solo detectaba insumos repetidos *dentro del archivo*, nunca contra los que el
  desarrollo ya tenía: el `UNIQUE ... NULLS NOT DISTINCT` lo rechazaba y abortaba la transacción
  entera. Ahora el preview marca `yaCargada` (visible en la tabla como "Actualiza el consumo
  existente") y `aplicar()` actualiza el consumo en vez de insertar, devolviendo
  `{creados, lineasCreadas, lineasActualizadas}`. No se usa `upsert()` de Prisma porque su clave
  compuesta no matchea filas con `id_area` NULL, que es el caso más común.
- **Editar la receta de un desarrollo aprobado con producto activo SÍ está permitido** (pregunta del
  usuario tras probarlo). Es la decisión 1 del plan: el desarrollo es dueño permanente de la receta.
  La restricción de "desactivá el producto primero" aplica solo a **Reabrir**, que cambia el estado a
  BORRADOR. Editar la receta es una operación normal de negocio; bloquearla obligaría a sacar el
  producto del catálogo para corregir un consumo. Las salvaguardas son el banner del modal (nombra el
  producto afectado), la inmutabilidad de las cotizaciones ya guardadas y la auditoría por línea.
- **Estado real de los datos**: hay **0 desarrollos aprobados y libres** — los 1,285 ya están tomados
  por un producto, así que "Nuevo producto" no tiene nada que ofrecer hasta crear un desarrollo
  nuevo. Solo **4 de los 1,285** tienen receta; el resto quedó en Q0.00 porque el backfill salió de
  `productos.desarrollo` y esos nunca tuvieron receta en el sistema viejo.
- **Los 2 hallazgos de code review que habían quedado pendientes, ya cerrados**:
  1. `costeo-estandar.service.ts:aplicarImportar()` confiaba en los ids del cliente. El controlador
     tipaba el cuerpo con `FilaPreviewConsumoEstandar`, una **interfaz** — TypeScript la borra al
     compilar, así que el `ValidationPipe` global no validaba nada. Y el servicio usaba
     `corrigeId`/`reemplazaId`/`idProducto`/`idTalla`/`error` tal como venían, aunque el preview
     corre en el servidor pero su resultado viaja al navegador y vuelve. Eso permitía dos cosas: con
     un preview viejo se editaba en silencio una versión que ya no era la vigente (o reventaba con un
     500 del EXCLUDE), y con un POST armado a mano se podían pisar las pulgadas de cualquier consumo,
     incluso de otro producto. Corregido con un DTO de verdad
     (`dto/aplicar-importar.dto.ts`, clase con decoradores, y solo los campos que el servidor usa) +
     re-resolución completa server-side: producto y talla por código contra catálogos frescos, fechas
     revalidadas, detección de producto+talla repetidos dentro del archivo, y `resolverReemplazo()`
     corriendo **dentro** de la transacción (ganó un parámetro `tx` opcional; antes leía por fuera y
     podía ver un estado distinto del que iba a escribir). Verificado con curl: alta normal, el
     ataque con `corrigeId` + producto falso rechazado, pulgadas negativas frenadas por el
     `ValidationPipe`, repetidos en el mismo archivo rechazados, y la corrección del mismo día
     dejando una sola fila. El frontend no cambió: manda los campos extra del preview y el
     `whitelist: true` los descarta.
  2. El `COALESCE(..., 0)` de `v_producto_costo` **se eliminó** al apagar `01_erp` — ver "Baja de
     `01_erp`" más abajo. Con la FK, un desarrollo inexistente ya no es representable.
- **Pendiente de decisión del usuario**: `TEST-PROD-01` y `TEST-BULK-01` son los únicos 2 productos
  sin desarrollo, así que su costo quedó en 0 (`TEST-BULK-01` tenía Q4.85). `CLAUDE.md` los marca
  como "no tocar sin confirmar" — habría que borrarlos o darles un desarrollo. Ningún producto real
  quedó huérfano.

## Baja de `01_erp` (el ERP legacy) — 2026-08-31

`01_erp` quedó **fuera de servicio**, adelantando el corte que el roadmap ponía en Fase 5. El
usuario lo confirmó tras verificar tres cosas:

- **Es estrictamente un subconjunto**: sus ~40 endpoints son todos de Recetas (insumos, productos,
  recetas, cotizaciones, tipo de cambio y catálogos de referencia). Cada uno tiene equivalente en el
  ERP nuevo desde que se completó la Fase 2.
- **No tiene autenticación.** Cero: sus dependencias son `express` y `pg`, sin JWT, sesiones ni
  login. Era una app sin ninguna autenticación, en la red interna, escribiendo sobre las mismas
  tablas que el ERP nuevo protege con RBAC — un camino de escritura que no se podía cerrar desde el
  ERP nuevo mientras siguiera encendida. Este resultó ser el argumento más fuerte para no esperar.
- **Nunca tuvo usuarios reales** (confirmado por el usuario: "eran pruebas y nadie lo usa"). El
  roadmap ataba el corte a "todos los módulos completos", premisa que solo tenía sentido si el
  legacy cubría algo que el ERP nuevo todavía no.

**Lo que NO se toca**: el schema `recetas` y sus datos siguen intactos, y
`recetas.fn_siguiente_folio()` se queda — el ERP nuevo la usa para el folio de las cotizaciones.
"Eliminar `01_erp`" es apagar la app y borrar su repositorio, no la base.

### Migración `20260831120000_fk_desarrollo_y_baja_de_legacy` (+ su `rollback.sql`)

Cierra las tres cosas que habían quedado a medias solo por el acoplamiento con el legacy:

1. **FK real `productos.desarrollo -> desarrollos.codigo`**, con `NOT NULL`, `ON UPDATE CASCADE` y
   `ON DELETE RESTRICT`. Antes era imposible porque `01_erp` escribía esa columna como texto libre en
   4 endpoints y la FK los habría roto con `23503`. Precondición verificada antes de aplicar: 1,285
   productos, 0 con desarrollo NULL, 0 apuntando a un código inexistente.
2. **`v_producto_costo` sin `COALESCE`**, con `JOIN` en vez de `LEFT JOIN`. Con la FK todo producto
   resuelve a exactamente un desarrollo, así que el invariante de una fila por producto (el que
   `productos.service.ts` necesita para su `JOIN`) se conserva sin inventar un 0. **Esto cierra de
   raíz el hallazgo de code review del Q0 silencioso**: un desarrollo inexistente hacía que el
   producto apareciera en el catálogo con Costo Q0.00 sin ninguna señal, y ese costo se propagaba a
   las cotizaciones nuevas como margen del 100%. Ahora la base lo rechaza.
3. **`DROP TABLE recetas.producto_insumos`** — congelada desde el refactor de desarrollos, existía
   solo como red de seguridad para el legacy. El `rollback.sql` la recrea vacía y deja comentada la
   consulta para repoblarla desde `desarrollo_insumos` si hiciera falta.

Verificado tras aplicar: 1,285 productos = 1,285 filas de vista, los 4 costos reales idénticos
(128.9588 / 47.0583 / 44.7118 / 98.8343), y la FK rechazando tanto un desarrollo inexistente como el
borrado de un desarrollo que tiene producto. Respaldo `pg_dump --schema=recetas` tomado antes.

### Cambios de código que habilitó

- **Prisma**: se eliminó el modelo `ProductoInsumo` y sus relaciones inversas;
  `Producto.desarrollo` pasó a `String` (no `String?`) con una `@relation` real hacia
  `Desarrollo.codigo`, más la inversa `Desarrollo.productos`. Prisma la modela como lista porque la
  FK apunta a un campo `@unique` que no es la PK; la unicidad (el 1:1) la garantiza la base.
- `productos.editar()` ahora escribe el desarrollo con `desarrolloRef: { connect: { codigo } }` —
  con la relación, Prisma ya no acepta el escalar en un `update`.
- `Producto.minutosMo` / `costoMoMinuto` quedan como columnas **muertas**: nada las lee ni las
  escribe desde el apagado del legacy. Se pueden borrar en una migración aparte cuando convenga.

### Pendiente en el servidor (NO ejecutado por Claude)

El trabajo de código está hecho y commiteado, pero **el corte en producción sigue pendiente** y debe
hacerse en este orden:

1. `git push` y desplegar el ERP nuevo con este refactor — producción todavía corre la versión
   anterior. **Antes: `pg_dump --schema=recetas` en el servidor** (la migración cambia una vista que
   el legacy lee en vivo).
2. Validar Recetas completo desde el ERP nuevo en producción.
3. Recién entonces: `pm2 delete erpapp`, repuntar Nginx (hoy `/` es un catch-all hacia `:3000`;
   puede pasar a servir el ERP nuevo directamente) y borrar el repositorio de `01_erp`.

Mientras el paso 3 no ocurra, `01_erp` sigue encendido y la FK **lo va a romper** en sus 4 endpoints
de alta/edición de productos. Eso es aceptable y esperado — nadie lo usa — pero conviene saberlo
para no diagnosticarlo como un bug nuevo.

### Despliegue a producción y apagado del legacy — 2026-08-31 (ejecutado)

Los tres commits (`98a62cd`, `f5e8bf7`, `9d74088`) se desplegaron en `192.168.2.13` y **`01_erp`
quedó apagado**. Estado final verificado: PM2 corre solo `digitexsa-api` y `biosac-rrhh`, el puerto
3000 no responde, la raíz `/` redirige 302 a `/erp/`, y la API contesta 401 (viva y gateada).

**Producción estaba mucho más atrás de lo que suponíamos**: 4 productos contra los 1,285 de local
(todos los imports del usuario vivían solo en su máquina), sin la tabla `desarrollos`, y con el
checkout 6 commits atrás. Antes de mover nada se comprobó que **local era un superconjunto limpio**:
los 4 productos idénticos (mismos ids, códigos y desarrollos) y las 6 cotizaciones de producción
exactamente iguales a las 6 primeras de local (mismos folios, fechas y totales).

**Se descartó el volcado completo del schema.** Hay **13 FKs desde `costeo` hacia `recetas`**
(`consumo_estandar`, `linea_produccion`, `consumo_papel`, `reposicion`, `orden_produccion`…);
reemplazar `recetas` de un saque las habría arrastrado. Se copiaron **solo los datos faltantes**, con
`pg_dump --data-only --inserts --on-conflict-do-nothing`, en el orden que exige la FK nueva:
clientes → insumos → **desarrollos** → productos → líneas de receta, más `setval` de cada secuencia
al final. Resultado: 1 → 99 clientes, 24 → 25 insumos, 4 → 1,285 desarrollos y productos, con
`count(productos) = count(v_producto_costo) = 1,285` y los costos de los 4 reales idénticos antes y
después de migrar.

#### ⚠️ Los dos schemas tienen dueños distintos y ninguno es superusuario

`recetas` es de `erpadmin`; `core` y `costeo` son de `digitexsa_erp`. **Ninguno de los dos roles es
miembro del otro ni superusuario**, así que `prisma migrate deploy` no puede aplicar nada que cruce
schemas, y ni siquiera puede aplicar lo suyo con un solo rol. De las 5 migraciones pendientes:

- `20260812210311` y `20260818180000` (solo `costeo`) → `psql` con la `DATABASE_URL` de la app.
- `20260826120000` y `20260831120000` (solo `recetas`) → `psql -U erpadmin`.
- **`20260820120000` toca AMBOS** → hubo que **partirla en dos** y correr cada mitad con su dueño
  (`ALTER TABLE costeo.linea_produccion DROP COLUMN desarrollo` por un lado, el `CREATE UNIQUE INDEX`
  sobre `recetas.productos` por el otro).

Después, `prisma migrate resolve --applied` de las 5, y `migrate status` confirmó
*"Database schema is up to date"*. `20260812210311` ya estaba aplicada a medias de antes (las columnas
existían pero Prisma no lo sabía) — se verificó columna por columna antes de marcarla, no se asumió.

#### ⚠️ Dos tropiezos que dejaron la app rota "en silencio"

Ambos son cosas que en local ya estaban hechas de sesiones anteriores y que no se anticipó replicar.
Los dos se manifestaron igual: la pantalla cargaba pero **sin datos y sin ningún mensaje de error**.

1. **Grants de Postgres sobre los objetos nuevos.** La migración se aplicó como `erpadmin`, así que
   `recetas.desarrollos`, `recetas.desarrollo_insumos` y la vista `v_desarrollo_costo` nacieron
   siendo suyos. La app corre como `digitexsa_erp`, y los grants de este servidor cubrían solo las
   tablas que existían al momento del primer despliegue. La API tiraba `42501 permission denied for
   table desarrollos` en cada consulta del catálogo. Corregido con los `GRANT` correspondientes **más
   `ALTER DEFAULT PRIVILEGES FOR ROLE erpadmin IN SCHEMA recetas`**, para que la próxima tabla que
   cree una migración ya nazca accesible y esto no se repita.
2. **El seed nunca se había corrido en producción.** Los permisos `recetas.desarrollos.crear/editar/
   aprobar` existían en el código pero no en esa base, así que en la pestaña Desarrollos solo se veía
   el botón "Receta" (el único sin gate) y faltaban "Editar" y "Aprobar/Reabrir". Antes de correr el
   seed se verificó que el upsert del admin usa `update: {}` — **no toca la contraseña** de un admin
   existente, solo lo crea si falta — y se respaldó `core`, porque `upsertRolConPermisos` también
   *quita* permisos fuera de su lista. Resultado: ningún rol perdió nada (ADMIN 39→42, EDITOR 11→14,
   ANALISTA_COSTOS 13→14, GERENCIA_COSTEO 16→17) y el seed completó de paso los catálogos de Costeo,
   que tampoco estaban. **Tras esto hay que cerrar sesión y volver a entrar**: el JWT lleva los
   permisos en sus claims y el token viejo sigue sin ellos.

**Lección para el próximo despliegue**: además de `migrate deploy`, verificar siempre (a) que los
objetos nuevos tengan grants para `digitexsa_erp`, y (b) correr el seed si la release agregó permisos.
Ninguna de las dos cosas falla ruidosamente.

#### Decisiones conservadoras tomadas en la copia de datos

- **No se pisaron los precios de insumos de producción**: el `ON CONFLICT DO NOTHING` dejó intactos
  los 24 insumos que ya existían y solo agregó el que faltaba. Por eso los costos de producción
  difieren de los de local (BSN-FB01N: Q70.86 allá, Q128.96 acá) — son precios distintos, no un
  error. Sincronizarlos es un paso aparte, si se decide. **Ya resuelto el 2026-09-22** — ver
  "Costos de los 4 productos reales" más arriba: la diferencia era un precio desactualizado en
  producción más una línea de receta basura en local, y los dos lados ya dan lo mismo.
- **Las recetas de los 4 productos reales son las de producción**, no las de local: sus 46 líneas ya
  existían con ids que colisionaron, así que las locales se saltaron. Es lo correcto, son
  consistentes con los precios de allá. Verificado: 10+11+11+14 = 46 líneas, cero duplicados.
- Los otros 1,281 productos entraron **sin receta** (Q0.00). Es esperado: nunca la tuvieron.
- Las cotizaciones de prueba de local (7-10, 12) **no** se copiaron. Producción conserva sus 6.

**Respaldos en el servidor** (`~/backups/`): `recetas-antes-fk-20260831-145041.sql` y
`core-antes-seed-20260831-154332.sql`.

**Nginx**: el catch-all `location / { proxy_pass :3000 }` se reemplazó por `return 302 /erp/`, con
backup previo en `/etc/nginx/sites-available/erpapp.bak-2026-08-31`.

**Pendiente**: borrar el repositorio de `01_erp` en GitHub (es del usuario, va con su cuenta). El
checkout local en `C:\Users\PETER\Documents\Jmox\01_erp` puede quedar un tiempo como respaldo frío.

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
- **Fase 5** — ~~corte final del legacy~~ **adelantado y ejecutado el 2026-08-31**, ver abajo. Lo
  que queda de esta fase es el cierre formal del proyecto, no el apagado de `01_erp`.

## Flujo de trabajo
- Cambios pequeños y verificables; probar en local (curl + Playwright para UI) antes de dar por
  terminado. Para pantallas nuevas, verificar visualmente en navegador, no solo con
  lint/typecheck/build.
- Mensajes de commit **siempre en español correcto, con tildes**.
- Pedir confirmación antes de cambios grandes o destructivos (migraciones, borrados, tocar
  `01_erp`, desplegar a producción).
- No inventar requisitos: si algo es ambiguo, preguntar.
