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
