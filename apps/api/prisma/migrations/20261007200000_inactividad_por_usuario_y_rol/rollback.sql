-- Rollback de 20261007200000_inactividad_por_usuario_y_rol.
--
-- Se pierden los minutos configurados por usuario y por rol; al volver, todos
-- quedan con el default del código. No hay otra fuente de la que recuperarlos.
ALTER TABLE "core"."usuarios" DROP CONSTRAINT IF EXISTS "ck_usuarios_minutos_inactividad";
ALTER TABLE "core"."roles"    DROP CONSTRAINT IF EXISTS "ck_roles_minutos_inactividad";
ALTER TABLE "core"."usuarios" DROP COLUMN IF EXISTS "minutos_inactividad";
ALTER TABLE "core"."roles"    DROP COLUMN IF EXISTS "minutos_inactividad";
