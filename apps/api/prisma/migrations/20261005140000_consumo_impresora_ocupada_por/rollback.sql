-- Rollback de 20261005140000_consumo_impresora_ocupada_por.
--
-- Se pierde el registro de qué envíos se hicieron sobre una impresora que otro
-- operario estaba usando. No es reconstruible desde `core.auditoria`: el
-- servicio no escribe ese dato ahí, va solo en esta columna.
DROP INDEX IF EXISTS "costeo"."idx_consumo_papel_impresora_ocupada";

ALTER TABLE "costeo"."consumo_papel"
  DROP CONSTRAINT IF EXISTS "ck_consumo_papel_impresora_ocupada_por";

ALTER TABLE "costeo"."consumo_papel"
  DROP CONSTRAINT IF EXISTS "consumo_papel_impresora_ocupada_por_fkey";

ALTER TABLE "costeo"."consumo_papel"
  DROP COLUMN IF EXISTS "impresora_ocupada_por";
