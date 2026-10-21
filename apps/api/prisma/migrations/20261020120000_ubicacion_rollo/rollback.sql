-- Revierte 20261020120000_ubicacion_rollo.
DROP INDEX IF EXISTS costeo.idx_rollo_papel_id_ubicacion;
ALTER TABLE costeo.rollo_papel DROP CONSTRAINT IF EXISTS rollo_papel_id_ubicacion_fkey;
ALTER TABLE costeo.rollo_papel DROP COLUMN IF EXISTS id_ubicacion;
DROP TABLE IF EXISTS costeo.ubicacion;
