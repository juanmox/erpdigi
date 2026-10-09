-- Rollback de 20261009120000_rollo_consumido_fuera.
--
-- ⚠️ Los rollos que estén en CONSUMIDO_FUERA tienen que volver a un estado
-- válido ANTES de restaurar el CHECK viejo, o el ALTER falla. Se los pasa a
-- DESCARTADO, que es lo más cercano: fuera de circulación, sin consumo acá.
UPDATE "costeo"."rollo_papel" SET "estado" = 'DESCARTADO'
 WHERE "estado" = 'CONSUMIDO_FUERA';

ALTER TABLE "costeo"."rollo_papel"
  DROP CONSTRAINT IF EXISTS "ck_rollo_papel_consumido_fuera";

ALTER TABLE "costeo"."rollo_papel"
  DROP CONSTRAINT IF EXISTS "rollo_papel_consumido_fuera_por_fkey";

ALTER TABLE "costeo"."rollo_papel"
  DROP COLUMN IF EXISTS "consumido_fuera_motivo",
  DROP COLUMN IF EXISTS "consumido_fuera_por",
  DROP COLUMN IF EXISTS "consumido_fuera_en";

ALTER TABLE "costeo"."rollo_papel"
  DROP CONSTRAINT IF EXISTS "ck_rollo_papel_estado";

ALTER TABLE "costeo"."rollo_papel"
  ADD CONSTRAINT "ck_rollo_papel_estado"
  CHECK ("estado" IN ('EN_BODEGA', 'MONTADO', 'AGOTADO', 'DESCARTADO'));
