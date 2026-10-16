-- Revierte 20261015140000_cliente_activo_y_guarda.
-- ⚠️ Devolver la FK a SET NULL reabre el agujero: borrar un cliente vuelve a
-- vaciar en silencio el cliente de todas sus órdenes.
ALTER TABLE costeo.orden_produccion
  DROP CONSTRAINT orden_produccion_id_cliente_fkey;
ALTER TABLE costeo.orden_produccion
  ADD CONSTRAINT orden_produccion_id_cliente_fkey
  FOREIGN KEY (id_cliente) REFERENCES recetas.clientes(id_cliente)
  ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE recetas.clientes DROP COLUMN IF EXISTS activo;
