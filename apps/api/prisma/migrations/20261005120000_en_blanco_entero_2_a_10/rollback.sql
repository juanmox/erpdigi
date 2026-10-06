-- Revierte 20261005120000_en_blanco_entero_2_a_10.
-- Vuelve a admitir cualquier valor >= 0, incluidos decimales.
ALTER TABLE costeo.orden_produccion DROP CONSTRAINT ck_orden_en_blanco_yd;
ALTER TABLE costeo.orden_produccion
  ADD CONSTRAINT ck_orden_en_blanco_yd CHECK (en_blanco_yd >= 0);
