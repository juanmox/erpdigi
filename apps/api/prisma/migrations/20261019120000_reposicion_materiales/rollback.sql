-- Revierte 20261019120000_reposicion_materiales.
-- ⚠️ Se pierden las líneas de material cargadas. No hay forma de reconstruirlas.
DROP TABLE IF EXISTS costeo.reposicion_insumo;
ALTER TABLE costeo.reposicion DROP CONSTRAINT IF EXISTS ck_reposicion_tipo_regla;
ALTER TABLE costeo.reposicion DROP CONSTRAINT IF EXISTS ck_reposicion_tipo;
ALTER TABLE costeo.reposicion DROP COLUMN IF EXISTS tipo;
