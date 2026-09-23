-- Rollback de 20260922160000_montaje_desmontado_por.
-- El dato no se pierde: sigue en core.auditoria, que es de donde se backfilleó.
ALTER TABLE "costeo"."montaje_rollo" DROP CONSTRAINT IF EXISTS "ck_montaje_rollo_desmontado_por";
ALTER TABLE "costeo"."montaje_rollo" DROP CONSTRAINT IF EXISTS "montaje_rollo_desmontado_por_fkey";
ALTER TABLE "costeo"."montaje_rollo" DROP COLUMN IF EXISTS "desmontado_por";
