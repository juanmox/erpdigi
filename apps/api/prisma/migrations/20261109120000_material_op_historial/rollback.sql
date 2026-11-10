-- Deshace 20261109120000_material_op_historial.
-- Se pierde el historial de cambios de los ítems (el estado actual de cada ítem no cambia).
-- Después: DELETE FROM _prisma_migrations WHERE migration_name = '20261109120000_material_op_historial';
DROP TABLE IF EXISTS costeo.material_op_historial;
