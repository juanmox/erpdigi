-- Rollback de 20261013120000_reposicion_numero_legacy.
--
-- ⚠️ Borra el número original de las reposiciones migradas. Ese dato NO se puede
-- reconstruir desde el ERP: vive solo en los .xlsx del legacy. Si hace falta,
-- hay que volver a extraerlo de ahí.
DROP INDEX IF EXISTS costeo.idx_reposicion_numero_legacy;
ALTER TABLE costeo.reposicion DROP COLUMN IF EXISTS numero_repo_legacy;
