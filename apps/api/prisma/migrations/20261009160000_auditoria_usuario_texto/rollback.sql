-- Rollback de 20261009160000_auditoria_usuario_texto.
--
-- Se pierde el nombre de los usuarios que ya se hayan borrado entre la
-- migración y el rollback: su `id_usuario` quedó en NULL y el texto era lo
-- único que los nombraba.
DROP INDEX IF EXISTS "core"."idx_auditoria_creado_en";
DROP INDEX IF EXISTS "core"."idx_auditoria_usuario_nombre";

ALTER TABLE "core"."auditoria"
  DROP COLUMN IF EXISTS "usuario_nombre";
