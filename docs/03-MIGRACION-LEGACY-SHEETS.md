# Migración de los Google Sheets legacy a `costeo` — análisis y plan

**Estado: ANÁLISIS TERMINADO, NADA MIGRADO.** Este documento es el paso previo que
pidió el usuario ("haz las observaciones antes de cualquier migración de datos").

Fuentes (en `C:\Users\PETER\Documents\Jmox\01\Formas de recolección de info Costos\Migracion DATA GoogleSheets\`):

| Archivo | Hojas | Filas totales | Rango de fechas |
|---|---|---|---|
| `DataREPOSMig hasta121026.xlsx` | `Registro`, `Empleados` | 64,836 | 2002-06-24 → 2026-10-26 |
| `ConsumosFinal DIGITEXSAMig hasta121026.xlsx` | `Datos` | 452,107 | 1969-12-31 → 2026-10-26 |

Ventana pedida: **2026-09-01 … 2026-10-11**.

---

## 1. Lo que decide todo: los dos archivos se solapan

La hoja `Datos` de `ConsumosFinal` **ya contiene las reposiciones** (el formulario
legacy las espejaba ahí además de en `Registro`), pero sin el detalle: no trae
defecto, departamento, tela ni comentario. Confirmado por el usuario y medido:

| En la ventana | Filas |
|---|---|
| `Datos` — filas CON `REPO` (reposiciones espejadas) | 3,667 |
| `Datos` — filas SIN `REPO` (consumo de producción real) | 33,669 |
| `Registro` — reposiciones con su detalle completo | 3,613 |

**Regla de la migración**, y es lo que evita contar el papel dos veces:

- **Reposiciones** → salen **solo de `Registro`** (es el único con defecto/tela/comentario).
- **Consumo de producción** → sale **solo de las filas sin `REPO` de `Datos`**.

Cruce de las claves `(OP, No. REPO)`: 2,842 en ambos lados, con **31 claves que
están solo en `ConsumosFinal`** y 31 solo en `Registro`. O sea que 31 reposiciones
nunca se espejaron y otras 31 nunca se registraron con detalle.

---

## 2. Qué exige el ERP (medido contra el schema real)

Lo bueno: el modelo es más tolerante de lo que parecía.

- `consumo_papel.id_montaje_rollo` es **NULLABLE**, igual que `id_linea_produccion`,
  `id_talla`, `cantidad` y `id_consumo_estandar`.
- `reposicion` solo exige `fecha`, `id_orden_produccion`, `numero_repo`,
  `id_departamento`, `id_defecto`, `yardas_papel`, `yardas_tela`, `creado_por`.
  Impresora, calandra, montaje, tipo de papel, tela y empleado son opcionales.
- `orden_produccion` solo exige `anio`, `correlativo`, `creado_por`, `id_empresa`.
  **Cliente y orden de compra son opcionales**, así que las OP históricas se pueden
  crear con lo que hay.

Lo que sí obliga:

- **`ck_consumo_papel_origen_regla`**: un consumo `PRODUCCION` exige
  `id_linea_produccion NOT NULL`. O sea que **cada fila de consumo necesita su
  línea**, y cada línea necesita un `id_producto` real.
- `consumo_papel.id_impresora` y `id_tipo_papel` son **NOT NULL**.
- `UNIQUE (id_linea_produccion, id_talla)` para consumo PRODUCCIÓN vigente → da
  **idempotencia gratis**: re-correr la migración no puede duplicar.
- `UNIQUE (id_orden_produccion, numero_repo)` → idem para reposiciones, y es la
  causa del problema #1 de abajo.
- `orden_produccion.codigo` y `reposicion.codigo_repo` son **GENERATED**: no se
  escriben, se derivan.

### Estado de producción al momento del análisis

```
ordenes 437 | lineas 1,433 | rollos 187 | montajes 16 | consumos 1,862
reposiciones 0 | estandares 3,315 | productos 1,300 | tallas 158 | insumos 25
```

Las 437 OP son `26OP030760`…`26OP031404`. **Ninguna de las 6,604 OP del legacy
existe todavía**, así que no hay riesgo de pisar nada de lo que se capturó ayer.

---

## 3. Volumen a crear

| Objeto | Cantidad | ¿Existe hoy? |
|---|---|---|
| `orden_produccion` | 6,604 | 0 |
| `linea_produccion` | 19,134 | 0 |
| `consumo_papel` (producción) | 33,669 | — |
| `reposicion` | 3,613 | 0 |

De las 6,604 OP: 1,577 aparecen en los dos archivos, 4,589 solo en consumos y
438 solo en reposiciones.

---

## 4. Cruce contra catálogos — lo que calza

| Catálogo | Resultado |
|---|---|
| Departamentos | **7 de 7** calzan por nombre |
| Defectos | **34 de 34** calzan por nombre |
| Calandras | **3 de 3** (`MONTI #1/#3/#5`) |
| Tallas | **18 de 19** |
| Productos (`ITEM`) | **186 de 188** |
| Impresoras | **8 de 11** |
| Tipos de papel | **4 de 5** |
| Telas (código de insumo) | **6 de 36** |

---

## 5. Observaciones y problemas

### ⚠️ P1 — La numeración de reposiciones del legacy NO es única (1,322 filas en juego)

El ERP tiene `UNIQUE (id_orden_produccion, numero_repo)` porque calcula el número
server-side con `MAX+1`. El legacy lo dejaba teclear, y se repitió:

- **551 pares `(OP, No. REPO)` repetidos**, que abarcan **1,322 filas**.
- De esos 551, **solo 19 son duplicados reales** (datos idénticos).
- Los otros **532 son eventos DISTINTOS con el mismo número**: fecha, defecto,
  tela y yardas diferentes. Ejemplo real, `26OP021533 R01` con cuatro filas:

```
2026-09-01 07:21 | Defecto de Tela       | papel=2.55 | BSNUA-1005 KNT TRICOT
2026-09-01 07:25 | Mota                  | papel=0.63 | BSNUA-1009 TRICOT 8 OZ
2026-09-03 16:26 | Defecto de Tela       | papel=3.33 | 173011 PAPEL ADHESIVE FILM
2026-09-03 17:08 | Defecto de Tela       | papel=2.80 | 174106 INTERLOCK PRE FIJADO
```

Respetando el UNIQUE tal cual, **se perderían ~771 reposiciones reales (21%)**.

**Recomendación**: renumerar por OP en orden de fecha (1,2,3,…) **y** guardar el
número original en una columna nueva `numero_repo_legacy` (nullable, migración
pequeña). Así no se pierde ningún evento y la requisición física sigue siendo
rastreable. Requiere decisión del usuario.

### ⚠️ P2 — `PAPEL DIGITAL PROTECT 100 GSM 64"` no está en el catálogo (1,417 filas)

Es exactamente el tipo de papel que F1 dejó fuera a propósito por ser un
**posible duplicado** de `DIGITAL PROTECT 100`, que sí existe. Decisión del
usuario: ¿es el mismo papel (se mapea) o es otro (se crea)?

### ⚠️ P3 — Las 86 filas de servicio no encajan en el modelo de prendas

Un bloque coherente y distinto a todo lo demás: cliente **MANUFACTURAS DEL SOL, S.A.**,
producto `SERV-SUBLIMADO`, talla `YDS`, impresora `MK's`, `LINE` vacío, sin NRollo,
y la cantidad **es la yarda misma** (CANT = CONSUMO YDS). Es un **servicio de
sublimado vendido en yardas**, no producción de prendas.

Faltan tres cosas para migrarlas: el producto, la talla `YDS` y a cuál de las 4
Mimaki (`MK3`-`MK6`) corresponde `MK's`. **Pregunta de fondo: ¿ese trabajo es de
Digitexsa o de Digitalpro?** Si es de la otra empresa, van con otro `id_empresa`.

### ⚠️ P4 — `SWBRDS` no existe como producto (21 filas)

21 filas apuntan a un código que no está en `recetas.productos`. No lo invento:
puede ser un typo de `SWBRDC7UL` (que sí existe) o un producto que falta dar de alta.

### ⚠️ P5 — 30 de 36 códigos de tela no existen en `recetas.insumos`

Producción tiene 25 insumos; el legacy referencia 36 telas. Faltan `174001`,
`174026`, `174098`, `174099`, `BSNUA-1001`…`BSNUA-1014`, `CK-1002`, etc.

`reposicion.id_insumo_tela` es nullable, así que la migración **no se bloquea**:
las yardas de tela se registran igual. Lo que se pierde es *qué* tela fue.
El legacy trae código **y descripción completa**, así que crearlos es viable
(quedarían con costo Q0.00, como los 1,281 productos sin receta). Decisión del
usuario.

### ⚠️ P6 — El NRollo histórico no se puede resolver a un montaje

El legacy trae NRollo en formato `factura-total-secuencia`, pero:

- De las 9 facturas que menciona, **solo 3 existen** en el ERP.
- En la ventana **no hay ningún montaje** registrado (los 16 de producción son de
  ayer en adelante).
- En las reposiciones el NRollo legacy falla seguido: `No encontrado` (1,465),
  `Buscando...` (774), `Error`/`ERROR` (21) — o sea **2,260 de 3,613 (63%) sin resolver**,
  que es justamente la heurística que el ERP reemplazó.

**Decisión de diseño (no requiere al usuario)**: `id_montaje_rollo = NULL` y el
texto del NRollo se guarda en `consumo_papel.observacion` (hoy 100% vacía en el
legacy). **Consecuencia buena y deliberada**: con el montaje en NULL, el consumo
histórico **no se descuenta de ningún rollo**, así que el inventario de los 187
rollos físicos de hoy queda intacto.

### ⚠️ P7 — El 37% de los `LINE` traen `.0` pegado

**12,531 de 33,669 filas** tienen `LINE` como `7013272651.0`: artefacto de Excel al
convertir número a texto. Sin normalizar, se crearían líneas duplicadas
(`7013272651` y `7013272651.0` como dos códigos distintos). Se normaliza quitando
el `.0` final. Los `ITEM` no tienen el problema (0 filas).

### ⚠️ P8 — Las fechas hay que anclarlas a UTC-6

Vienen con hora real y microsegundos (`2026-09-01 11:20:52.685`), en hora de
Guatemala. Si se insertan como UTC, todo se corre 6 horas y los cortes por día
quedan mal — **es el mismo bug que rompió el reporte de consumo** (ver
`common/dia-guatemala.ts`). 376 consumos y 6 reposiciones vienen a las 00:00:00,
o sea solo con fecha.

### ⚠️ P9 — 3 filas con código de OP que el ERP no puede representar

`codigo` es GENERATED como `anio || 'OP' || correlativo`, así que no admiten:

- `26DE000038` — 2 filas (CLIFF KEEN, `ITEM=DEV/SAMPLE`, LINE `SAMPLES-24-7 COMP`).
  Parece una orden de **desarrollo/muestra**, no de producción.
- `9OP030148` — 1 fila, año malformado.

Se reportan y quedan fuera, salvo que el usuario indique a qué OP corresponden.

### Observaciones menores, ya resueltas sin necesidad de preguntar

- **`MS3` / `MS5` sin espacio** (299 filas) → se normalizan a `MS 3` / `MS 5`.
- **`CONSUMO YDS`**: 0 filas negativas (ninguna viola el CHECK), 209 en cero, que
  se aceptan tal cual.
- **`CANT`**: 100% enteros.
- **`ENGUIAMIENTO`**: presente en las 33,669 filas → se migra **tal como vino**, no
  se recalcula. Es el dato que el legacy ya tenía.
- **`EN BLANCO`**: 100% vacío en la ventana → nada que migrar.
- **`OBSERVACION`**: 100% vacía → queda libre para el NRollo (ver P6).
- **`BODEGA SAC`**: 100% vacía en las reposiciones de la ventana.
- **`RESPONSABLE`**: 3,605 dicen el literal `Sin responsable` y 4 dicen `Nombres`
  (encabezado tecleado por error) → `id_empleado = NULL`. La hoja `Empleados` del
  mismo archivo puede sembrar `costeo.empleado` (hoy con **0 filas**) más adelante,
  pero no hace falta para esta migración.
- **`CALANDRA`**: 3,609 de 3,613 vacías; las 4 con valor calzan.

---

## 6. Por qué esto va por SQL y no por la API

No es por velocidad, es porque **la API lo rechazaría, y con razón**:

1. `capturarUna()` **exige un rollo montado** en ese instante y tira 409 si no hay.
   El histórico no tiene montajes → todas las filas fallarían.
2. El **espejo a Google Sheets** se dispara al crear consumo y reposiciones, así que
   migrar por la API **reescribiría en los mismos libros de los que estamos leyendo**,
   duplicando filas que alimentan los Dashboards de Data Studio.
3. El tope de impresora ajena (F5-1C) frenaría filas de otros operarios.

Con SQL directo no se toca ningún libro y las reglas de negocio del flujo vivo —que
son correctas para la captura de hoy— no estorban al histórico.

---

## 7. Plan por fases

Cada fase termina en una verificación medible y **se detiene a esperar validación**.

### F0 — Preparación (sin escribir en producción)
1. `pg_dump --schema=costeo --schema=recetas` de respaldo.
2. Usuario de migración: crear `migracion` (ver decisión D6) y usar su `id_usuario`
   en `creado_por`, para que la bitácora no muestre 37,000 acciones a nombre de una
   persona.
3. Resolver las decisiones D1-D7 de abajo.
4. Script de migración en `apps/api/scripts/migrar-legacy-sheets.mjs`, con
   **`--desde` y `--hasta` como parámetros** para poder correr otras ventanas después,
   y `--dry-run` que reporta sin escribir.

### F1 — Catálogos faltantes (según las decisiones)
Productos, talla `YDS`, tipo de papel, insumos de tela — lo que el usuario autorice.
Verificación: los cruces de la sección 4 quedan en 100%.

### F2 — Órdenes y líneas
6,604 `orden_produccion` + 19,134 `linea_produccion`, en una transacción por lotes.
Las OP se crean con `cliente` y `orden_compra` resueltos **cuando se pueden deducir**
(el `CLIENTE` de consumos es limpio: BSN SPORTS, UNDER ARMOUR, CLIFF KEEN ATHLETIC);
el `CLIENTE` de reposiciones mezcla cliente+línea, así que de ahí **no** se deduce.
Verificación: `count(orden_produccion)` sube exactamente 6,604 y cada línea tiene
producto real.

### F3 — Consumo de producción
33,669 filas con `origen='PRODUCCION'`, `id_montaje_rollo=NULL`, NRollo en
`observacion`, enguiamiento tal como vino.
Verificación: la suma de `consumo_yd` del ERP en la ventana **cuadra exactamente**
con la suma de la columna `CONSUMO YDS` del archivo. Ese es el invariante.

### F4 — Reposiciones
3,613 filas desde `Registro`, con la renumeración de D1.
Verificación: suma de `yardas_papel` y `yardas_tela` idéntica al archivo, y el
conteo por defecto/departamento igual.

### F5 — Cierre
- El reporte de consumo por OP muestra la ventana completa.
- El inventario de rollos **no cambió** (montaje NULL), verificado antes/después.
- `CLAUDE.md` actualizado.

---

## 8. Decisiones — estado

### Resueltas por el usuario (2026-10-13)

| # | Decisión | Resolución |
|---|---|---|
| **D1** | Reposiciones con número repetido | **Renumerar** por OP en orden de fecha y **guardar el número legacy** en columna nueva, para no perder los 771 eventos y que la requisición física siga siendo rastreable |
| **D2** | `PAPEL DIGITAL PROTECT 100 GSM 64"` | Es el **mismo** papel → se mapea a `DIGITAL_PROTECT_100`, que es el nombre que ya usa el catálogo (1,417 filas) |
| **D3a** | ¿De qué empresa es el servicio de sublimado? | **Digitexsa** |
| **D3b** | ¿Existe el producto del servicio? | **NO**: el usuario confirmó que los 5 servicios del catálogo son distintos entre sí, así que `SERV-SUBLIMADO` **se crea** siguiendo su convención (desarrollo aprobado sin receta, `tamano='L'`, `patron='NO APLICA'`, código mnemónico de 10 caracteres como `20000THERM`/`170TRANSCM`) |
| **D3c** | ¿Qué Mimaki es `MK's`? | Repartir las 16 OP entre **MK3 y MK5** (son las más usadas). ⚠️ Es una **aproximación que el dato no respalda**: el legacy guardó el grupo, no la máquina. Queda constancia en `consumo_papel.observacion` de cada una de las 86 filas para que nadie lea esas 3,582 yd como un hecho medido |
| **D3d** | Cliente `MANUFACTURAS DEL SOL, S.A.` | **Se crea** |
| **D4** | `SWBRDS` | Se crea **UN** producto, no dos. El legacy no puede distinguir los colores (ambos salen como `SWBRDS`), pero **sí los distingue por `LINE`**: en `26OP024080` conviven `PO4426-SO3972078-1` y `-3` con tallas y cantidades idénticas — son los dos colores. Al conservar el `codigo_line` no se pierde nada. Desarrollo **`1800002182`** (LINNER BLACK), confirmado por el usuario. `180002182A` (LINNER WHITE) **queda sin producto**: separarlos como ya están `BRDSP7-BK/NY/RB/SC` es un alta posterior en Gestión de datos, y no afecta a las 21 filas históricas |
| **D8** | OP irrepresentables | 3 filas (`26DE000038` ×2, `9OP030148`) quedan fuera y se reportan |

### Resueltas (continuación)

| # | Decisión | Resolución |
|---|---|---|
| **D5** | Las 30 telas faltantes | **Se crean** como insumos con el código y la descripción del legacy, costo Q0.00 — igual que los 1,281 productos sin receta que ya conviven en el catálogo. Sin esto, el 83% de las reposiciones migradas no diría qué material se repuso |
| **D6** | Autor de las filas históricas | Usuario **`migracion`** dedicado, no `admin`. La bitácora narra por usuario y 37,000 acciones a nombre de una persona la vuelven ilegible |
| **D7** | Las 31 reposiciones sin detalle | **Se omiten y se reportan.** No es una preferencia: `id_defecto` e `id_departamento` son **NOT NULL** y `ConsumosFinal` **no tiene esas columnas**, así que no hay de dónde sacarlas. La única alternativa sería inventar un defecto "Sin detalle", que contaminaría justo la estadística para la que existen las reposiciones. Pesan **33 filas / 30.20 yd ≈ 0.8%** |

⚠️ El grupo inverso **sí migra**: otras 31 claves están en `Registro` pero nunca se
espejaron a `ConsumosFinal` (33.80 yd). Como el detalle sale de `Registro`, no les
falta nada.

### Respaldo y foto previa (2026-10-13 12:19)

```
~/backups/costeo-antes-migracion-legacy-20261013-121926.sql   (816K)
~/backups/recetas-antes-migracion-legacy-20261013-121926.sql  (532K)

ordenes 437 · lineas 1,433 · consumos 1,862 · reposiciones 0 · montajes 16 · rollos 187
productos 1,300 · desarrollos 1,300 · clientes 100 · insumos 25
consumo 8,808.3336 yd · enguiamiento 661.1975 yd · en blanco 194.0000 yd
```

⚠️ **1,861 de los 1,862 consumos actuales tienen montaje.** Como los históricos entran con
`id_montaje_rollo = NULL`, quedan identificables sin ambigüedad — y por lo tanto la
migración es reversible con un `DELETE` acotado por esa condición más el rango de fechas.

## 9. Lo que NO voy a hacer sin pedirlo aparte

- Tocar las 437 OP y 1,862 consumos que ya cargó producción.
- Migrar fuera de la ventana pedida (el script queda parametrizado, pero cada
  ventana se corre con autorización).
- Escribir en los Google Sheets.
- Sembrar `costeo.empleado` desde la hoja `Empleados` (no hace falta para esto).

---

## 10. Ejecución en LOCAL (2026-10-13) — hecha y verificada

Corrida con `apps/api/scripts/legacy-sheets-cargar.mjs`, que va **por SQL y no por la
API**: `capturarUna()` exige un rollo montado y tiraría 409 en las 33 mil filas, y el
espejo a Google Sheets reescribiría en los mismos libros de donde salieron estos datos,
duplicando lo que leen los Dashboards.

`--dry-run` **no simula**: hace todos los INSERT de verdad dentro de una transacción y al
final hace ROLLBACK, así que las FK, los CHECK y los índices únicos se ejercitan de
verdad. Una simulación en memoria no probaría ninguno.

### Resultado

| fase | resultado |
|---|---|
| F1 catálogos | 31 telas nuevas · 2 productos (`SWBRDS`, `SERV-SUBLIMADO`) · cliente MANUFACTURAS DEL SOL · usuario `migracion` |
| F2 órdenes | 6,601 creadas (1 ya existía) |
| F3 líneas | 19,137 creadas (2 ya existían) |
| F3b tallas de línea | 33,507 combinaciones · 121,409 piezas |
| F4 consumos | 33,593 insertados · 10 ya existían · 35 reenvíos descartados (103.31 yd) |
| F5 reposiciones | 3,612 insertadas · 1,592 renumeradas · tela identificada 3,612/3,612 |

**El invariante de yardas cierra exacto**: 129,613.01 extraídas − 103.31 de reenvíos −
93.84 de `SBRDCS6` = 129,415.86 esperadas contra **129,415.87 insertadas** (0.01 de
redondeo a 4 decimales por fila).

**El inventario físico no se movió**: montajes 15 = 15, rollos 83 = 83, y lo que descuenta
de un rollo sigue siendo **188.5147 yd** (= 171.0986 + 13.4161 + 4.0000, idénticas a la
foto previa). Es la consecuencia buscada de entrar con `id_montaje_rollo = NULL`.

### ⚠️ Dos defectos propios encontrados probando en local

Ninguno de los dos bloqueaba la app; los dos habrían dado datos incorrectos en silencio.

1. **No se poblaba `costeo.linea_produccion_talla`** — la cantidad planificada por talla.
   Sin ella las 6,601 OP migradas se ven con la matriz de tallas **vacía y Total 0**, como
   si no hubieran cargado. Era una omisión del plan, no una decisión. La `CANT` del legacy
   es lo que se imprimió de esa talla, y en una OP ya impresa eso es también lo
   planificado, así que es un 1:1 con la fila de consumo (fase F3b).
2. **Las reposiciones no eran idempotentes.** Al renumerar desde `MAX+1`, una segunda
   corrida elegiría números libres e insertaría **3,612 duplicados** con números 14 en
   adelante — el `ON CONFLICT (orden, numero_repo)` no las atrapa porque el número ya es
   distinto. Corregido comparando por la llave natural del legacy:
   `(orden, número que traía, fecha)`.
3. **Y un tercero al probar la re-corrida**: las 86 filas de servicio tienen `id_talla`
   NULL, y **en un índice único NULL nunca choca**, así que el `ON CONFLICT` tampoco las
   atrapaba: una segunda corrida sumaba 3,582 yd de consumo fantasma. No tienen llave
   natural posible (`26OP025662` trae `cant=11` dos veces y `cant=2` tres veces en la misma
   fecha, y son entradas distintas), así que la idempotencia va **por bloque**: si la línea
   ya tiene consumo de servicio, su bloque completo ya entró.

**Idempotencia verificada de verdad**: tras la carga, una segunda corrida inserta **0
filas en las cinco fases**.

### Reversión

`creado_por = (usuario migracion)` identifica por completo lo que creó la migración.
Probado en local: borrando en orden consumos → reposiciones → líneas → órdenes, la base
volvió **exacta** a la foto previa (68 OP · 253 líneas · 32 consumos · 11 reposiciones ·
15 montajes · 83 rollos). Los catálogos (telas, productos, cliente) se dejan: son
compartidos y la re-corrida los saltea.

### Lo que NO entró, y por qué

**29 filas (93.84 yd) del producto `SBRDCS6`**, que existe en producción pero no en local.
En producción sí van a cargar. Es la única divergencia de catálogo entre los dos ambientes.

### Hallazgo de UI: el reporte de consumo no escala al volumen nuevo

Medido en navegador con los datos migrados. **La API va rápida; el costo es puramente del
render en pantalla** (~0.7 ms por fila, sin paginación ni virtualización):

| rango | filas | API | render |
|---|---|---|---|
| 1 día | 196 | 17 ms | instantáneo |
| 1 semana | 6,962 | 205 ms | ~6 s |
| 1 mes | 8,810 | 272 ms | **8.0 s** |
| ventana completa (41 días) | 43,834 | 1.2 s | **30.2 s** |

La salida de escape ya existe y funciona: el **Excel de la ventana completa sale en 10 s**
(4.3 MB, `.xlsx` válido), porque se arma en el servidor.

**Recomendación (decisión del usuario, no hecha)**: topar el detalle en pantalla como ya
hace la tabla de Órdenes —que muestra 200 de 6,228 y lo **dice** ("se muestran las 200 más
recientes de 6228")— y remitir al Excel para el conjunto completo. Degrada linealmente, así
que el problema crece con cada mes que se migre.

**Lo demás no tiene problema**: Órdenes, Impresión de OPs, Reposiciones, Rollos y la
Bitácora cargan los datos migrados con **cero desborde horizontal a 1500 y 390 px** y
consola limpia. El atajo de código encuentra las OP migradas, y `siguiente-numero` sobre
una OP migrada devuelve **5** —continuando desde donde el legacy quedó—, que es la prueba
de que la renumeración se integra con el flujo vivo.

*Nota de método*: tres "hallazgos" de esta pasada fueron **falsos positivos de mis propias
pruebas**, no defectos: contar inputs antes de que react-query resolviera (misma carrera ya
documentada con los grupos de papel), dos regex mal escritas que no matcheaban el aviso del
tope de Órdenes ni el código de la OP en su ficha, y un `toupper` de awk que no sube acentos
contra el `upper()` de Postgres, que inventó tres defectos inexistentes. Conviene confirmar
contra el DOM o contra SQL antes de reportar.

### 7 filas excluidas a mano (2026-10-13)

Planta pidió quitar 7 filas de `ConsumosFinal` que ya se eliminaron del Google Sheet vivo
pero que esta copia descargada todavía trae. El usuario las marcó con `*` en la **columna
P** de la hoja `Datos`.

El extractor las excluye leyendo esa columna **por posición y no por encabezado** (la hoja
tiene encabezado solo hasta la O, `NRollo`): cualquier contenido en P excluye la fila. Si
una descarga futura viene sin marcas, no se excluye nada y el script se comporta igual. Las
7 quedan registradas una por una en `descartes.tsv`, así que la exclusión es auditable y no
silenciosa — se prefirió eso a editar el .xlsx a mano, que además es más fácil de equivocar.

Las 7 son del 30/09/2026, todas `BSNS-AC-8800A` en la MS 6, y suman **13.41 yd**:
`26OP028915` (4XL), `26OP028895` (S-M, L-XL), `26OP028904` (S-M, L-XL) y `26OP028905`
(L-XL ×2).

⚠️ **Dato que conviene saber: 6 de las 7 el cargador ya las estaba descartando** por ser
reenvíos duplicados. Se nota en los contadores — los reenvíos descartados bajaron de 35 a
29 (−12.91 yd) y las yardas insertadas solo bajaron **0.50**, que es la fila de 4XL de
`26OP028915`, la única que de verdad estaba entrando. O sea que el marcado manual de planta
y la deduplicación automática coinciden, lo cual es una confirmación cruzada de las dos.

**Totales finales de la extracción**: 33,660 consumos (129,599.60 yd) y 3,612 reposiciones
(papel 3,900.82 yd · tela 3,844.36 yd).

### Cliente y orden de compra en la orden (2026-10-13)

El usuario vio en la pantalla de Órdenes que las OP migradas salían con **"Sin cliente"** y
**"OC: —"**. No era un problema del dato: la fase 2 insertaba la orden con solo
`anio`, `correlativo`, `id_empresa` y la auditoría, **sin escribir `id_cliente` ni
`orden_compra`** aunque los dos se podían obtener. Mismo tipo de omisión que la de
`linea_produccion_talla`. Medido en local: de 6,601 OP migradas, **0 con cliente y 0 con
orden de compra**, contra 74/74 en las cargadas por plantilla.

**La orden de compra no viene como columna en ningún libro**, pero se deduce: el LINE es
`<orden de compra>` o `<orden de compra>-<n>`, que es exactamente la regla con la que el ERP
genera el Item desde 2026-10-08. Se resuelve **por OP y no por LINE suelto**, tomando el
candidato más largo que explique todos los LINE de esa orden.

⚠️ **Por LINE suelto con un `-\d+$` da mal**, y lo probé: en `RECLAMO-7012107575` el sufijo
es todo dígitos y la regex se lo come, dejando la OC en `RECLAMO`. Mirando el conjunto, el
candidato `RECLAMO-7012107575` explica las dos líneas de esa OP y `RECLAMO` no, así que gana
el correcto. Pasa igual con `4488-3972915`. Con el método por OP: **6,149 de 6,149, cero
fallos**, máximo 20 caracteres (la columna admite 40) y **ninguna OC repetida entre OP
distintas** — lo cual confirma de paso la regla "1 OC = 1 OP" en el dato legacy.

**El cliente viene en dos formatos según el libro**, y el limpio manda:
- `ConsumosFinal` lo trae limpio, con solo 4 valores (BSN SPORTS, UNDER ARMOUR, CLIFF KEEN
  ATHLETIC, MANUFACTURAS DEL SOL). Resuelve por nombre contra `recetas.clientes`.
- `Registro` lo trae **mezclado con la línea de producto** (`BSN Soccer`, `UA-Exclusive -
  Football Jersey`): el hallazgo de ANEXO_A §2.3. Solo se usa para las **437 OP que
  únicamente tienen reposición**, mapeando por prefijo (BSN·UA·CLIFF·SHERRY). Los cuatro
  destinos existen en el catálogo de los dos ambientes, verificado antes de usarlos.

**7 OP quedan sin cliente a propósito**: traen dos clientes distintos (BSN SPORTS y UNDER
ARMOUR), e `id_cliente` es uno solo. Se dejan en NULL en vez de elegir a dedo — y como son
empates (12/12, 2/2, 1/1…), ni siquiera habría mayoría que desempatara.

**Resultado**: 6,148 OP con orden de compra y **6,594 de 6,601 con cliente (99.9%)**.
Verificado en navegador: cero filas con "Sin cliente" o "OC: —", y la ficha de `26OP030969`
muestra BSN SPORTS / `7013636928`, que coincide con los Items `7013636928` a `-9` de sus
10 líneas.

⚠️ **`id_linea_producto` sigue vacío, y eso no se arregla acá.** `ConsumosFinal` no trae
ninguna columna de línea, así que solo sería derivable del valor mezclado de `Registro` —
disponible para 2,014 OP de 6,602 (30%). Llenarlo en un tercio y dejar el resto vacío sería
peor que dejarlo consistentemente vacío, y además varios de esos textos
(`UA-WOMAN BASKETBALL GAMETIME JERSEY`) no son nombres de línea limpios. Queda como decisión
del usuario.
