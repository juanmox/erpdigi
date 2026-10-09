-- Rollback de 20261009140000_linea_producto_global.
--
-- ⚠️ La columna vuelve como NULLABLE y queda VACÍA: a qué cliente pertenecía
-- cada línea es un dato que esta migración borra y no se puede reconstruir.
-- Si hiciera falta, hay que sacarlo del respaldo previo al despliegue.
ALTER TABLE "costeo"."linea_producto"
  DROP CONSTRAINT IF EXISTS "linea_producto_nombre_key";

ALTER TABLE "costeo"."linea_producto"
  ADD COLUMN "id_cliente" INTEGER;

ALTER TABLE "costeo"."linea_producto"
  ADD CONSTRAINT "linea_producto_id_cliente_fkey"
  FOREIGN KEY ("id_cliente") REFERENCES "recetas"."clientes"("id_cliente");

-- El UNIQUE original no se puede restaurar mientras id_cliente esté en NULL
-- para más de una fila: se restaura a mano después de repoblar la columna.
-- ALTER TABLE "costeo"."linea_producto"
--   ADD CONSTRAINT "linea_producto_id_cliente_nombre_key" UNIQUE ("id_cliente", "nombre");
