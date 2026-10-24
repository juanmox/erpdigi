-- Atributos del producto para la estadística de producción: ESTILO, LÍNEA,
-- GÉNERO y COMPOSICIÓN (archivo "DESGLOSE DE CAMPOS", Jaqueline Lima).
--
-- ⚠️ Corrección de nomenclatura. Lo que el ERP llamaba "línea de producto"
-- (`costeo.linea_producto`: Jersey, Short, T-Shirt, Pants…) es en realidad el
-- ESTILO — el tipo de prenda. En el archivo nuevo, LÍNEA es otra cosa: la línea
-- comercial (HAIL MARY, MESH CREW NECK, V-NECK). Se renombra el catálogo y se
-- crea la LÍNEA de verdad.
--
-- ── Por qué todo en `recetas` y en el PRODUCTO ──────────────────────────────
-- Son propiedades de la prenda, no de quién la pide (mismo criterio que el
-- deporte y el subcliente). Una OP de uniforme mezcla Jersey y Short, así que
-- un valor por orden no puede representarla: la estadística sale de
-- línea de la OP -> producto -> atributo, sin capturar nada nuevo en la orden.
-- Y los catálogos viven en `recetas` porque describen al producto, y `costeo`
-- depende de `recetas`, nunca al revés.
--
-- ── Por qué catálogos con FK y no texto libre ───────────────────────────────
-- El legacy lo demuestra: ~80 formas de escribir 8 géneros (ADULTO, MEN, MENS,
-- CABALLERO, HOMBRE…). Con FK, renombrar un valor no parte la estadística y
-- nadie escribe "V NECK" al lado de "V-NECK".
--
-- ── Qué NO cambia ───────────────────────────────────────────────────────────
-- Los ids del catálogo de estilos se conservan (se MUEVE la tabla, no se
-- copia), así que las 1,805 OP que ya tienen uno siguen apuntando sin tocar un
-- solo dato. Es todo metadato: renombres y columnas nulas, sin reescribir
-- tablas.

-- ── 1. El catálogo existente pasa a recetas.estilos ─────────────────────────
ALTER TABLE costeo.linea_producto SET SCHEMA recetas;
ALTER TABLE recetas.linea_producto RENAME TO estilos;
ALTER TABLE recetas.estilos RENAME COLUMN id_linea_producto TO id_estilo;
-- La secuencia viajó con la tabla (es de su columna); se renombra para que
-- nadie la busque por el nombre viejo.
ALTER SEQUENCE recetas.linea_producto_id_linea_producto_seq RENAME TO estilos_id_estilo_seq;
ALTER TABLE recetas.estilos RENAME CONSTRAINT linea_producto_pkey TO estilos_pkey;
ALTER TABLE recetas.estilos RENAME CONSTRAINT linea_producto_nombre_key TO estilos_nombre_key;
ALTER TABLE recetas.estilos ADD COLUMN creado_en timestamptz(6) NOT NULL DEFAULT now();

-- ── 2. Las dos tablas de costeo que lo referencian ──────────────────────────
-- Dato histórico intacto: solo cambia el nombre de la columna.
ALTER TABLE costeo.orden_produccion RENAME COLUMN id_linea_producto TO id_estilo;
ALTER TABLE costeo.plantilla_insumo RENAME COLUMN id_linea_producto TO id_estilo;

-- ⚠️ ON DELETE SET NULL pasa a RESTRICT. Era la misma trampa que tenían las FK
-- hacia clientes antes del 2026-10-15: borrar un estilo no fallaba, le vaciaba
-- el estilo a todas sus órdenes en silencio. Un estilo se RETIRA (`activo`).
ALTER TABLE costeo.orden_produccion DROP CONSTRAINT orden_produccion_id_linea_producto_fkey;
ALTER TABLE costeo.orden_produccion ADD CONSTRAINT orden_produccion_id_estilo_fkey
  FOREIGN KEY (id_estilo) REFERENCES recetas.estilos(id_estilo)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE costeo.plantilla_insumo DROP CONSTRAINT plantilla_insumo_id_linea_producto_fkey;
ALTER TABLE costeo.plantilla_insumo ADD CONSTRAINT plantilla_insumo_id_estilo_fkey
  FOREIGN KEY (id_estilo) REFERENCES recetas.estilos(id_estilo)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ── 3. Los tres catálogos nuevos ────────────────────────────────────────────
-- Mismo molde que recetas.subclientes: nombre, activo, creado_en, y un CHECK
-- de nombre no vacío. La unicidad real es por lower(nombre): UNIQUE (nombre)
-- solo no frena "V-Neck" contra "V-NECK".
CREATE TABLE recetas.lineas (
  id_linea   serial         PRIMARY KEY,
  nombre     varchar(80)    NOT NULL,
  activo     boolean        NOT NULL DEFAULT true,
  creado_en  timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT lineas_nombre_key UNIQUE (nombre),
  CONSTRAINT ck_lineas_nombre_no_vacio CHECK (btrim(nombre) <> '')
);
CREATE TABLE recetas.generos (
  id_genero  serial         PRIMARY KEY,
  nombre     varchar(80)    NOT NULL,
  activo     boolean        NOT NULL DEFAULT true,
  creado_en  timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT generos_nombre_key UNIQUE (nombre),
  CONSTRAINT ck_generos_nombre_no_vacio CHECK (btrim(nombre) <> '')
);
CREATE TABLE recetas.composiciones (
  id_composicion serial         PRIMARY KEY,
  nombre         varchar(120)   NOT NULL,
  activo         boolean        NOT NULL DEFAULT true,
  creado_en      timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT composiciones_nombre_key UNIQUE (nombre),
  CONSTRAINT ck_composiciones_nombre_no_vacio CHECK (btrim(nombre) <> '')
);

ALTER TABLE recetas.estilos ADD CONSTRAINT ck_estilos_nombre_no_vacio CHECK (btrim(nombre) <> '');

CREATE UNIQUE INDEX ux_estilos_nombre_lower       ON recetas.estilos (lower(nombre));
CREATE UNIQUE INDEX ux_lineas_nombre_lower        ON recetas.lineas (lower(nombre));
CREATE UNIQUE INDEX ux_generos_nombre_lower       ON recetas.generos (lower(nombre));
CREATE UNIQUE INDEX ux_composiciones_nombre_lower ON recetas.composiciones (lower(nombre));

-- ── 4. Las cuatro columnas en el producto ───────────────────────────────────
-- Nulas: ningún producto existente cambia. RESTRICT: un valor en uso no se
-- puede borrar. Índices parciales, igual que id_subcliente: la mayoría de los
-- productos no los va a tener llenos al principio.
ALTER TABLE recetas.productos
  ADD COLUMN id_estilo      integer,
  ADD COLUMN id_linea       integer,
  ADD COLUMN id_genero      integer,
  ADD COLUMN id_composicion integer;

ALTER TABLE recetas.productos ADD CONSTRAINT productos_id_estilo_fkey
  FOREIGN KEY (id_estilo) REFERENCES recetas.estilos(id_estilo) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE recetas.productos ADD CONSTRAINT productos_id_linea_fkey
  FOREIGN KEY (id_linea) REFERENCES recetas.lineas(id_linea) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE recetas.productos ADD CONSTRAINT productos_id_genero_fkey
  FOREIGN KEY (id_genero) REFERENCES recetas.generos(id_genero) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE recetas.productos ADD CONSTRAINT productos_id_composicion_fkey
  FOREIGN KEY (id_composicion) REFERENCES recetas.composiciones(id_composicion) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX idx_prod_estilo      ON recetas.productos (id_estilo)      WHERE id_estilo IS NOT NULL;
CREATE INDEX idx_prod_linea       ON recetas.productos (id_linea)       WHERE id_linea IS NOT NULL;
CREATE INDEX idx_prod_genero      ON recetas.productos (id_genero)      WHERE id_genero IS NOT NULL;
CREATE INDEX idx_prod_composicion ON recetas.productos (id_composicion) WHERE id_composicion IS NOT NULL;

COMMENT ON TABLE recetas.estilos IS
  'Tipo de prenda (Jersey, Short, T-Shirt…). Antes costeo.linea_producto; se renombró porque la LÍNEA del archivo de campos es la línea comercial (ver recetas.lineas).';
COMMENT ON TABLE recetas.lineas IS
  'Línea comercial del producto (Hail Mary, Mesh Crew Neck, V-Neck…). No confundir con el estilo.';
COMMENT ON TABLE recetas.generos IS
  'Género/público del producto. Nace VACÍO: las ~80 variantes del legacy se mapean a mano antes de cargar.';
COMMENT ON TABLE recetas.composiciones IS
  'Composición de la tela del producto (100% Polyester…).';
