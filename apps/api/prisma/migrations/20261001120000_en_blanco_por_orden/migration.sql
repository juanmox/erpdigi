-- El "en blanco" pasa de ser un factor POR PRENDA a un monto fijo POR ORDEN.
--
-- La regla vigente (`cantidad * 0.6` por talla) daba números sin sentido físico:
-- medido sobre los datos reales, la OP 26OP013300 (396 piezas) habría cargado
-- 237.60 yd contra las 4 que corresponden — 59 veces de más, o sea el 20% de un
-- rollo entero de ~1,100 yd en una sola orden.
--
-- El cambio no es solo de fórmula. Hasta hoy el "en blanco" se calculaba DENTRO
-- de la captura de cada talla, y por eso quedaba congelado al enviar: prenderlo
-- después no cambiaba nada y reenviar tampoco lo corregía (bug real encontrado
-- el 2026-09-29 en la OP 26OP012625). Al pasar a ser su PROPIA fila de consumo,
-- deja de depender de la captura: se puede cargar antes, durante o después, el
-- índice único de abajo hace imposible cobrarlo dos veces, y deshacerlo es
-- anular una fila con autor y motivo en vez de editar un flag en silencio.

-- 1) El flag y el monto, a nivel de ORDEN ------------------------------------
-- `en_blanco_yd` por orden y no una constante en código: el valor estándar vive
-- en el DEFAULT y una orden puntual puede llevar otro sin desplegar, mismo
-- criterio que `linea_produccion.factor_enguiamiento`.
ALTER TABLE costeo.orden_produccion
  ADD COLUMN consumo_en_blanco BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN en_blanco_yd NUMERIC(12,4) NOT NULL DEFAULT 4;

COMMENT ON COLUMN costeo.orden_produccion.consumo_en_blanco IS
  'Si esta orden lleva consumo de papel en blanco. Lo marca Impresion de OPs y genera UNA fila en consumo_papel con origen=EN_BLANCO.';
COMMENT ON COLUMN costeo.orden_produccion.en_blanco_yd IS
  'Yardas fijas de papel en blanco de esta orden. Fijo por ORDEN, no por prenda: una orden de 500 piezas gasta lo mismo que una de 1.';

ALTER TABLE costeo.orden_produccion
  ADD CONSTRAINT ck_orden_en_blanco_yd CHECK (en_blanco_yd >= 0);

-- Backfill: una orden lleva papel en blanco si CUALQUIERA de sus lineas lo
-- tenia marcado. Es la lectura correcta del dato viejo — el flag por linea
-- siempre quiso decir "esta orden gasta papel en blanco", solo que estaba
-- guardado en el lugar equivocado.
UPDATE costeo.orden_produccion o
   SET consumo_en_blanco = true
 WHERE EXISTS (SELECT 1 FROM costeo.linea_produccion l
                WHERE l.id_orden_produccion = o.id_orden_produccion
                  AND l.consumo_en_blanco);

-- 2) consumo_papel admite el origen nuevo ------------------------------------
ALTER TABLE costeo.consumo_papel DROP CONSTRAINT ck_consumo_papel_origen;
ALTER TABLE costeo.consumo_papel
  ADD CONSTRAINT ck_consumo_papel_origen
  CHECK (origen IN ('PRODUCCION', 'REPOSICION', 'EN_BLANCO'));

-- Una fila EN_BLANCO es de la ORDEN, no de una linea ni de una talla: el CHECK
-- lo impone en vez de confiar en que el servicio lo recuerde.
ALTER TABLE costeo.consumo_papel DROP CONSTRAINT ck_consumo_papel_origen_regla;
ALTER TABLE costeo.consumo_papel
  ADD CONSTRAINT ck_consumo_papel_origen_regla CHECK (
       (origen = 'PRODUCCION' AND id_linea_produccion IS NOT NULL AND id_reposicion IS NULL)
    OR (origen = 'REPOSICION' AND id_reposicion IS NOT NULL)
    OR (origen = 'EN_BLANCO'  AND id_linea_produccion IS NULL
                              AND id_reposicion IS NULL
                              AND id_talla IS NULL
                              AND id_producto IS NULL)
  );

-- Cobrarlo dos veces queda imposible a nivel de base, no por cuidado del
-- codigo. Mismo criterio que ux_consumo_papel_produccion_natural.
CREATE UNIQUE INDEX ux_consumo_papel_en_blanco_orden
  ON costeo.consumo_papel (id_orden_produccion)
  WHERE origen = 'EN_BLANCO' AND anulado_en IS NULL;

-- 3) Se van las columnas de la linea -----------------------------------------
-- Dejarlas seria tener DOS fuentes de verdad para el mismo flag, que es
-- exactamente el patron que produjo el bug que esta migracion cierra. El dato
-- ya quedo subido a la orden en el backfill de arriba.
ALTER TABLE costeo.linea_produccion
  DROP COLUMN consumo_en_blanco,
  DROP COLUMN factor_en_blanco;
