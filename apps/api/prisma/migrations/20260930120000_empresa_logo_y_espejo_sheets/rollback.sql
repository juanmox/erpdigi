-- Revierte 20260930120000_empresa_logo_y_espejo_sheets.
-- Ojo: al quitar espeja_sheets el espejo vuelve a correr para TODAS las
-- empresas, que es justo lo que esta migracion vino a evitar.
ALTER TABLE core.empresas DROP CONSTRAINT IF EXISTS ck_empresas_logo_data_uri;
ALTER TABLE core.empresas DROP COLUMN IF EXISTS logo;
ALTER TABLE core.empresas DROP COLUMN IF EXISTS espeja_sheets;
