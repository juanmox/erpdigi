-- Deshace 20261023160000_atributos_producto.
--
-- ⚠️ Pierde lo que se haya cargado en los 4 atributos del producto
-- (id_estilo, id_linea, id_genero, id_composicion) y los tres catálogos nuevos.
-- El catálogo de estilos vuelve a costeo.linea_producto con los mismos ids, así
-- que las órdenes conservan el suyo. Si ya se cargaron atributos que importan,
-- respaldar `recetas.productos` antes.
--
-- Después de correrlo: `prisma migrate resolve --rolled-back 20261023160000_atributos_producto`
-- y volver al código anterior.

DROP INDEX recetas.idx_prod_estilo;
DROP INDEX recetas.idx_prod_linea;
DROP INDEX recetas.idx_prod_genero;
DROP INDEX recetas.idx_prod_composicion;

ALTER TABLE recetas.productos
  DROP CONSTRAINT productos_id_estilo_fkey,
  DROP CONSTRAINT productos_id_linea_fkey,
  DROP CONSTRAINT productos_id_genero_fkey,
  DROP CONSTRAINT productos_id_composicion_fkey;
ALTER TABLE recetas.productos
  DROP COLUMN id_estilo,
  DROP COLUMN id_linea,
  DROP COLUMN id_genero,
  DROP COLUMN id_composicion;

DROP TABLE recetas.composiciones;
DROP TABLE recetas.generos;
DROP TABLE recetas.lineas;

COMMENT ON TABLE recetas.estilos IS NULL;
DROP INDEX recetas.ux_estilos_nombre_lower;
ALTER TABLE recetas.estilos DROP CONSTRAINT ck_estilos_nombre_no_vacio;
ALTER TABLE recetas.estilos DROP COLUMN creado_en;

ALTER TABLE costeo.plantilla_insumo DROP CONSTRAINT plantilla_insumo_id_estilo_fkey;
ALTER TABLE costeo.orden_produccion DROP CONSTRAINT orden_produccion_id_estilo_fkey;

ALTER TABLE recetas.estilos RENAME CONSTRAINT estilos_nombre_key TO linea_producto_nombre_key;
ALTER TABLE recetas.estilos RENAME CONSTRAINT estilos_pkey TO linea_producto_pkey;
ALTER SEQUENCE recetas.estilos_id_estilo_seq RENAME TO linea_producto_id_linea_producto_seq;
ALTER TABLE recetas.estilos RENAME COLUMN id_estilo TO id_linea_producto;
ALTER TABLE recetas.estilos RENAME TO linea_producto;
ALTER TABLE recetas.linea_producto SET SCHEMA costeo;

ALTER TABLE costeo.plantilla_insumo RENAME COLUMN id_estilo TO id_linea_producto;
ALTER TABLE costeo.orden_produccion RENAME COLUMN id_estilo TO id_linea_producto;

ALTER TABLE costeo.orden_produccion ADD CONSTRAINT orden_produccion_id_linea_producto_fkey
  FOREIGN KEY (id_linea_producto) REFERENCES costeo.linea_producto(id_linea_producto)
  ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE costeo.plantilla_insumo ADD CONSTRAINT plantilla_insumo_id_linea_producto_fkey
  FOREIGN KEY (id_linea_producto) REFERENCES costeo.linea_producto(id_linea_producto)
  ON UPDATE CASCADE ON DELETE SET NULL;
