-- Rollback de 20260928120000_costeo_por_empresa.
--
-- Deshace la separación por empresa de Costeo y el color de marca. Es seguro
-- mientras TODAS las órdenes sigan siendo de una sola empresa: si Digitalpro ya
-- cargó órdenes propias, al revertir quedan mezcladas con las de Digitexsa sin
-- forma de volver a distinguirlas. Verificarlo antes de correr esto:
--
--   SELECT id_empresa, count(*) FROM costeo.orden_produccion GROUP BY 1;
--
-- Además, las unicidades vuelven a ser globales: si dos empresas alcanzaron a
-- repetir un (anio, correlativo) o un codigo_line, la recreación del índice
-- único falla. Es a propósito — falla ruidoso en vez de borrar datos.

-- 3) Identidad visual
ALTER TABLE "core"."empresas" DROP CONSTRAINT IF EXISTS "ck_empresas_color_marca";
ALTER TABLE "core"."empresas" DROP COLUMN IF EXISTS "color_marca";

-- 2) Líneas
DROP INDEX IF EXISTS "costeo"."idx_linea_produccion_empresa";
DROP INDEX IF EXISTS "costeo"."linea_produccion_id_empresa_codigo_line_key";
CREATE UNIQUE INDEX "linea_produccion_codigo_line_key"
  ON "costeo"."linea_produccion" ("codigo_line");
ALTER TABLE "costeo"."linea_produccion"
  DROP CONSTRAINT IF EXISTS "linea_produccion_orden_empresa_fkey";
ALTER TABLE "costeo"."linea_produccion" DROP COLUMN IF EXISTS "id_empresa";

-- 1) Raíz
ALTER TABLE "costeo"."orden_produccion"
  DROP CONSTRAINT IF EXISTS "orden_produccion_id_empresa_uq";
DROP INDEX IF EXISTS "costeo"."idx_op_empresa";
DROP INDEX IF EXISTS "costeo"."orden_produccion_id_empresa_anio_correlativo_key";
ALTER TABLE "costeo"."orden_produccion"
  ADD CONSTRAINT "orden_produccion_anio_correlativo_key" UNIQUE ("anio", "correlativo");
ALTER TABLE "costeo"."orden_produccion"
  DROP CONSTRAINT IF EXISTS "orden_produccion_id_empresa_fkey";
ALTER TABLE "costeo"."orden_produccion" DROP COLUMN IF EXISTS "id_empresa";
