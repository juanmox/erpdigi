# 00 — Validación de supuestos (módulo Costeo Real)

> Generado por Claude Code el 2026-08-06, contra la base real de producción (`erpdb` en
> `192.168.2.13`, rol de solo lectura/escritura `digitexsa_erp`) — no contra una copia ni una
> suposición. Fase 0 del `PROMPT_CLAUDE_CODE.md`. **No se escribió código de aplicación para
> llegar a este documento**, solo consultas de solo lectura contra `information_schema`/`pg_catalog`
> y lectura directa de `DataREPOSMig.xlsx`.

## 0. Nota sobre `CONVENCIONES.md`

El prompt indica leer `CONVENCIONES.md` y que gana sobre este documento si hay contradicción.
**Ese archivo no existe en el repo.** `CLAUDE.md` es, hoy, el único documento de convenciones del
proyecto, y lo tomo como referencia — ver `CLAUDE.md` §"Convenciones de nombrado" y §"Convenciones
heredadas de `recetas`". Si en algún momento se crea `CONVENCIONES.md`, esta nota queda obsoleta.

## 1. Esquema real inventariado

| Schema | Tablas | Filas totales (aprox.) | Gestión |
|---|---|---|---|
| `core` | 10 (`empresas`, `usuarios`, `roles`, `permisos`, `rol_permisos`, `usuario_empresa_rol`, `monedas`, `tasas_cambio`, `auditoria`, `refresh_tokens`) | 2 empresas, 2 usuarios | Prisma Migrate (historial real) |
| `recetas` | 12 (`clientes`, `productos`, `insumos`, `categorias_insumo`, `unidades_medida`, `areas_uso`, `deportes`, `tallas`, `producto_insumos`, `cotizaciones`, `cotizacion_detalle`, `cotizacion_detalle_insumo`) | **1 cliente, 4 productos, 24 insumos, 46 líneas de producto_insumos, 6 cotizaciones** | Solo introspectado (`db pull`), sin migraciones propias |
| `public` | 1 (`_prisma_migrations`) | — | Tabla de control de Prisma |

**Roles de Postgres existentes:** `postgres` (superusuario), `erpadmin` (usa `01_erp`),
`digitexsa_erp` (dueño de `core`, lectura/escritura sobre `recetas`). Ninguno de los dos no-superusuario
tiene `CREATEDB`/`CREATEROLE`.

**Integridad referencial:** `core` tiene 11 foreign keys reales (Prisma las creó). **`recetas` no
tiene ninguna FK a nivel de Postgres** — es consistente con venir de un sistema legacy sin ORM/migraciones;
la integridad ahí es solo por convención de la aplicación, no por constraint. Relevante para el
principio §4.2 del prompt ("los datos malos deben ser imposibles") — `costeo` sí tendrá FKs reales
hacia `recetas`, pero no puede garantizar que `recetas` en sí esté siempre consistente.

---

## 2. Supuestos S1–S7

### S1 — Existe tabla maestra de clientes reutilizable
**✅ Confirmado, con matiz importante.** `recetas.clientes(id_cliente, codigo, nombre)` existe y
tiene FK real desde `recetas.productos.id_cliente`. **Pero es plana** — no separa cliente de línea
de producto. Ver discrepancia D1 más abajo: `costeo.linea_producto` debe ser una tabla **nueva**,
no algo que ya exista para reutilizar.

Hoy solo tiene **1 fila** (`0181 · BSN SPORTS`) — de los 31 clientes documentados en `ANEXO_B §8`
y los 52 valores distintos de `CLIENTE` que encontré en el `Registro` real (ver §3), falta cargar
prácticamente todo el catálogo real de clientes.

### S2 — No existe tabla de Órdenes de Facturación
**✅ Confirmado.** No hay ninguna tabla `orden_facturacion`, `of`, ni similar en `core` ni en
`recetas`. Tal como dice el usuario, hay que crearla — el diseño de `costeo.orden_facturacion` +
`costeo.of_op` del prompt aplica sin modificación.

Tampoco existe **Orden de Producción** (`orden_produccion`) en ningún schema — el prompt asume
crearla en `costeo`, correcto.

### S3 — Existe auth/roles, requiere granularidad por módulo/acción
**✅ Confirmado y ya en el patrón exacto que pide el prompt.** `core.permisos.codigo` es texto
libre con el patrón `<dominio>.<recurso>.<accion>` (ej. `plataforma.usuarios.administrar`,
`recetas.cotizaciones.crear` — ver `apps/api/prisma/seed.ts`). Los ~20 permisos que lista el
prompt en §7 (`costeo.rollo.ver`, `costeo.reposicion.crear`, etc.) **encajan sin ningún cambio de
esquema** — solo hace falta insertarlos en `core.permisos` y asignarlos a roles vía
`core.rol_permisos`. `core.usuario_empresa_rol` ya soporta rol distinto por empresa, útil si algún
día `costeo` corre para más de una empresa.

**Discrepancia D2 (aviso de seguridad heredado, no de este módulo):** el guard de permisos del ERP
(`PermissionsGuard`) hoy es *fail-open* — un endpoint sin `@RequirePermissions(...)` queda abierto
a cualquier usuario logueado en vez de bloqueado (ver `CLAUDE.md`). Cualquier ruta nueva de
`costeo` **debe** llevar el decorador explícitamente; no hay red de seguridad si se olvida.

### S4 — No existe maestro de insumos con costo vigente; hay que crearlo desde ANEXO_B
**❌ Parcialmente incorrecto — esto es el hallazgo más importante de esta validación.**
`recetas.insumos(id_insumo, codigo, descripcion, id_categoria, id_unidad, costo_promedio, activo)`
**ya existe**, con categoría y unidad ya normalizadas (`recetas.categorias_insumo`,
`recetas.unidades_medida`) — es prácticamente el mismo modelo que el prompt propone crear en
`costeo.insumo`.

Lo que **no** tiene es costo **versionado**: `costo_promedio` es un solo valor que se sobrescribe,
exactamente el mismo problema que `ANEXO_A §3.4` describe para el estándar de consumo.

Crucé los 133 códigos con código identificable de `ANEXO_B §10` contra `recetas.insumos` real:
**11 de 133 ya existen** (8%) — son los insumos que se usaron para pilotear el módulo Hoja Técnica
en Fase 2, no el catálogo completo.

**Recomendación (para tu validación, no implementada todavía):** siguiendo el mismo patrón que ya
es *requisito confirmado* para productos (S5b), `costeo` debería **referenciar `recetas.insumos`
por FK**, no crear `costeo.insumo` duplicado. `costeo` aportaría únicamente la tabla de costo
versionado (`costeo.insumo_costo`, igual al diseño del prompt pero con FK a
`recetas.insumos.id_insumo`). Los ~122 insumos de ANEXO_B que faltan se dan de alta directamente
en `recetas.insumos` (no en una tabla nueva), igual que ya se hace desde la pantalla de Catálogo
del ERP. Esto evita mantener dos maestros de insumos en paralelo.

### S5 — El schema `recetas` contiene el costo estándar y puede referenciarse para comparar estándar vs. real
**⚠️ Confirmado que existe, pero con una diferencia de grano que hay que resolver contigo antes de
codificar.** `recetas.producto_insumos(id_producto, id_insumo, consumo, id_area)` es la receta/BOM
completa por producto (46 líneas reales hoy, todos los insumos del producto, no solo papel) — pero
**no tiene columna de talla**. El estándar de consumo de papel del legacy
(`TablaConsumos!Consumos`, lo que el prompt modela como `costeo.consumo_estandar`) varía
específicamente por `producto + talla` (más área de impresión en una XL que en una S).

Son dos conceptos de "estándar" con grano distinto:
- **Hoja Técnica** (`recetas.producto_insumos`): BOM completo por producto, sin desglose de talla.
- **Estándar legacy de papel** (`costeo.consumo_estandar`, nuevo): específico de producto+talla,
  solo papel.

La comparación "estándar vs. real" que el prompt marca como *"la razón de ser del módulo"* (§6.3)
es válida para el estándar de papel (`costeo.consumo_estandar` vs. `costeo.consumo_papel`), pero
**no puede ser una comparación 1:1 automática contra `producto_insumos`** sin decidir primero cómo
se relacionan ambos conceptos. No es un bloqueante para F1–F5, pero si te interesa la comparación
integral (papel + resto de insumos) contra Hoja Técnica, es una decisión de diseño pendiente antes
de F6 (vistas BI).

### S5b — El maestro de productos vive en `recetas` (requisito, no supuesto)
**✅ Confirmado tal cual.** `recetas.productos(id_producto, codigo, descripcion, id_cliente,
desarrollo, patron, tamano, deporte, precio_venta, minutos_mo, costo_mo_minuto, activo,
creado_en)` existe con FK real a `recetas.clientes`. `costeo` puede referenciarlo por
`id_producto` sin cambios.

### S5c — Los 475 códigos de producto del legacy existen en `recetas`
**❌ No se pudo verificar completo — y lo poco que se pudo verificar es preocupante.**
El archivo con los 475 códigos (`TablaConsumos!Consumos`) **no está en el repo** — el único Excel
que se colocó (`DataREPOSMig.xlsx`) es `DataREPOS!Registro` + `DataREPOS!Empleados` (reposiciones,
no el estándar de consumo). No puedo cruzar los 475 códigos hasta que ese archivo se agregue.

Lo que sí pude verificar con lo disponible: de los 5 códigos de ejemplo que trae `ANEXO_B §7`
(`BSNS-VB-0006Y`, `BSNS-VB-0003W`, `BSN-SGS7MBS`, `BSN-SO1`, `BSNWCP09`), **0 de 5 existen** en
`recetas.productos` hoy. Los 4 productos reales que sí existen (`BSN-FB01N`, `BSN-FB02NB`,
`BSN-YFB02NB`, `BSN-FB01ESPN`) son del piloto de Fase 2, con una nomenclatura de código distinta a
los ejemplos de ANEXO_B. Ver `docs/01-COBERTURA-PRODUCTOS.md` para el detalle y lo que hace falta
para completar esta validación.

### S6 — MOD, GF y FIJOS se calculan fuera del sistema, capturados como valores dados por OF
**⏳ No verificable desde el código — es una pregunta de proceso, no de esquema.** No hay ninguna
tabla ni columna relacionada con costeo de mano de obra o gastos de fabricación en `core` ni
`recetas` hoy, lo cual es consistente con que se calculen externamente. Necesito que confirmes
directamente si eso sigue siendo así antes de fijar `costeo.orden_facturacion.mod_valor` /
`gf_valor` / `fijos_valor` como campos capturados (no calculados) — el diseño del prompt ya asume
esto correctamente, solo falta tu confirmación explícita para no dejarlo como supuesto.

### S7 — Existe maestro de empleados (RRHH / biométrico) reutilizable
**❌ No existe ningún maestro de empleados en la base del ERP.** Solo hay 2 usuarios de
plataforma en `core.usuarios` (administradores del sistema, no nómina de planta) y ninguna tabla
`empleado`/`personal`/`rrhh` en ningún schema. La Fase 4 del roadmap del ERP (RRHH) todavía no
arrancó.

Sobre el sistema biométrico (ZKTeco/Hikvision) mencionado en el prompt: **no tengo forma de
verificarlo desde aquí** — es hardware/software externo sin huella en esta base de datos. Necesito
que me confirmes si existe y, si es así, qué acceso hay a sus datos (¿API, export, base propia?).

Mientras tanto, analicé el catálogo real de empleados en `DataREPOSMig.xlsx!Empleados`: **117
filas, 101 sin código `T####` válido** (86%, peor que lo que sugiere `ANEXO_A §4.3` con solo 2
ejemplos) — antes de decidir si se crea `costeo.empleado` local o se espera RRHH, esto necesita
una limpieza de todas formas.

---

## 3. Hallazgos adicionales, verificados con datos reales (no solo con `ANEXO_A`)

Crucé `DataREPOSMig.xlsx!Registro` (57,891 filas reales) yo mismo contra lo documentado, y
encontré algunas cosas que `ANEXO_A` no menciona:

- **El campo `CLIENTE` tiene 52 valores distintos**, no solo las 6 variantes de BSN que cita
  `ANEXO_A §2.3`. Aparecen líneas de **Under Armour** con el mismo problema y peor (`UA-Exclusive -
  Football Jersey`, `UA Pants Premium`, `UA-Men Hail Mary Jersey`, `UA-MENS BASKETBALL AFM GAMETIME
  SHORT` — mezclan cliente + línea + a veces prenda en un solo campo). También hay un typo real:
  `BSN BSN Volleyball` (BSN duplicado).
- **`DEPARTAMENTO` tiene 16 valores, no 9.** El más preocupante: `"Defectos < 05Dic24"` aparece en
  **7,561 filas (13% del total)** — tiene toda la pinta de ser el nombre de una pestaña de Google
  Sheets que se coló como valor de departamento, no un departamento real. Antes de migrar hay que
  decidir a qué departamento real mapea ese 13%, o si se cuarentena.
- **Formato de OP en este archivo:** 85% correcto (`##OP######`), 15% sin relleno de ceros — mismo
  bug que `ANEXO_A §2.1`, confirmado independientemente con proporción real sobre este archivo
  puntual.
- **NRollo en este archivo:** de 57,891 filas, 5,531 tienen literalmente `"Buscando..."` (9.6%),
  50,398 vacías, 1,044 con formato válido de 3 segmentos, 918 con formato incompleto. Estos números
  son de `DataREPOS!Registro` específicamente — no se deben confundir con los 5,248/397,139 que cita
  `ANEXO_A §1`, que vienen de la hoja consolidada `ConsumosFinal_DIGITEXSA!Datos` (un archivo
  distinto, no incluido en el repo todavía).

---

## 4. Qué falta para cerrar Fase 0 por completo

1. **El archivo con los 475 códigos de producto** (`TablaConsumos!Consumos` o equivalente) — sin
   esto, `docs/01-COBERTURA-PRODUCTOS.md` queda con cobertura parcial.
2. **`ConsumosFinal_DIGITEXSA!Datos`** (397,139 filas) y **`TablaConsumos`** completo, si se quiere
   verificar el resto de `ANEXO_A` contra datos reales en vez de solo confiar en el análisis ya
   documentado.
3. Confirmación tuya sobre S6 (MOD/GF/FIJOS) y S7 (biométrico).
4. Decisión sobre la recomendación de S4 (reusar `recetas.insumos` vs. crear `costeo.insumo`
   nuevo) — es la discrepancia de mayor impacto en el modelo de datos del §5 del prompt.
5. Decisión sobre S5 (cómo se relaciona, si acaso, `producto_insumos` con
   `costeo.consumo_estandar`).

**No voy a escribir código de aplicación hasta que estas 5 cosas se resuelvan** — así lo pide el
prompt y así lo entiendo yo también, dado lo que encontré en S4 y S5c.
