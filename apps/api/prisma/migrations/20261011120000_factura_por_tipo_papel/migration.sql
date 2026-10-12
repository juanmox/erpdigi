-- Una fila de `factura_papel` pasa a ser la factura POR TIPO DE PAPEL, o sea
-- el ARTÍCULO, no la factura entera.
--
-- Motivo real (bodega, 2026-10-11): una factura del proveedor trae varios
-- artículos. El UNIQUE sobre `numero_factura` dejaba cargar el número una sola
-- vez, así que el segundo artículo se cargó con el número + "-2" para
-- esquivarlo. Eso rompe la correspondencia con la etiqueta física: el código
-- del rollo es `<numero_factura>-<total_rollos>-<secuencia>` (vista
-- `v_rollo_codigo`), y los rollos vienen etiquetados desde el 1 por artículo.
--
-- Con el artículo como fila, cada uno lleva su tipo de papel, su propio
-- `total_rollos` y sus secuencias desde 1, así que el código vuelve a decir lo
-- mismo que la etiqueta.

-- Guard: el tipo de papel de la factura se deriva de sus rollos, así que no
-- puede haber hoy ninguna con más de uno. Aborta en vez de elegir uno.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT f.id_factura_papel
      FROM costeo.factura_papel f
      JOIN costeo.rollo_papel r ON r.id_factura_papel = f.id_factura_papel
     GROUP BY f.id_factura_papel
    HAVING count(DISTINCT r.id_tipo_papel) > 1
  ) t;
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay % factura(s) con más de un tipo de papel entre sus rollos. Hay que partirlas a mano (una fila por artículo) antes de aplicar esta migración.', n;
  END IF;
END $$;

-- Guard: una factura sin rollos no tiene de dónde derivar su tipo.
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM costeo.factura_papel f
   WHERE NOT EXISTS (SELECT 1 FROM costeo.rollo_papel r
                      WHERE r.id_factura_papel = f.id_factura_papel);
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay % factura(s) sin ningún rollo: no se puede derivar su tipo de papel. Hay que asignárselo a mano antes de aplicar esta migración.', n;
  END IF;
END $$;

ALTER TABLE costeo.factura_papel ADD COLUMN id_tipo_papel INTEGER;

UPDATE costeo.factura_papel f
   SET id_tipo_papel = (SELECT min(r.id_tipo_papel)
                          FROM costeo.rollo_papel r
                         WHERE r.id_factura_papel = f.id_factura_papel);

ALTER TABLE costeo.factura_papel ALTER COLUMN id_tipo_papel SET NOT NULL;

ALTER TABLE costeo.factura_papel
  ADD CONSTRAINT factura_papel_id_tipo_papel_fkey
  FOREIGN KEY (id_tipo_papel) REFERENCES costeo.tipo_papel(id_tipo_papel)
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- Deshace el apaño del "-2". Los rollos de esas facturas ya están numerados
-- desde 1, así que no hay que renumerar nada: el código pasa de
-- `140525599-2-20-1` a `140525599-20-1`, que es lo que dice la etiqueta.
-- El NOT EXISTS lo deja sin efecto si el par (número real, tipo) ya existiera
-- —no se puede dar hoy, pero así la migración no falla si alguien lo arregló a
-- mano antes.
UPDATE costeo.factura_papel f
   SET numero_factura = left(f.numero_factura, length(f.numero_factura) - 2)
 WHERE f.numero_factura IN ('140525599-2', '427445698-2')
   AND NOT EXISTS (
     SELECT 1 FROM costeo.factura_papel o
      WHERE o.numero_factura = left(f.numero_factura, length(f.numero_factura) - 2)
        AND o.id_tipo_papel = f.id_tipo_papel);

-- El UNIQUE deja de ser por número y pasa a ser por (número, tipo de papel).
-- Es MÁS permisivo que el anterior, así que no puede invalidar datos que ya
-- estén cargados.
DROP INDEX costeo.factura_papel_numero_factura_key;

CREATE UNIQUE INDEX factura_papel_numero_factura_id_tipo_papel_key
  ON costeo.factura_papel (numero_factura, id_tipo_papel);

-- Lo que sigue es lo que garantiza EN LA BASE que el tipo de papel de un rollo
-- sea siempre el de su artículo: una FK compuesta hacia el par de la factura.
-- Mismo recurso que `(id_orden_produccion, id_empresa)` en la separación por
-- empresa — y como ahí, el UNIQUE del destino es redundante como restricción
-- (`id_factura_papel` ya es la PK) pero Postgres lo exige para poder apuntarle
-- una FK. No se modela en Prisma: ver el comentario en `costeo.prisma`.
ALTER TABLE costeo.factura_papel
  ADD CONSTRAINT factura_papel_id_factura_papel_id_tipo_papel_key
  UNIQUE (id_factura_papel, id_tipo_papel);

ALTER TABLE costeo.rollo_papel
  ADD CONSTRAINT rollo_papel_id_factura_papel_id_tipo_papel_fkey
  FOREIGN KEY (id_factura_papel, id_tipo_papel)
  REFERENCES costeo.factura_papel (id_factura_papel, id_tipo_papel)
  ON UPDATE CASCADE ON DELETE RESTRICT;
