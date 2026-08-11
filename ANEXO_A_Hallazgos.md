# ANEXO A — Hallazgos del análisis forense de los datos legacy

> Documento de referencia para el módulo `Costeo Real`. Cada hallazgo aquí documentado debe tener una contramedida explícita en el diseño. Los conteos provienen del análisis directo de los archivos exportados de Google Sheets en agosto 2026.

---

## 0. Inventario de fuentes

| Fuente | Filas | Columnas | Rol |
|---|---:|---:|---|
| `ConsumosFinal_DIGITEXSA` → `Datos` | **397,139** | 16 | Tabla de hechos unificada (Formas 1 y 2) |
| `DataREPOS` → `Registro` | 57,891 | 16 | Detalle de reposiciones |
| `DataREPOS` → `Empleados` | 116 | 5 | Catálogo de responsables |
| `DataDisev3` → `DatosOrigen` | 15,824 | **237** | Staging de producción |
| `DataDisev3` → `Mantenimiento` | 11 | 2 | Impresora → papel default |
| `TablaConsumos` → `Consumos` | 3,687 | 7 | Estándar de consumo vigente |
| `TablaConsumos` → 13 hojas fechadas | — | — | Bitácora de solicitudes de cambio — **no migrar** |
| `Costos Marzo26.xlsx` → `COSTOS` | 171 | **482** | Insumos por OF (mensual) |
| `Costos Marzo26.xlsx` → `ER` / `ER POR TIPO` | 29 / 877 | 14 / 12 | Estado de resultados |

**Composición de `Datos` (397,139 filas):**
- 333,156 provienen de Forma 2 (tienen `ITEM`)
- 62,454 provienen de Forma 1 (tienen `REPO`)
- ~1,529 sin ninguno de los dos

**Rango de fechas observado:** `2002-06-24 14:37` → `2026-08-30 05:08`. Ambos extremos son anómalos (ver §4).

---

## 1. 🔴 CRÍTICO — Race condition en la resolución del NRollo

### Evidencia

**5,248 registros contienen el texto literal `"Buscando..."` en el campo de número de rollo.**

```
[395610] 2026-08-01 15:58 | 26OP020103 | R01 | BSN Soccer | MS 6 | NRollo='Buscando...'
[395611] 2026-08-01 15:59 | 26OP020103 | R01 | BSN Soccer | MS 6 | NRollo='958745125-45-11'
```

Distribución del campo `NRollo` en `Datos`:

| Valor | Filas |
|---|---:|
| Código válido | 58,865 |
| `"Buscando..."` (corrupto) | **5,248** |
| Vacío | 333,026 |

### Causa raíz

En `JS.html` de la Forma 1, la función `buscarYLlenarNRollo()` escribe el placeholder `'Buscando...'` en el input visible **y en el campo oculto** que se envía al servidor, antes de lanzar la llamada asíncrona a `google.script.run`. El formulario no bloquea el submit mientras la búsqueda está en vuelo. Si el usuario presiona Guardar antes del callback, el placeholder se persiste como si fuera un dato real.

La corrupción es intermitente, no sistemática: en el mismo minuto conviven registros correctos y registros con el placeholder. Depende de si el usuario alcanzó a presionar Guardar antes de que retornara la búsqueda.

### Nota sobre la columna 16 (`FUNCION`)

`DataREPOS!Registro` tiene 16 encabezados. La columna 16 (`FUNCION`) corresponde a **una prueba puntual del usuario y no contiene datos productivos**.

**Implicación para migración:** el NRollo se lee de la **columna 15 (`NRollo`)**, que es la correcta. La columna 16 se descarta por completo y no se modela.

### Contramedida

Resolución del rollo **en el servidor** al momento de guardar, mediante `costeo.fn_rollo_en(impresora_id, momento)` sobre la tabla `montaje_rollo`. El cliente nunca envía el número de rollo. Un placeholder de UI no puede alcanzar la base de datos.

---

## 2. 🟠 Problemas de integridad referencial

### 2.1 Formato de Orden de Producción

| Formato | Filas |
|---|---:|
| `26OP######` correcto | 332,412 |
| Vacío | 1,535 |
| Sin relleno de ceros (`24OP5820`, `24OP13263`, `24OP10892`…) | ~63,000 |

**Causa:** la cadena de `if/else` en `Codigo.gs` que aplica el padding tiene un `else` final que **no rellena nada** cuando la longitud es ≥ 6. Existen OPs de 5 dígitos en el histórico.

**Nota de migración:** `24OP13263` debe normalizarse a `24OP013263`.

### 2.2 Anti-patrón de OP concatenadas en el Excel

El campo `O.P.` de la hoja `COSTOS` almacena múltiples órdenes en una sola celda:

```
26OP4472-4802-4917-5004-5105
26OP3892-3894-4074-4143-4374-4409-...-5381   ← 81 OPs en una celda
```

Además de ser multivaluado, **el prefijo `26OP` solo aparece en la primera** y ninguna lleva relleno de ceros. Es incompatible con el formato de las Formas 1 y 2. **Hoy no existe forma de unir la Forma 3 con las otras dos.**

**Contramedida:** tabla puente `costeo.of_op`.

### 2.3 El campo CLIENTE mezcla dos dimensiones

En `Datos` el campo `CLIENTE` contiene valores como `BSN Soccer`, `BSN Jersey`, `BSN Basketball`, `BSN Volleyball`, `BSN Compression`, `BSN Baseball`. En el Excel de Costos, el mismo cliente aparece solo como `BSN SPORTS`.

Son **Cliente + Línea de Producto** colapsados en un solo campo de texto libre. Separarlos es requisito para unir las tres formas.

### 2.4 Variantes tipográficas por texto libre

**Clientes** — variantes detectadas del mismo cliente:

```
BSN JERSEY · BSN  JERSEY · BSN JERSY · BSN JERSYE · BSN JERSET
BSN JESERY · BSN JESEY · BSN JESREY · BSN JEREY · BSN JERSEEY
BSN ERSEY · BSM JERSEY · BSN COMPRESSION · BSN COMPRESSIOM
BNS COMPRESSION · BSM SOCCER · BAN SOCCER · BSN BSN Volleyball
```

En `TablaConsumos`: `INVERSIONES CASTA` vs `INVERSIONES CASTA, S.A.`; `DAGUSI IMPORT` vs `DAGUSI IMPORT S.A. DE C.V. (CHARLY MX)`; `TEAMTECH` vs `TEAMTECH APPAREL, LLC`.

**Impresoras** — 20 valores distintos para ~12 equipos físicos:

```
MK'S / MK's        (mismo equipo, apóstrofo distinto)
RG NEXT / Rg Next  (mismo equipo)
RG ONE / Rg One    (mismo equipo)
Asignar            ← valor basura
CANCELADA          ← valor basura
```

**Contramedida:** catálogos con FK. Cero texto libre en dimensiones.

---

## 3. 🟡 Problemas de modelado

### 3.1 `CONCAT` genera una talla fantasma

La `TablaConsumos` usa `CONCAT = CÓDIGO || TALLA` sin delimitador. Se encontró **1 colisión**:

```
BSN-SGS7M + "CONSUMO EN BLANCO"  →  'BSN-SGS7MCONSUMO EN BLANCO'
```

El proceso de despivoteo trató la columna de control `CONSUMO EN BLANCO` como si fuera una talla y generó una entrada de consumo estándar inválida. Con 3,687 filas y 158 tallas la probabilidad de colisión real es baja hoy, pero el patrón es estructuralmente frágil.

**Contramedida:** llave compuesta `(producto_id, talla_id)`.

### 3.2 Columna derivada almacenada

En `Consumos`, la relación entre `PP` (pulgadas) y `YDS` (yardas) es exacta:

| PP | YDS | PP/36 |
|---:|---:|---:|
| 25.25 | 0.70 | 0.7014 |
| 31.75 | 0.88 | 0.8819 |
| 35.75 | 0.99 | 0.9931 |

`YDS = PP / 36`, redondeado a 2 decimales. Guardar ambas invita a divergencia.

**Contramedida:** columna `GENERATED ALWAYS AS (pulgadas_papel / 36.0) STORED`.

### 3.3 Constante de enguiamiento hardcodeada

`DatosOrigen` tiene una columna `ENGUIAMIENTO` con valor por línea (ej. `0.2`), pero `Codigo.gs` **no la incluye en `columnasNecesarias`** y en su lugar usa la constante literal:

```javascript
valor * 0.084375,   // K - Yardas
```

Verificado en los datos de destino: para `cantidad=1` el valor es `0.084375`; para `cantidad=6`, `0.50625`. Es la constante multiplicada, no el valor de la hoja.

Consecuencia: nadie puede ajustar el enguiamiento por trabajo, y el valor capturado en el origen se descarta silenciosamente.

**Contramedida:** `costeo.linea_produccion.enguiamiento_yd` con default configurable, nunca constante en código.

### 3.4 Ausencia de versionado del estándar de consumo

`TablaConsumos` contiene 13 hojas nombradas por fecha (`011024`, `021024`, `070125`, `210225`, `240325`, `070525`, `230625`, `270825`, `120925`, `121125`, `281125`, `041225`, `200726`).

**Corrección respecto al análisis inicial:** estas hojas son una **bitácora de solicitudes de cambio**, no versiones del estándar. Los datos vigentes ya están consolidados en la hoja `Consumos`. **No deben migrarse.**

Lo que sí queda documentado como hecho: el estándar de consumo **cambia en el tiempo** —de ahí que existan 13 solicitudes de ajuste en menos de dos años— pero el sistema actual **sobrescribe el valor anterior sin conservarlo**. Por lo tanto:

- No es posible reconstruir con qué estándar se calculó un consumo pasado.
- Recostear un mes cerrado con la tabla actual produce números distintos a los reportados en su momento.

**Contramedida:** `costeo.consumo_estandar` con `daterange` y `EXCLUDE USING gist`. La migración carga `Consumos` como **una única versión inicial** con `vigente_desde` = fecha de corte. El versionado empieza a acumular historia desde el arranque del módulo hacia adelante.

> Esto es consistente con el patrón de snapshots históricos de costo que ya usas en el módulo Hoja Técnica.

### 3.5 Layout horizontal del Excel de Costos

La hoja `COSTOS` tiene **482 columnas** organizadas en **154 tripletas**:

```
[nombre_insumo] [cantidad] [costo_unitario]
```

Con una particularidad heredada: **el total calculado de cada insumo cae en la columna que contiene el nombre del siguiente insumo**. Verificado:

```
col 17 = 'PAPEL15'   (header)      → valor: 0
col 18 = 'YARDAS19'                → valor: 67.43     (cantidad)
col 19 = 'COSTO20'                 → valor: 4.642     (costo unitario)
col 20 = '(173014) TEXTPRINT...'   → valor: 313.01    (67.43 × 4.642 = total)
```

Los encabezados están desfasados una columna respecto a los valores. Cualquier script que lea este archivo asumiendo alineación producirá datos incorrectos.

**Contramedida:** `costeo.of_insumo`, una fila por insumo asignado.

### 3.6 Pérdida de información en Forma 2

`DatosOrigen` tiene 237 columnas, pero `copiarDatos()` solo transfiere ~190 de talla más 7 de metadatos. **Se descartan 8 campos con valor de negocio:**

| Campo perdido | Ejemplo | Valor |
|---|---|---|
| `Orden de compra` | `7012602039` | Trazabilidad al PO del cliente |
| `Desarrollo` | `2898BS/23` | Referencia de diseño |
| `Descripción` | `SOCCER_MEN_SHORT 7" INSEAM` | Descripción del producto |
| `Recibido` | `4-Aug` | Fecha de recepción |
| `Fecha Cliente` | `19-Aug` | Compromiso con el cliente |
| `Entregar Exportar` | `19-Aug` | Fecha de exportación |
| `Estatus` | `Abierto` | Estado de la línea |
| `IMAGEN` | — | Referencia visual |

Nótese que `LINE` = `OrdenCompra-Secuencia` (`7012602039-1`). La orden de compra ya está implícita pero se pierde como campo consultable.

### 3.7 Destrucción del origen

`copiarDatos()` termina con:

```javascript
[...new Set(filasParaBorrar)].sort((a, b) => b - a).forEach(f => hojaOrigen.deleteRow(f));
```

Las filas procesadas **se eliminan físicamente**. No hay forma de auditar qué se envió ni de reprocesar ante un error.

**Contramedida:** marcar `procesada_en`, nunca borrar.

---

## 4. 🟡 Calidad de datos

### 4.1 Fechas fuera de rango

| Anomalía | Valor |
|---|---|
| Fecha mínima | `2002-06-24 14:37` — anterior a la operación del sistema |
| Fecha máxima | `2026-08-30 05:08` — posterior a la fecha de extracción (2026-08-07) |

Ambas deben cuarentenarse en la migración.

### 4.2 Formato del NRollo

Estructura esperada: `<factura>-<total_rollos>-<num_rollo>` → `958745125-45-23`

| Segmentos | Filas | Estado |
|---:|---:|---|
| 3 | 58,346 | Correcto |
| 1 | 498 | Incompleto |
| 2 | 21 | Incompleto |

### 4.3 Empleados sin código

De 116 empleados en el catálogo, varios carecen de código `T####`:

```
[None] JORGE LUIS TORRES GOMEZ  | Encargado de Transferencia | TRANSFERENCIA
[None] GARY FRANCO              | Encargado de Transferencia | TRANSFERENCIA
```

Además hay espacios en blanco al final de nombres (`'GARY FRANCO '`).

### 4.4 Rendimiento del algoritmo de búsqueda

`buscarNRollo()` en `Codigo.gs`:

- Escanea hasta **20,000 filas** hacia atrás
- En lotes de 100 → hasta **200 llamadas** a `getRange().getValues()`
- Compara 4 criterios por fila: fecha, impresora, tipo de papel, repo vacío
- Se ejecuta **en cada cambio** de fecha, impresora o tipo de papel en el formulario

Sobre una hoja de 397k filas, esto es un scan lineal repetido interactivamente. En PostgreSQL con el modelo propuesto es un index scan GiST sobre `tstzrange`.

### 4.5 Control de duplicados en memoria

`copiarDatos()` construye un `Set` con las claves de las **últimas 5,000 filas** del destino para detectar duplicados:

```javascript
const maxFilasRevisar = Math.min(ultimaFilaDestino - 1, 5000);
```

Cualquier duplicado más antiguo que esas 5,000 filas pasa sin detectarse. Sobre 397k filas, la ventana cubre el 1.26% del histórico.

**Contramedida:** `CREATE UNIQUE INDEX ... WHERE anulado_en IS NULL`.

### 4.6 Variables globales evaluadas en cada ejecución

En `Codigo.gs` de la Forma 2:

```javascript
var tablaConsumo = hojaConsumo
  .getRange(2, 1, hojaConsumo.getLastRow(), hojaConsumo.getLastColumn())
  .getValues();
```

Las 3,687 filas del catálogo de consumos se leen completas en **cada invocación de cualquier función** del script, incluido `onOpen()` y `mostrarBarra()`.

---

## 5. Resumen de contramedidas

| # | Hallazgo | Contramedida en el diseño |
|---|---|---|
| 1 | 5,248 registros `"Buscando..."` | Resolución server-side vía `fn_rollo_en()` |
| 2 | Columna `FUNCION` de prueba | Descartar; NRollo se lee de la columna 15 |
| 3 | OPs sin padding | Columna `GENERATED` + `CHECK` |
| 4 | OPs concatenadas | Tabla puente `of_op` |
| 5 | Cliente/línea colapsados | `cliente_id` + `linea_producto_id` |
| 6 | Variantes tipográficas | Catálogos con FK |
| 7 | `CONCAT` como llave | Llave compuesta `(producto_id, talla_id)` contra `recetas` |
| 8 | `YDS` y `PP` redundantes | Columna generada |
| 9 | Enguiamiento hardcodeado | Campo configurable por línea |
| 10 | Estándar sin versionado (se sobrescribe) | SCD2 con `EXCLUDE USING gist` |
| 11 | 482 columnas horizontales | `of_insumo`, una fila por insumo |
| 12 | 8 campos descartados | Modelados en `linea_produccion` |
| 13 | Borrado del origen | `procesada_en`, sin borrado físico |
| 14 | Scan lineal de 20k filas | Índice GiST sobre `tstzrange` |
| 15 | Dedup en ventana de 5k | Índice único parcial |
| 16 | Fechas fuera de rango | Cuarentena en migración |
