-- Revierte 20261021150000_ordenes_facturacion.
-- Solo segura mientras orden_facturacion/of_op sigan vacías o solo tengan
-- datos de prueba — no reconstruye nada si ya hay OF reales cargadas.

DROP INDEX IF EXISTS "costeo"."idx_of_op_empresa";
DROP INDEX IF EXISTS "costeo"."idx_of_op_facturacion";
DROP INDEX IF EXISTS "costeo"."ux_of_op_produccion_vigente";
DROP TABLE IF EXISTS "costeo"."of_op";

CREATE TABLE "costeo"."of_op" (
  "id_orden_facturacion" INTEGER NOT NULL,
  "id_orden_produccion" INTEGER NOT NULL,
  CONSTRAINT "of_op_pkey" PRIMARY KEY ("id_orden_facturacion", "id_orden_produccion")
);

ALTER TABLE "costeo"."of_op"
  ADD CONSTRAINT "of_op_id_orden_facturacion_fkey" FOREIGN KEY ("id_orden_facturacion")
  REFERENCES "costeo"."orden_facturacion"("id_orden_facturacion") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "costeo"."of_op"
  ADD CONSTRAINT "of_op_id_orden_produccion_fkey" FOREIGN KEY ("id_orden_produccion")
  REFERENCES "costeo"."orden_produccion"("id_orden_produccion") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "costeo"."orden_facturacion" DROP CONSTRAINT IF EXISTS "ck_orden_facturacion_origen";
ALTER TABLE "costeo"."orden_facturacion" DROP COLUMN IF EXISTS "origen";

ALTER TABLE "costeo"."orden_facturacion" DROP CONSTRAINT IF EXISTS "orden_facturacion_anulada_por_fkey";
ALTER TABLE "costeo"."orden_facturacion" DROP COLUMN IF EXISTS "motivo_anulacion";
ALTER TABLE "costeo"."orden_facturacion" DROP COLUMN IF EXISTS "anulada_por";
ALTER TABLE "costeo"."orden_facturacion" DROP COLUMN IF EXISTS "anulada_en";

DROP INDEX IF EXISTS "costeo"."idx_of_fecha_factura";
DROP INDEX IF EXISTS "costeo"."idx_of_fecha";
DROP INDEX IF EXISTS "costeo"."idx_of_numero_factura";
ALTER TABLE "costeo"."orden_facturacion" DROP CONSTRAINT IF EXISTS "ck_orden_facturacion_factura";
ALTER TABLE "costeo"."orden_facturacion" DROP COLUMN IF EXISTS "fecha_factura";

ALTER TABLE "costeo"."orden_facturacion" ALTER COLUMN "id_tipo_servicio" SET NOT NULL;

ALTER TABLE "costeo"."orden_facturacion" DROP CONSTRAINT IF EXISTS "orden_facturacion_id_empresa_uq";
DROP INDEX IF EXISTS "costeo"."idx_of_empresa";
DROP INDEX IF EXISTS "costeo"."orden_facturacion_id_empresa_anio_correlativo_key";
CREATE UNIQUE INDEX "orden_facturacion_anio_correlativo_key"
  ON "costeo"."orden_facturacion" ("anio", "correlativo");
ALTER TABLE "costeo"."orden_facturacion" DROP CONSTRAINT IF EXISTS "orden_facturacion_id_empresa_fkey";
ALTER TABLE "costeo"."orden_facturacion" DROP COLUMN IF EXISTS "id_empresa";
