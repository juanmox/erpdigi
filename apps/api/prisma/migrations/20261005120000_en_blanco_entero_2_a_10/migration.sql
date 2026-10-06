-- El papel en blanco deja de ser un monto fijo de 4 yd: ahora el operario
-- elige un ENTERO entre 2 y 10 al marcar la orden.
--
-- El rango va en la base y no solo en el DTO porque es una regla de negocio,
-- no una conveniencia de la pantalla: un POST armado a mano o una corrección
-- por SQL tienen que chocar con el mismo límite que el formulario.
--
-- `trunc()` impone el "entero" sin cambiar el tipo de la columna. Se mantiene
-- NUMERIC(12,4) a propósito: todas las yardas del schema lo son, y pasarla a
-- entero obligaría a convertir en cada suma contra consumo_yd/enguiamiento_yd.
ALTER TABLE costeo.orden_produccion DROP CONSTRAINT ck_orden_en_blanco_yd;

ALTER TABLE costeo.orden_produccion
  ADD CONSTRAINT ck_orden_en_blanco_yd
  CHECK (en_blanco_yd >= 2 AND en_blanco_yd <= 10 AND en_blanco_yd = trunc(en_blanco_yd));

COMMENT ON COLUMN costeo.orden_produccion.en_blanco_yd IS
  'Yardas fijas de papel en blanco de esta orden: entero entre 2 y 10, elegido al marcarla. Fijo por ORDEN, no por prenda.';
