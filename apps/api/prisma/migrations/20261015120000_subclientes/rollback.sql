-- Revierte la migración 20261015120000_subclientes.
-- ⚠️ Se pierde la marca de subcliente de los productos. El backfill original se
-- puede rehacer por el prefijo del código (UA-/YUA-), pero cualquier marca
-- puesta a mano desde la pantalla de producto NO es recuperable.
ALTER TABLE recetas.productos DROP CONSTRAINT IF EXISTS productos_id_subcliente_fkey;
DROP INDEX IF EXISTS recetas.idx_productos_subcliente;
ALTER TABLE recetas.productos DROP COLUMN IF EXISTS id_subcliente;
DROP TABLE IF EXISTS recetas.subclientes;
