# PROMPT PARA CLAUDE CODE — Módulo `Costeo Real` (ERP Digitexsa)

> **Cómo usar este documento:** Colócalo en la raíz del repo del ERP junto con `ANEXO_A_Hallazgos.md` y `ANEXO_B_Catalogos.md`. Inicia la sesión de Claude Code pidiéndole que lea los tres antes de escribir una sola línea de código.

---

## 0. ROL Y OBJETIVO

Actúa como arquitecto de software senior especializado en sistemas ERP de manufactura. Vas a diseñar e implementar el módulo **`Costeo Real`** dentro del ERP existente de Digital Textil, S.A. (Digitexsa), fabricante de uniformes deportivos por sublimación en Guatemala.

**El módulo consolida tres sistemas legacy independientes en uno solo:**

| # | Sistema actual | Tecnología | Qué captura | Volumen histórico |
|---|---|---|---|---|
| 1 | Formulario Reposiciones | Google Apps Script WebApp | Reposiciones por defectos de producción | 57,891 registros |
| 2 | Panel Estaciones | GAS embebido en Google Sheets | Consumo de papel por OP/talla | 333,156 registros |
| 3 | `Costos <Mes><Año>.xlsx` | Excel manual, 482 columnas | Insumos varios asignados a Órdenes de Facturación | ~170 filas/mes |

**Resultado esperado:** un módulo web responsivo, con PostgreSQL normalizado, que elimina las tres herramientas y habilita costeo real por Orden de Producción.

---

## 1. CONTEXTO DE NEGOCIO

### 1.1 Flujo operativo

```
Cliente emite Orden de Compra (PO)
   └─> se crea Orden de Producción (OP)   → código: 26OP004472
         ├─> DISEÑO: se arma la LINE (PO-secuencia, ej. 7012602039-1)
         ├─> IMPRESIÓN: papel sublimación en impresoras MS JP4 / Reggiani
         │     └─> consumo de papel por producto y talla  ......... FORMA 2
         ├─> TRANSFERENCIA (calandras MONTI): papel → tela
         ├─> CORTE / BORDADO / CONFECCIÓN / CALIDAD / EMPAQUE
         │     └─> si hay defecto → REPOSICIÓN (reimprimir/rehacer)  FORMA 1
         └─> FACTURACIÓN
               └─> Orden de Facturación (OF) → código: 26OF000116
                     ├─> agrupa N Órdenes de Producción
                     └─> se le asignan insumos varios (tinta, hilo,
                         elásticos, entretelas, bolsas, etc.) ...... FORMA 3
```

### 1.2 Reglas de negocio confirmadas

- **Código de OP:** `AAOPNNNNNN` — dos dígitos de año + literal `OP` + correlativo de 6 dígitos con relleno de ceros. Ej. `26OP004472`. **Es el formato canónico obligatorio.**
- **Código de OF:** `AAOFNNNNNN`. Ej. `26OF000116`.
- **Relación OF ↔ OP: muchos a muchos.** Una OF factura varias OPs. En el Excel actual esto se representa como texto concatenado con guiones (`26OP4472-4802-4917-5004-5105`), lo cual es un anti-patrón que debe eliminarse con una tabla puente.
- **Código de rollo de papel:** `<numero_factura>-<total_rollos>-<numero_rollo>`. Ej. `958745125-45-23` = rollo 23 de los 45 que vinieron en la factura 958745125.
- **Reposición:** correlativo por OP con formato `R01`, `R02`… Una OP puede tener múltiples reposiciones.
- **Consumo estándar de papel:** definido por combinación `producto + talla`, expresado en **pulgadas de papel (PP)**. Las yardas son derivadas: `YDS = PP / 36`.
- **Enguiamiento:** papel adicional usado para guiar el material en la impresora, registrado por línea de producción.
- **Consumo en blanco:** modo especial de impresión; consume un factor sobre la cantidad.
- Todos los consumos de papel se expresan en **yardas lineales**.

### 1.3 Tipos de servicio facturables

`PAQUETE COMPLETO` · `SERVICIO DE SUBLIMACION` · `SERVICIO DE CONFECCION` · `GASTOS A CUENTA DEL CLIENTE` · `ERROR EN ARCHIVOS`

---

## 2. STACK Y ENTORNO

| Componente | Tecnología |
|---|---|
| Runtime | Node.js |
| Base de datos | PostgreSQL (instancia del ERP) |
| Proceso | PM2 (`erpapp`) |
| Reverse proxy | Nginx |
| Servidor | Ubuntu — `192.168.2.13`, usuario `erpadmin` |
| Deploy | Git push-to-deploy (GitHub → PC local → servidor) |
| BI actual | Google Looker Studio (Data Studio) — en migración a dashboards propios |
| Herramientas | DBeaver, MobaXterm |

**Obligatorio:** antes de generar código, lee `CLAUDE.md` y `CONVENCIONES.md` del repo y respeta las convenciones ahí definidas (estructura de carpetas, naming, manejo de errores, estilo de queries, patrón de rutas). Si este prompt contradice `CONVENCIONES.md`, **gana `CONVENCIONES.md`** y me lo señalas.

---

## 3. ⚠️ SUPUESTOS A VALIDAR ANTES DE CODIFICAR

Estos supuestos se hicieron sin acceso al esquema actual. **Tu primera tarea es verificarlos contra la base de datos real y reportarme las discrepancias antes de escribir código de producción.**

| # | Supuesto | Cómo verificarlo |
|---|---|---|
| S1 | Existe tabla maestra de **clientes** reutilizable | `\dt *.*` + inspeccionar |
| S2 | **No** existe tabla de Órdenes de Facturación (hay que crearla) | Confirmado por el usuario |
| S3 | Existe esquema de **autenticación y roles**, pero requiere granularidad por módulo/acción | Inspeccionar tablas de auth |
| S4 | **No** existe maestro de insumos con costo vigente; hay que crearlo desde el Anexo B | Buscar tablas tipo `insumos`, `inventario`, `articulos` |
| S5 | El schema `recetas` (Hoja Técnica) contiene el **costo estándar** y puede referenciarse para comparar estándar vs. real | Inspeccionar schema `recetas` |
| S5b | **El maestro de productos vive en `recetas`** y `costeo` lo consume por FK. *(Confirmado por el usuario — no es supuesto, es requisito)* | Identificar tabla, PK y campos disponibles |
| S5c | Los 475 códigos de producto del legacy existen en `recetas` | Cruzar y reportar faltantes |
| S6 | `MOD`, `GF` y `FIJOS` se calculan **fuera del sistema** y se capturan como valores dados por OF | Pendiente de confirmar con el usuario |
| S7 | Existe maestro de **empleados** (RRHH / biométrico ZKTeco o Hikvision) reutilizable | Buscar tablas de personal |

**Protocolo:** genera un reporte `docs/00-VALIDACION-SUPUESTOS.md` con el resultado de cada verificación y espera mi confirmación antes de la Fase 1.

---

## 4. PRINCIPIOS DE DISEÑO NO NEGOCIABLES

1. **Tercera forma normal como piso.** Cero columnas repetidas, cero concatenaciones como llave, cero campos multivaluados. Toda la desnormalización vive en vistas, nunca en tablas base.
2. **Los datos malos deben ser imposibles, no solo improbables.** Usa constraints (`CHECK`, `EXCLUDE`, `FOREIGN KEY`, `UNIQUE`) en lugar de validación exclusivamente en la aplicación. Ver §5.4 y `ANEXO_A` para los bugs históricos que esto previene.
3. **Nada de texto libre donde debe haber catálogo.** Clientes, impresoras, papeles, defectos, tallas, departamentos → todos con tabla y FK.
4. **Todo dato con historia debe versionarse.** El costo de insumos y el consumo estándar cambian en el tiempo. Un mes cerrado debe poder recostearse y dar exactamente el mismo número. Usa SCD Tipo 2 con rangos de vigencia y constraint anti-solape.
5. **Escritura idempotente.** Toda operación de captura debe tolerar reintentos sin duplicar. Usa claves naturales + `ON CONFLICT`.
6. **Auditoría universal.** Toda tabla transaccional lleva `creado_en`, `creado_por`, `actualizado_en`, `actualizado_por`. Nada se borra físicamente: `anulado_en`, `anulado_por`, `motivo_anulacion`.
7. **Mobile-first.** La captura ocurre en planta desde celular, tablet y PC. Hay WiFi en toda la planta, por lo que **no se requiere modo offline**, pero la UI debe ser táctil, con objetivos de toque grandes y latencia percibida mínima.
8. **Google Sheets es solo lectura.** La sincronización es unidireccional (PostgreSQL → Sheets). Los usuarios no editan nada en Sheets. Es un espejo temporal mientras se migra Looker Studio a dashboards propios.
9. **No inventes datos.** Si un campo del legacy es ambiguo, márcalo con `TODO:` y pregúntame. Prefiero un `NULL` honesto a un valor fabricado.

---

## 5. MODELO DE DATOS

Schema propuesto: **`costeo`**. Ajusta si `CONVENCIONES.md` dicta otra cosa.

### 5.1 Catálogos maestros

Los valores semilla están en `ANEXO_B_Catalogos.md`.

```sql
CREATE SCHEMA IF NOT EXISTS costeo;

-- ── Unidades y categorías ────────────────────────────────────────────
CREATE TABLE costeo.unidad_medida (
    id          smallserial PRIMARY KEY,
    codigo      text NOT NULL UNIQUE,          -- YARDA, UNIDAD, MILILITRO, LIBRA
    nombre      text NOT NULL,
    abreviatura text NOT NULL
);

CREATE TABLE costeo.categoria_insumo (
    id      smallserial PRIMARY KEY,
    codigo  text NOT NULL UNIQUE,              -- TELA, PAPEL, TINTA, HILO, ELASTICO...
    nombre  text NOT NULL,
    orden   smallint NOT NULL DEFAULT 0
);

-- ── Cliente y línea de producto ──────────────────────────────────────
-- ⚠️ S1: si ya existe maestro de clientes, NO crear esta tabla; usar FK a la existente.
CREATE TABLE costeo.linea_producto (
    id          serial PRIMARY KEY,
    cliente_id  integer NOT NULL REFERENCES <maestro_clientes>(id),
    nombre      text NOT NULL,                 -- Soccer, Jersey, Basketball, Volleyball...
    activo      boolean NOT NULL DEFAULT true,
    UNIQUE (cliente_id, nombre)
);
```

> **Nota crítica:** en los datos legacy el campo `CLIENTE` mezcla dos dimensiones. `BSN Soccer`, `BSN Jersey` y `BSN Basketball` son la **línea de producto** del cliente `BSN SPORTS`. El Excel de Costos usa solo `BSN SPORTS`. Separarlos es lo que permite unir Forma 3 con Formas 1 y 2. Ver `ANEXO_A §2.3`.

```sql
-- ── Equipos ──────────────────────────────────────────────────────────
CREATE TABLE costeo.impresora (
    id              serial PRIMARY KEY,
    codigo          text NOT NULL UNIQUE,      -- 'MS 1' ... 'MP 8', 'RG NEXT'
    descripcion     text,
    marca_modelo    text,                      -- MS JP4, Reggiani...
    ancho_pulgadas  numeric(6,2),
    tipo_papel_default_id integer REFERENCES costeo.tipo_papel(id),
    activo          boolean NOT NULL DEFAULT true
);

CREATE TABLE costeo.calandra (
    id      serial PRIMARY KEY,
    codigo  text NOT NULL UNIQUE,              -- 'MONTI #1' ... 'MONTI #6'
    activo  boolean NOT NULL DEFAULT true
);

CREATE TABLE costeo.tipo_papel (
    id              serial PRIMARY KEY,
    codigo          text NOT NULL UNIQUE,
    nombre          text NOT NULL,
    gramaje         numeric(6,2),
    ancho_pulgadas  numeric(6,2),
    activo          boolean NOT NULL DEFAULT true
);

-- ── Organización y calidad ───────────────────────────────────────────
CREATE TABLE costeo.departamento (
    id      serial PRIMARY KEY,
    codigo  text NOT NULL UNIQUE,
    nombre  text NOT NULL,
    activo  boolean NOT NULL DEFAULT true
);

CREATE TABLE costeo.defecto (
    id            serial PRIMARY KEY,
    codigo        text NOT NULL UNIQUE,
    nombre        text NOT NULL,
    categoria     text,      -- MATERIAL | PROCESO | EQUIPO | HUMANO | EXTERNO
    imputable_a   text,      -- INTERNO | CLIENTE | PROVEEDOR
    activo        boolean NOT NULL DEFAULT true
);
```

> Los 40 defectos activos están en `ANEXO_B`. Clasifícalos en `categoria` e `imputable_a` — hoy no existe esa clasificación y es justamente lo que habilita analítica de causa raíz. Propón tu clasificación y márcala para mi revisión.

```sql
-- ── Producto y talla ─────────────────────────────────────────────────
CREATE TABLE costeo.talla (
    id      serial PRIMARY KEY,
    codigo  text NOT NULL UNIQUE,              -- 158 valores, ver ANEXO_B
    grupo   text,                              -- YOUTH | ADULT | WOMEN | MEN | PANT | NUMERICA
    orden   smallint NOT NULL DEFAULT 0,       -- para ordenar XS<S<M<L<XL en reportes
    activo  boolean NOT NULL DEFAULT true
);

-- ⚠️ NO CREAR tabla de productos.
-- Los productos ya existen en el módulo Hoja Técnica (schema `recetas`).
-- Identifica la tabla real e intégrala por FK. Placeholder usado en este documento:
--     <recetas.producto>(id, codigo, descripcion, cliente_id, ...)
--
-- Si `recetas` no tiene el campo `linea_producto_id`, agrégalo ahí (no dupliques
-- el maestro en `costeo`). Documenta el cambio como migración del módulo recetas.
```

> **Requisito del usuario (confirmado):** el catálogo de productos es único y vive en `recetas`. `costeo` lo consume, nunca lo replica. Esto es además lo que habilita la comparación estándar (Hoja Técnica) vs. real (Costeo Real) sin reconciliar dos maestros.
>
> **Tarea de validación:** los 475 códigos de producto presentes en `TablaConsumos` deben existir en `recetas`. Genera `docs/01-COBERTURA-PRODUCTOS.md` con los códigos que **no** encuentres, para decidir si se dan de alta o se marcan obsoletos. No crees productos automáticamente.

### 5.2 Consumo estándar versionado (SCD Tipo 2)

Reemplaza la `TablaConsumos` y su campo `CONCAT` (`CODIGO || TALLA`). El producto se referencia contra el maestro de `recetas`, no contra una copia local.

```sql
CREATE TABLE costeo.consumo_estandar (
    id              bigserial PRIMARY KEY,
    producto_id     integer NOT NULL REFERENCES <recetas.producto>(id),
    talla_id        integer NOT NULL REFERENCES costeo.talla(id),
    pulgadas_papel  numeric(10,4) NOT NULL CHECK (pulgadas_papel > 0),
    yardas          numeric(10,4) GENERATED ALWAYS AS (pulgadas_papel / 36.0) STORED,
    vigente_desde   date NOT NULL,
    vigente_hasta   date,                      -- NULL = versión vigente
    vigencia        daterange GENERATED ALWAYS AS
                      (daterange(vigente_desde, vigente_hasta, '[)')) STORED,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    creado_por      integer NOT NULL REFERENCES <tabla_usuarios>(id),

    CONSTRAINT ck_consumo_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde),
    EXCLUDE USING gist (
        producto_id  WITH =,
        talla_id     WITH =,
        vigencia     WITH &&
    )
);
CREATE INDEX ix_consumo_estandar_lookup
    ON costeo.consumo_estandar (producto_id, talla_id, vigente_desde DESC);
```

**Por qué así:** el estándar de consumo cambia en el tiempo —el archivo legacy muestra 13 solicitudes de ajuste en menos de dos años— pero el sistema actual **sobrescribe el valor anterior sin conservarlo**. Sin versionado, recostear un mes cerrado produce números distintos a los reportados originalmente.

El `EXCLUDE USING gist` hace imposible tener dos estándares vigentes para el mismo producto+talla en la misma fecha. `yardas` es columna generada porque en el legacy `YDS` y `PP` se guardaban por separado y podían divergir.

**Carga inicial:** la hoja `Consumos` se migra como **una única versión** con `vigente_desde` = fecha de corte del arranque. Las 13 hojas fechadas del archivo legacy son una bitácora de solicitudes, **no versiones**: sus datos ya están consolidados en `Consumos` y no se migran.

### 5.3 Órdenes

```sql
CREATE TABLE costeo.orden_produccion (
    id                 bigserial PRIMARY KEY,
    anio               smallint NOT NULL CHECK (anio BETWEEN 0 AND 99),
    correlativo        integer  NOT NULL CHECK (correlativo BETWEEN 1 AND 999999),
    codigo             text GENERATED ALWAYS AS
                         (lpad(anio::text, 2, '0') || 'OP' || lpad(correlativo::text, 6, '0')) STORED,
    cliente_id         integer REFERENCES <maestro_clientes>(id),
    linea_producto_id  integer REFERENCES costeo.linea_producto(id),
    orden_compra       text,                   -- PO del cliente: '7012602039'
    desarrollo         text,                   -- '2898BS/23'
    fecha_recibido     date,
    fecha_compromiso   date,
    estatus            text NOT NULL DEFAULT 'ABIERTO',
    creado_en          timestamptz NOT NULL DEFAULT now(),
    creado_por         integer NOT NULL REFERENCES <tabla_usuarios>(id),
    UNIQUE (anio, correlativo)
);
CREATE INDEX ix_op_codigo ON costeo.orden_produccion (codigo);
CREATE INDEX ix_op_orden_compra ON costeo.orden_produccion (orden_compra);

CREATE TABLE costeo.tipo_servicio (
    id      smallserial PRIMARY KEY,
    codigo  text NOT NULL UNIQUE,
    nombre  text NOT NULL
);

CREATE TABLE costeo.orden_facturacion (
    id                 bigserial PRIMARY KEY,
    anio               smallint NOT NULL,
    correlativo        integer  NOT NULL,
    codigo             text GENERATED ALWAYS AS
                         (lpad(anio::text, 2, '0') || 'OF' || lpad(correlativo::text, 6, '0')) STORED,
    fecha              date NOT NULL,
    numero_factura     text,                   -- 'E-1540'
    cliente_id         integer NOT NULL REFERENCES <maestro_clientes>(id),
    tipo_servicio_id   smallint NOT NULL REFERENCES costeo.tipo_servicio(id),
    cantidad_facturada integer,
    venta_total        numeric(14,4),
    -- ⚠️ S6: capturados, no calculados, hasta confirmar criterio de prorrateo
    mod_valor          numeric(14,4),          -- Mano de Obra Directa
    gf_valor           numeric(14,4),          -- Gastos de Fabricación
    fijos_valor        numeric(14,4),
    cerrada_en         timestamptz,            -- una OF cerrada no admite cambios
    creado_en          timestamptz NOT NULL DEFAULT now(),
    creado_por         integer NOT NULL REFERENCES <tabla_usuarios>(id),
    UNIQUE (anio, correlativo)
);

-- Elimina el anti-patrón '26OP4472-4802-4917-5004-5105'
CREATE TABLE costeo.of_op (
    orden_facturacion_id bigint NOT NULL REFERENCES costeo.orden_facturacion(id) ON DELETE CASCADE,
    orden_produccion_id  bigint NOT NULL REFERENCES costeo.orden_produccion(id),
    PRIMARY KEY (orden_facturacion_id, orden_produccion_id)
);
CREATE INDEX ix_of_op_inverso ON costeo.of_op (orden_produccion_id);
```

### 5.4 Rollos de papel — el corazón del rediseño

Esto reemplaza el algoritmo de búsqueda de `NRollo` que hoy escanea 20,000 filas hacia atrás y que produjo **5,248 registros corruptos con el texto literal `"Buscando..."`** (ver `ANEXO_A §1`).

```sql
CREATE TABLE costeo.factura_papel (
    id              bigserial PRIMARY KEY,
    numero_factura  text NOT NULL UNIQUE,      -- '958745125'
    proveedor_id    integer REFERENCES <maestro_proveedores>(id),
    fecha           date NOT NULL,
    total_rollos    integer NOT NULL CHECK (total_rollos > 0),
    creado_en       timestamptz NOT NULL DEFAULT now(),
    creado_por      integer NOT NULL REFERENCES <tabla_usuarios>(id)
);

CREATE TABLE costeo.rollo_papel (
    id                bigserial PRIMARY KEY,
    factura_papel_id  bigint NOT NULL REFERENCES costeo.factura_papel(id),
    secuencia         integer NOT NULL CHECK (secuencia > 0),
    tipo_papel_id     integer NOT NULL REFERENCES costeo.tipo_papel(id),
    yardas_iniciales  numeric(12,4),
    costo_unitario    numeric(12,6),           -- costo por yarda al ingreso
    estado            text NOT NULL DEFAULT 'EN_BODEGA'
                        CHECK (estado IN ('EN_BODEGA','MONTADO','AGOTADO','DESCARTADO')),
    creado_en         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (factura_papel_id, secuencia)
);

-- Vista para reconstruir el código legacy '958745125-45-23'
CREATE VIEW costeo.v_rollo_codigo AS
SELECT r.id,
       f.numero_factura || '-' || f.total_rollos || '-' || r.secuencia AS codigo_completo,
       f.numero_factura, f.total_rollos, r.secuencia, r.tipo_papel_id, r.estado
FROM costeo.rollo_papel r
JOIN costeo.factura_papel f ON f.id = r.factura_papel_id;

-- ★ TABLA CLAVE: el montaje físico del rollo en la impresora
CREATE TABLE costeo.montaje_rollo (
    id              bigserial PRIMARY KEY,
    rollo_papel_id  bigint NOT NULL REFERENCES costeo.rollo_papel(id),
    impresora_id    integer NOT NULL REFERENCES costeo.impresora(id),
    montado_en      timestamptz NOT NULL,
    desmontado_en   timestamptz,               -- NULL = actualmente montado
    yardas_finales  numeric(12,4),             -- lectura al desmontar
    vigencia        tstzrange GENERATED ALWAYS AS
                      (tstzrange(montado_en, desmontado_en, '[)')) STORED,
    creado_por      integer NOT NULL REFERENCES <tabla_usuarios>(id),
    creado_en       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_montaje_rango CHECK (desmontado_en IS NULL OR desmontado_en > montado_en),
    -- Una impresora NO puede tener dos rollos montados a la vez. Garantizado por el motor.
    EXCLUDE USING gist (impresora_id WITH =, vigencia WITH &&)
);
CREATE INDEX ix_montaje_vigencia ON costeo.montaje_rollo USING gist (impresora_id, vigencia);
```

**Resolución del rollo en O(log n):**

```sql
CREATE OR REPLACE FUNCTION costeo.fn_rollo_en(
    p_impresora_id integer,
    p_momento      timestamptz
) RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT m.id
    FROM costeo.montaje_rollo m
    WHERE m.impresora_id = p_impresora_id
      AND m.vigencia @> p_momento
    LIMIT 1;
$$;
```

**Ganancias sobre el modelo actual:**

| Hoy | Con este modelo |
|---|---|
| Scan lineal de hasta 20,000 filas | Index scan GiST |
| Inferencia por fecha+impresora+papel | Hecho físico registrado |
| 5,248 filas con `"Buscando..."` | Estado imposible por constraint |
| Tipo de papel se teclea | Se deriva del rollo montado |
| Merma invisible | `yardas_iniciales − Σ consumos = merma real` |
| Sin trazabilidad a proveedor | consumo → rollo → factura → proveedor |
| Operador teclea el código en cada transacción | Solo dos eventos por rollo: montar / desmontar |

### 5.5 Hechos: consumo de papel y reposiciones

```sql
-- Staging de producción (equivale a DatosOrigen, 237 columnas → normalizado)
CREATE TABLE costeo.linea_produccion (
    id                    bigserial PRIMARY KEY,
    codigo_line           text NOT NULL,        -- '7012602039-1' = PO-secuencia
    orden_produccion_id   bigint NOT NULL REFERENCES costeo.orden_produccion(id),
    producto_id           integer NOT NULL REFERENCES <recetas.producto>(id),
    impresora_id          integer REFERENCES costeo.impresora(id),
    tipo_papel_id         integer REFERENCES costeo.tipo_papel(id),
    enguiamiento_yd       numeric(10,4) NOT NULL DEFAULT 0,
    consumo_en_blanco     boolean NOT NULL DEFAULT false,
    factor_en_blanco      numeric(6,4) NOT NULL DEFAULT 0.6,
    fecha_data            date,
    fecha_recibido        date,
    fecha_cliente         date,
    fecha_entregar        date,
    estatus               text NOT NULL DEFAULT 'ABIERTO',
    procesada_en          timestamptz,          -- cuándo se envió a consumo_papel
    creado_en             timestamptz NOT NULL DEFAULT now(),
    creado_por            integer NOT NULL REFERENCES <tabla_usuarios>(id),
    UNIQUE (codigo_line)
);

CREATE TABLE costeo.linea_produccion_talla (
    id                    bigserial PRIMARY KEY,
    linea_produccion_id   bigint NOT NULL REFERENCES costeo.linea_produccion(id) ON DELETE CASCADE,
    talla_id              integer NOT NULL REFERENCES costeo.talla(id),
    cantidad              integer NOT NULL CHECK (cantidad > 0),
    UNIQUE (linea_produccion_id, talla_id)
);

-- ★ TABLA DE HECHOS UNIFICADA (reemplaza ConsumosFinal!Datos, 397k filas)
CREATE TABLE costeo.consumo_papel (
    id                    bigserial PRIMARY KEY,
    fecha                 timestamptz NOT NULL,
    origen                text NOT NULL CHECK (origen IN ('PRODUCCION','REPOSICION')),

    orden_produccion_id   bigint  NOT NULL REFERENCES costeo.orden_produccion(id),
    linea_produccion_id   bigint  REFERENCES costeo.linea_produccion(id),
    reposicion_id         bigint  REFERENCES costeo.reposicion(id),
    producto_id           integer REFERENCES <recetas.producto>(id),
    talla_id              integer REFERENCES costeo.talla(id),

    impresora_id          integer NOT NULL REFERENCES costeo.impresora(id),
    montaje_rollo_id      bigint  REFERENCES costeo.montaje_rollo(id),
    tipo_papel_id         integer NOT NULL REFERENCES costeo.tipo_papel(id),

    cantidad              integer,
    consumo_estandar_id   bigint REFERENCES costeo.consumo_estandar(id),  -- versión aplicada
    enguiamiento_yd       numeric(12,4) NOT NULL DEFAULT 0,
    en_blanco_yd          numeric(12,4) NOT NULL DEFAULT 0,
    consumo_yd            numeric(12,4) NOT NULL CHECK (consumo_yd >= 0),

    observacion           text,
    creado_en             timestamptz NOT NULL DEFAULT now(),
    creado_por            integer NOT NULL REFERENCES <tabla_usuarios>(id),
    anulado_en            timestamptz,
    anulado_por           integer REFERENCES <tabla_usuarios>(id),
    motivo_anulacion      text,

    CONSTRAINT ck_consumo_origen CHECK (
        (origen = 'PRODUCCION' AND linea_produccion_id IS NOT NULL AND reposicion_id IS NULL)
     OR (origen = 'REPOSICION'  AND reposicion_id IS NOT NULL)
    )
);
CREATE INDEX ix_consumo_papel_op    ON costeo.consumo_papel (orden_produccion_id);
CREATE INDEX ix_consumo_papel_fecha ON costeo.consumo_papel (fecha DESC);
CREATE INDEX ix_consumo_papel_rollo ON costeo.consumo_papel (montaje_rollo_id);

-- Idempotencia: evita el duplicado que hoy se controla con Set de 5,000 filas en GAS
CREATE UNIQUE INDEX ux_consumo_papel_natural
    ON costeo.consumo_papel (linea_produccion_id, talla_id)
    WHERE origen = 'PRODUCCION' AND anulado_en IS NULL;

-- ★ REPOSICIONES (reemplaza DataRepos!Registro, 57,891 filas)
CREATE TABLE costeo.reposicion (
    id                    bigserial PRIMARY KEY,
    fecha                 timestamptz NOT NULL,
    orden_produccion_id   bigint NOT NULL REFERENCES costeo.orden_produccion(id),
    numero_repo           smallint NOT NULL CHECK (numero_repo BETWEEN 1 AND 99),
    codigo_repo           text GENERATED ALWAYS AS ('R' || lpad(numero_repo::text, 2, '0')) STORED,

    departamento_id       integer NOT NULL REFERENCES costeo.departamento(id),
    empleado_id           integer REFERENCES <maestro_empleados>(id),
    defecto_id            integer NOT NULL REFERENCES costeo.defecto(id),
    bodega_sac            text,

    impresora_id          integer REFERENCES costeo.impresora(id),
    calandra_id           integer REFERENCES costeo.calandra(id),
    montaje_rollo_id      bigint  REFERENCES costeo.montaje_rollo(id),
    tipo_papel_id         integer REFERENCES costeo.tipo_papel(id),
    yardas_papel          numeric(12,4) NOT NULL DEFAULT 0 CHECK (yardas_papel >= 0),

    insumo_tela_id        integer REFERENCES costeo.insumo(id),
    yardas_tela           numeric(12,4) NOT NULL DEFAULT 0 CHECK (yardas_tela >= 0),

    creado_en             timestamptz NOT NULL DEFAULT now(),
    creado_por            integer NOT NULL REFERENCES <tabla_usuarios>(id),
    anulado_en            timestamptz,
    anulado_por           integer REFERENCES <tabla_usuarios>(id),
    motivo_anulacion      text,

    UNIQUE (orden_produccion_id, numero_repo, defecto_id, fecha)
);
CREATE INDEX ix_reposicion_op      ON costeo.reposicion (orden_produccion_id);
CREATE INDEX ix_reposicion_fecha   ON costeo.reposicion (fecha DESC);
CREATE INDEX ix_reposicion_defecto ON costeo.reposicion (defecto_id);
```

### 5.6 Insumos y su asignación a OF — reemplazo del Excel de 482 columnas

```sql
CREATE TABLE costeo.insumo (
    id                    serial PRIMARY KEY,
    codigo                text UNIQUE,          -- '6130109', '174001', '611001'
    nombre                text NOT NULL,
    categoria_insumo_id   smallint NOT NULL REFERENCES costeo.categoria_insumo(id),
    unidad_medida_id      smallint NOT NULL REFERENCES costeo.unidad_medida(id),
    busqueda              tsvector GENERATED ALWAYS AS
                            (to_tsvector('spanish', coalesce(codigo,'') || ' ' || nombre)) STORED,
    activo                boolean NOT NULL DEFAULT true
);
CREATE INDEX ix_insumo_busqueda ON costeo.insumo USING gin (busqueda);
CREATE INDEX ix_insumo_trgm ON costeo.insumo USING gin (nombre gin_trgm_ops);  -- requiere pg_trgm

-- Costo versionado: permite recostear meses cerrados con exactitud
CREATE TABLE costeo.insumo_costo (
    id              bigserial PRIMARY KEY,
    insumo_id       integer NOT NULL REFERENCES costeo.insumo(id),
    costo_unitario  numeric(14,6) NOT NULL CHECK (costo_unitario >= 0),
    vigente_desde   date NOT NULL,
    vigente_hasta   date,
    vigencia        daterange GENERATED ALWAYS AS
                      (daterange(vigente_desde, vigente_hasta, '[)')) STORED,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    creado_por      integer NOT NULL REFERENCES <tabla_usuarios>(id),
    EXCLUDE USING gist (insumo_id WITH =, vigencia WITH &&)
);

-- ★ Cada fila aquí reemplaza una tripleta de columnas del Excel horizontal
CREATE TABLE costeo.of_insumo (
    id                    bigserial PRIMARY KEY,
    orden_facturacion_id  bigint NOT NULL REFERENCES costeo.orden_facturacion(id) ON DELETE CASCADE,
    insumo_id             integer NOT NULL REFERENCES costeo.insumo(id),
    cantidad              numeric(14,4) NOT NULL CHECK (cantidad > 0),
    insumo_costo_id       bigint NOT NULL REFERENCES costeo.insumo_costo(id),  -- versión aplicada
    costo_unitario        numeric(14,6) NOT NULL,   -- snapshot inmutable
    costo_total           numeric(16,4) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED,
    nota                  text,
    creado_en             timestamptz NOT NULL DEFAULT now(),
    creado_por            integer NOT NULL REFERENCES <tabla_usuarios>(id),
    UNIQUE (orden_facturacion_id, insumo_id)
);
CREATE INDEX ix_of_insumo_of ON costeo.of_insumo (orden_facturacion_id);

-- Plantillas para acelerar la captura (§6.3)
CREATE TABLE costeo.plantilla_insumo (
    id                serial PRIMARY KEY,
    nombre            text NOT NULL,
    tipo_servicio_id  smallint REFERENCES costeo.tipo_servicio(id),
    cliente_id        integer REFERENCES <maestro_clientes>(id),
    activa            boolean NOT NULL DEFAULT true
);
CREATE TABLE costeo.plantilla_insumo_detalle (
    plantilla_insumo_id integer NOT NULL REFERENCES costeo.plantilla_insumo(id) ON DELETE CASCADE,
    insumo_id           integer NOT NULL REFERENCES costeo.insumo(id),
    orden               smallint NOT NULL DEFAULT 0,
    PRIMARY KEY (plantilla_insumo_id, insumo_id)
);
```

---

## 6. MÓDULOS FUNCIONALES Y UX

### 6.0 Sub-módulo: Gestión de Rollos *(nuevo, habilitante)*

- **Ingreso a bodega:** captura de factura de papel + generación automática de los N rollos. Un solo formulario: número de factura, proveedor, fecha, tipo de papel, total de rollos, yardas por rollo. El sistema crea los N registros.
- **Montaje:** pantalla táctil grande. Seleccionar impresora → escanear o elegir rollo → confirmar. La app cierra automáticamente el montaje anterior de esa impresora.
- **Desmontaje:** registrar yardas finales. Muestra en vivo el consumo acumulado y la merma calculada.
- **Panel de estado:** qué rollo está en cada impresora ahora, yardas consumidas, yardas restantes estimadas, alerta cuando queda poco.

### 6.1 Sub-módulo: Reposiciones *(reemplaza Forma 1)*

**Campos:** fecha/hora, OP, No. reposición, departamento, responsable, defecto, bodega SAC, yardas papel, tipo papel, tela, yardas tela, cliente, línea de producto, impresora, calandra.

**Correcciones obligatorias respecto al legacy:**

1. **Eliminar el race condition.** El `NRollo` ya no se busca de forma asíncrona con un placeholder editable. Se resuelve **en el servidor** al momento de guardar, vía `costeo.fn_rollo_en(impresora_id, fecha)`. Es imposible que se persista `"Buscando..."`.
2. **Autocompletar el tipo de papel** desde el rollo montado. El usuario no lo teclea.
3. **Validar la OP contra el maestro.** Si no existe, mostrar error claro, no crear basura.
4. **Sugerir el siguiente número de reposición** automáticamente (`MAX(numero_repo) + 1` para esa OP).
5. **Autocompletar cliente y línea de producto** desde la OP.

**UX:** una sola pantalla, mobile-first. Campos en orden de captura natural. El teclado numérico debe aparecer en campos numéricos (`inputmode="decimal"`). Confirmación con toast y opción de "registrar otra para la misma OP" que conserve el contexto.

### 6.2 Sub-módulo: Consumo de Papel *(reemplaza Forma 2)*

**Flujo actual a preservar:** carga de líneas de producción → captura de cantidades por talla → cálculo de consumo desde el estándar → envío a la tabla de hechos.

**Correcciones obligatorias:**

1. **No perder los 8 campos que el GAS descarta:** orden de compra, desarrollo, descripción, recibido, fecha cliente, fecha entregar, estatus, imagen. La orden de compra es la trazabilidad hasta el PO del cliente.
2. **Usar el enguiamiento de la línea**, no la constante hardcodeada `0.084375`. Migrar ese valor como *default* configurable, no como constante en código.
3. **No borrar el origen.** Hoy `copiarDatos()` elimina las filas procesadas. En su lugar: marcar `procesada_en` y mantener el registro. Los datos no se destruyen.
4. **Registrar qué versión del estándar se aplicó** (`consumo_estandar_id`) para que el recosteo sea reproducible.
5. **Idempotencia por constraint**, no por comparación de las últimas 5,000 filas en memoria.

**UX — captura por tallas:** grid con las tallas relevantes al producto (no las 190). Entrada numérica rápida, total en vivo, consumo calculado visible antes de confirmar. Debe funcionar en tablet.

### 6.3 Sub-módulo: Insumos por OF *(reemplaza Forma 3 — máxima prioridad de UX)*

Este es el dolor principal: hoy se navega horizontalmente entre **482 columnas** en Excel, con alto riesgo de confundir insumos y cantidades.

**Diseño requerido — patrón "carrito de compras":**

```
┌──────────────────────────────────────────────────────────────┐
│  OF: 26OF000116    Fecha: 02/03/2026    Cliente: BSN SPORTS  │
│  Factura: E-1540   Tipo: PAQUETE COMPLETO                    │
│  OPs vinculadas: [26OP004472] [26OP004802] [+ agregar]       │
├──────────────────────────────────────────────────────────────┤
│  🔍 [Buscar insumo por código o nombre..............]  [+]   │
│     ↳ typeahead: busca en 154+ insumos, tolerante a typos    │
│     ↳ muestra: código · nombre · unidad · costo vigente      │
├──────────────────────────────────────────────────────────────┤
│  INSUMO                        CANT     C.UNIT      TOTAL    │
│  ─────────────────────────────────────────────────────────   │
│  173014 TEXTPRINT XP 105     67.43  ×   4.642  =   313.01  ✕│
│  TINTA                        46.22  ×  14.248  =   658.54  ✕│
│  6130109 ELASTICO E-113        0.00  ×   0.382  =     0.00  ✕│
│                                          TOTAL:   971.55     │
├──────────────────────────────────────────────────────────────┤
│  [Cargar plantilla ▾]  [Copiar de OF anterior]  [Guardar]    │
└──────────────────────────────────────────────────────────────┘
```

**Requisitos funcionales:**

| Requisito | Detalle |
|---|---|
| Búsqueda incremental | Por código o nombre, tolerante a errores tipográficos (`pg_trgm` + `tsvector`). Resultados en <100 ms. |
| Navegación 100% teclado | `Enter` = agregar y saltar a cantidad · `Tab` = siguiente · `Esc` = cancelar · `Ctrl+S` = guardar. Nunca obligar al mouse. |
| Costo automático | Se precarga desde `insumo_costo` vigente a la fecha de la OF. Editable con permiso, y toda edición queda auditada. |
| Plantillas | "PAQUETE COMPLETO BSN" precarga los 12 insumos habituales con cantidad en cero. Elimina el 80% de las búsquedas. |
| Copiar de OF anterior | Duplica las líneas de una OF similar del mismo cliente. |
| Totales en vivo | Recalculo sin recargar página. |
| Validación de duplicados | Un insumo no puede aparecer dos veces en la misma OF (constraint `UNIQUE`). |
| Comparación vs. estándar | Si la OP tiene Hoja Técnica, mostrar en un panel lateral el consumo esperado vs. el capturado, resaltando desviaciones. **Esta es la razón de ser del módulo.** |
| Cierre de OF | Una OF con `cerrada_en` no admite modificaciones sin permiso de supervisor. |

---

## 7. AUTENTICACIÓN Y PERMISOS

Extiende el esquema existente (⚠️ S3) hacia permisos granulares por acción:

```
costeo.rollo.ver          costeo.rollo.montar        costeo.rollo.desmontar
costeo.rollo.ingresar
costeo.reposicion.ver     costeo.reposicion.crear    costeo.reposicion.anular
costeo.consumo.ver        costeo.consumo.capturar    costeo.consumo.anular
costeo.of.ver             costeo.of.crear            costeo.of.editar
costeo.of.cerrar          costeo.of.reabrir
costeo.insumo.ver         costeo.insumo.administrar  costeo.insumo.editar_costo
costeo.estandar.ver       costeo.estandar.administrar
costeo.dashboard.ver      costeo.dashboard.ver_financiero
```

**Roles sugeridos:** `Operador Impresión` · `Operador Transferencia` · `Analista Costos` · `Supervisor Producción` · `Gerencia` · `Administrador IT`.

**Regla:** el middleware valida permiso en cada ruta. La UI oculta lo que el usuario no puede hacer, **pero la autorización real vive en el backend**. Nunca confíes en que el frontend escondió el botón.

---

## 8. SINCRONIZACIÓN A GOOGLE SHEETS

Unidireccional PostgreSQL → Sheets, solo lectura para los usuarios. Es un espejo temporal mientras Looker Studio sigue vivo.

**Patrón: Transactional Outbox.**

```sql
CREATE TABLE costeo.sync_outbox (
    id            bigserial PRIMARY KEY,
    destino       text NOT NULL,        -- 'SHEET_CONSUMOS' | 'SHEET_REPOS'
    entidad       text NOT NULL,
    entidad_id    bigint NOT NULL,
    operacion     text NOT NULL CHECK (operacion IN ('INSERT','UPDATE','DELETE')),
    payload       jsonb NOT NULL,
    estado        text NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','PROCESANDO','OK','ERROR')),
    intentos      smallint NOT NULL DEFAULT 0,
    ultimo_error  text,
    creado_en     timestamptz NOT NULL DEFAULT now(),
    procesado_en  timestamptz
);
CREATE INDEX ix_outbox_pendientes ON costeo.sync_outbox (estado, creado_en)
    WHERE estado IN ('PENDIENTE','ERROR');
```

**Implementación:**
- Triggers `AFTER INSERT/UPDATE` en `consumo_papel` y `reposicion` encolan en el outbox, dentro de la misma transacción.
- Worker Node.js separado (proceso PM2 aparte, `erp-sync`), con `node-cron`, procesa por lotes usando `spreadsheets.values.append` de `googleapis`.
- **Service Account** con acceso solo a las hojas espejo. Credenciales en variables de entorno, nunca en el repo.
- Reintentos con backoff exponencial, máximo 5 intentos, luego alerta.
- Las hojas espejo deben quedar **protegidas** en Google (solo la service account escribe).
- Endpoint `/api/costeo/sync/estado` para monitoreo.

**Importante:** el layout de las hojas espejo debe replicar el layout actual de `ConsumosFinal!Datos` y `DataRepos!Registro` para no romper los dashboards de Looker Studio existentes durante la transición.

---

## 9. VISTAS PARA LOOKER STUDIO Y DASHBOARDS PROPIOS

```sql
-- Vista plana de consumo de papel, con todas las dimensiones resueltas
CREATE VIEW costeo.v_consumo_papel AS ...

-- Vista de reposiciones con defecto, departamento, responsable, costo
CREATE VIEW costeo.v_reposiciones AS ...

-- Costo total por OF: insumos + papel prorrateado + MOD + GF + FIJOS
CREATE VIEW costeo.v_costo_orden_facturacion AS ...

-- ★ Vista maestra: costeo real por OP con comparación contra Hoja Técnica
CREATE MATERIALIZED VIEW costeo.mv_costeo_op AS ...
```

**Criterios:**
- Las vistas planas para Looker deben incluir claves y descripciones (`cliente_id` y `cliente_nombre`) para no obligar a joins del lado del BI.
- La vista maestra va como **materializada** con refresco programado, dado el volumen (397k+ filas históricas).
- Índices sobre la materializada por `fecha`, `cliente_id`, `orden_produccion_id`.
- Documenta cada vista en `docs/vistas-bi.md` con su grano, dimensiones y medidas.

**Métricas mínimas a exponer:**

| Métrica | Definición |
|---|---|
| Consumo real de papel por OP | `Σ consumo_yd` |
| Consumo estándar por OP | `Σ (consumo_estandar × cantidad)` |
| Varianza de papel | real − estándar, absoluta y % |
| Merma por rollo | `yardas_iniciales − Σ consumos` |
| Reposiciones por OP / por defecto / por departamento | conteo y yardas |
| Costo de reposiciones | yardas × costo de papel vigente |
| Tasa de reposición | reposiciones ÷ OPs del período |
| Costo real por OF | insumos + papel + MOD + GF + FIJOS |
| Margen por OF y por cliente | venta − costo |
| Top defectos por impacto económico | ranking por costo, no por frecuencia |

---

## 10. MIGRACIÓN DE DATOS HISTÓRICOS

**Arranque en limpio**, pero con los scripts de migración listos desde el inicio. Se ejecutarán después.

**Diseño:**
1. Schema `staging` con tablas espejo de los archivos legacy, sin constraints.
2. Carga cruda desde XLSX/CSV.
3. Scripts de transformación **idempotentes** que resuelvan los problemas documentados en `ANEXO_A`:
   - Normalizar OPs sin padding (`24OP5820` → `24OP005820`)
   - Leer el NRollo desde la **columna 15 (`NRollo`)**. La columna 16 (`FUNCION`) fue una prueba puntual: **descartarla, no modelarla**
   - Descartar/cuarentenar los 5,248 registros con `"Buscando..."`
   - Deduplicar clientes por similitud (`BSN JERSY` → `BSN SPORTS` + línea `Jersey`)
   - Normalizar impresoras (`MK'S`/`MK's`, `Rg Next`/`RG NEXT`)
   - Descartar valores basura (`Asignar`, `CANCELADA`)
   - Descomponer `CONCAT` en `codigo` + `talla`, ignorando la talla fantasma `CONSUMO EN BLANCO`
   - Cargar `Consumos` como versión única inicial del estándar. **No migrar las 13 hojas fechadas** (bitácora de solicitudes, ya consolidadas)
   - Mapear los 475 códigos de producto contra el maestro de `recetas` y reportar los no encontrados sin darlos de alta automáticamente
   - Cuarentenar fechas fuera de rango (`2002-06-24`, fechas futuras)
4. Tabla `staging.rechazos` con motivo por cada fila no migrada.
5. Reporte de conciliación: conteos origen vs. destino, sumas de control de yardas.

**Nota sobre rollos:** el histórico no tiene eventos de montaje. Los `montaje_rollo` históricos deberán **inferirse** a partir de los `NRollo` observados por impresora y fecha, marcados con `origen = 'INFERIDO'`. Documenta claramente que esos datos son reconstruidos, no registrados.

---

## 11. PLAN DE FASES

Trabaja en fases. **Al terminar cada una, detente y espera mi validación.** No avances a la siguiente por iniciativa propia.

| Fase | Contenido | Entregable |
|---|---|---|
| **F0** | Validación de supuestos + análisis del esquema actual | `docs/00-VALIDACION-SUPUESTOS.md` |
| **F1** | Schema `costeo`, migraciones, catálogos con seeds, RBAC | DDL + seeds + tests de constraints |
| **F2** | Gestión de Rollos (ingreso, montaje, desmontaje, panel) | Módulo funcional |
| **F3** | Reposiciones | Módulo funcional |
| **F4** | Consumo de Papel | Módulo funcional |
| **F5** | Insumos por OF *(el de mayor impacto)* | Módulo funcional |
| **F6** | Vistas BI + sincronización a Sheets | Vistas + worker `erp-sync` |
| **F7** | Dashboards propios en el ERP | Reemplazo de Looker Studio |
| **F8** | Scripts de migración histórica | Scripts + reporte de conciliación |

**Sistema de migraciones:** usa una herramienta de migraciones versionadas (`node-pg-migrate` o equivalente, según `CONVENCIONES.md`). **Nunca modifiques el esquema con DDL manual en producción.**

---

## 12. CRITERIOS DE ACEPTACIÓN

El módulo se considera terminado cuando:

- [ ] Es **imposible** guardar un registro sin rollo válido resuelto por el servidor.
- [ ] Es **imposible** tener dos rollos montados simultáneamente en la misma impresora (verificado con test que intenta violar el `EXCLUDE`).
- [ ] Toda OP en la base cumple el regex `^\d{2}OP\d{6}$`.
- [ ] Ningún campo que deba ser catálogo acepta texto libre.
- [ ] Capturar 15 insumos en una OF toma **menos de 2 minutos** sin usar el mouse.
- [ ] Recostear un mes cerrado produce exactamente el mismo resultado que el cierre original.
- [ ] Los tres formularios funcionan en un celular de 360 px de ancho.
- [ ] La sincronización a Sheets sobrevive a una caída de red sin perder registros ni duplicar.
- [ ] Existen tests de integración para cada constraint crítico.
- [ ] `docs/` contiene: modelo ER, diccionario de datos, guía de despliegue y manual de usuario por rol.

---

## 13. QUÉ NO HACER

- ❌ No repliques la estructura horizontal del Excel en tablas. Si aparece una columna por insumo, el diseño está mal.
- ❌ No uses concatenaciones como llave (`CODIGO || TALLA`, `OP1-OP2-OP3`).
- ❌ No implementes búsquedas por scan lineal donde corresponde un índice.
- ❌ No pongas la lógica de integridad únicamente en JavaScript.
- ❌ No borres registros del origen al procesarlos.
- ❌ No hardcodees constantes de negocio (`0.084375`, `0.6`, `36`) en el código. Van en configuración o en la base.
- ❌ No permitas que un placeholder de UI llegue a la base de datos.
- ❌ No crees un maestro de productos en `costeo`. Vive en `recetas` y se referencia por FK.
- ❌ No des de alta productos automáticamente durante la migración. Repórtalos y espera decisión.
- ❌ No asumas nada sobre el esquema actual sin verificarlo primero.

---

## 14. PRIMERA INSTRUCCIÓN

1. Lee `CLAUDE.md`, `CONVENCIONES.md`, `ANEXO_A_Hallazgos.md` y `ANEXO_B_Catalogos.md`.
2. Conéctate a PostgreSQL e inventaria el esquema actual: tablas, columnas, FKs, índices, roles.
3. Genera `docs/00-VALIDACION-SUPUESTOS.md` respondiendo cada supuesto S1–S7.
4. Genera `docs/01-COBERTURA-PRODUCTOS.md` cruzando los 475 códigos del legacy contra el maestro de `recetas`.
5. Propón el modelo ER final ajustado a lo que encontraste, señalando toda discrepancia con este documento.
6. **Detente y espera mi validación.** No escribas código de aplicación todavía.
