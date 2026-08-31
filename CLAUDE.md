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
  error. Sincronizarlos es un paso aparte, si se decide.
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
