-- Revierte 20261001120000_en_blanco_por_orden.
-- OJO: al volver el flag a la linea se pierde cual orden lo tenia marcado, y
-- las filas EN_BLANCO ya creadas dejan de ser representables.
DELETE FROM costeo.consumo_papel WHERE origen = 'EN_BLANCO';

ALTER TABLE costeo.linea_produccion
  ADD COLUMN consumo_en_blanco BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN factor_en_blanco NUMERIC(12,4) NOT NULL DEFAULT 0.6;

UPDATE costeo.linea_produccion l
   SET consumo_en_blanco = true
  FROM costeo.orden_produccion o
 WHERE o.id_orden_produccion = l.id_orden_produccion AND o.consumo_en_blanco;

DROP INDEX IF EXISTS costeo.ux_consumo_papel_en_blanco_orden;

ALTER TABLE costeo.consumo_papel DROP CONSTRAINT ck_consumo_papel_origen_regla;
ALTER TABLE costeo.consumo_papel
  ADD CONSTRAINT ck_consumo_papel_origen_regla CHECK (
       (origen = 'PRODUCCION' AND id_linea_produccion IS NOT NULL AND id_reposicion IS NULL)
    OR (origen = 'REPOSICION' AND id_reposicion IS NOT NULL)
  );

ALTER TABLE costeo.consumo_papel DROP CONSTRAINT ck_consumo_papel_origen;
ALTER TABLE costeo.consumo_papel
  ADD CONSTRAINT ck_consumo_papel_origen
  CHECK (origen IN ('PRODUCCION', 'REPOSICION'));

ALTER TABLE costeo.orden_produccion
  DROP CONSTRAINT ck_orden_en_blanco_yd,
  DROP COLUMN consumo_en_blanco,
  DROP COLUMN en_blanco_yd;
