-- Rollback de 20261011120000_factura_por_tipo_papel.
--
-- ⚠️ Vuelve el UNIQUE a ser por `numero_factura` solo, que es MÁS estricto que
-- el actual: si después de aplicar la migración se cargó el mismo número con
-- dos tipos de papel distintos, este rollback FALLA (y debe fallar — elegir
-- cuál de los dos artículos sobrevive no es decisión de un script).
-- El guard de abajo lo dice con un mensaje claro en vez de dejar el error
-- crudo del índice.
--
-- Tampoco vuelve a ponerle el "-2" a las dos facturas renombradas: ese era un
-- apaño, no un dato. Si hiciera falta, está comentado al final.

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT numero_factura FROM costeo.factura_papel
     GROUP BY numero_factura HAVING count(*) > 1
  ) t;
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay % número(s) de factura cargados con más de un tipo de papel. El UNIQUE viejo no los admite: hay que decidir a mano qué pasa con cada artículo antes de revertir.', n;
  END IF;
END $$;

ALTER TABLE costeo.rollo_papel
  DROP CONSTRAINT rollo_papel_id_factura_papel_id_tipo_papel_fkey;

ALTER TABLE costeo.factura_papel
  DROP CONSTRAINT factura_papel_id_factura_papel_id_tipo_papel_key;

DROP INDEX costeo.factura_papel_numero_factura_id_tipo_papel_key;

CREATE UNIQUE INDEX factura_papel_numero_factura_key
  ON costeo.factura_papel (numero_factura);

ALTER TABLE costeo.factura_papel DROP CONSTRAINT factura_papel_id_tipo_papel_fkey;
ALTER TABLE costeo.factura_papel DROP COLUMN id_tipo_papel;

-- Si hiciera falta recuperar el apaño:
-- UPDATE costeo.factura_papel SET numero_factura = numero_factura || '-2'
--  WHERE id_factura_papel IN (...);
