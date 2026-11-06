-- Envío PARCIAL (por tandas) de las líneas de servicio de sublimación (talla YARDAS).
--
-- Un servicio puede pedir más yardas de las que le quedan al rollo montado
-- (ej.: 1,500 yd con un rollo de 1,193). El operario envía lo que cabe contra ESE
-- rollo y el resto contra el siguiente, así que una línea+talla YARDAS pasa a
-- poder tener VARIOS consumos vigentes, uno por rollo.
--
--   · `consumo_papel.tanda`: número de envío dentro de la misma línea+talla. Las
--     prendas siguen siendo siempre tanda 1, así que la base les sigue rechazando
--     un segundo envío; solo las YARDAS (decisión de código) usan 2, 3, ...
--   · El índice único pasa de (línea, talla) a (línea, talla, tanda). Que la suma
--     de las tandas no pase de lo pedido lo valida el servidor, bajo bloqueo de la
--     línea.
--   · `analitica.v_ordenes`: un servicio a medias NO cuenta como ítem impreso.

ALTER TABLE costeo.consumo_papel
  ADD COLUMN tanda smallint NOT NULL DEFAULT 1;
ALTER TABLE costeo.consumo_papel
  ADD CONSTRAINT ck_consumo_papel_tanda CHECK (tanda >= 1);

DROP INDEX costeo.ux_consumo_papel_produccion_natural;
CREATE UNIQUE INDEX ux_consumo_papel_produccion_natural
  ON costeo.consumo_papel (id_linea_produccion, id_talla, tanda)
  WHERE origen = 'PRODUCCION' AND anulado_en IS NULL;

CREATE OR REPLACE VIEW analitica.v_ordenes AS
WITH lineas AS (
  SELECT
    lp.id_orden_produccion,
    count(*)                                                            AS items,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM costeo.consumo_papel c
      WHERE c.id_linea_produccion = lp.id_linea_produccion
        AND c.origen = 'PRODUCCION' AND c.anulado_en IS NULL
    )
    -- Un servicio enviado a medias (por tandas) todavía NO está impreso: le
    -- faltan yardas por enviar.
    AND NOT EXISTS (
      SELECT 1 FROM costeo.linea_produccion_talla lt
      JOIN recetas.tallas t ON t.id_talla = lt.id_talla AND t.nombre = 'YARDAS'
      WHERE lt.id_linea_produccion = lp.id_linea_produccion
        AND lt.cantidad > COALESCE((
          SELECT sum(c.cantidad) FROM costeo.consumo_papel c
          WHERE c.id_linea_produccion = lp.id_linea_produccion
            AND c.id_talla = lt.id_talla
            AND c.origen = 'PRODUCCION' AND c.anulado_en IS NULL
        ), 0)
    ))                                                                  AS items_impresos,
    COALESCE(sum((SELECT sum(lt.cantidad) FROM costeo.linea_produccion_talla lt
                  JOIN recetas.tallas t ON t.id_talla = lt.id_talla
                  WHERE lt.id_linea_produccion = lp.id_linea_produccion
                    AND t.nombre <> 'YARDAS')), 0)                      AS piezas,
    COALESCE(sum((SELECT sum(lt.cantidad) FROM costeo.linea_produccion_talla lt
                  JOIN recetas.tallas t ON t.id_talla = lt.id_talla
                  WHERE lt.id_linea_produccion = lp.id_linea_produccion
                    AND t.nombre = 'YARDAS')), 0)                       AS yardas_servicio
  FROM costeo.linea_produccion lp
  GROUP BY lp.id_orden_produccion
),
consumo AS (
  SELECT id_orden_produccion,
         min(fecha) AS primer_consumo,
         sum(consumo_yd) AS impresion_yd,
         sum(enguiamiento_yd) AS enguiamiento_yd,
         sum(en_blanco_yd) AS en_blanco_yd,
         -- Servicios migrados del legacy: yardas sueltas, sin talla (ver arriba).
         COALESCE(sum(cantidad) FILTER (WHERE id_talla IS NULL AND origen = 'PRODUCCION'), 0) AS yardas_sin_talla
  FROM costeo.consumo_papel
  WHERE anulado_en IS NULL AND origen <> 'REPOSICION'
  GROUP BY id_orden_produccion
),
repos AS (
  SELECT id_orden_produccion, count(*) AS reposiciones, sum(yardas_papel) AS reposicion_yd
  FROM costeo.reposicion
  WHERE anulado_en IS NULL
  GROUP BY id_orden_produccion
)
SELECT
  op.id_orden_produccion,
  op.id_empresa,
  op.codigo                                                             AS codigo_op,
  op.anio,
  cli.nombre                                                            AS cliente,
  op.orden_compra,
  op.fecha_recibido,
  op.fecha_compromiso,
  -- Fecha en que se imprimió por primera vez (hora de Guatemala). Es la fecha útil
  -- para series de tiempo: `fecha_recibido` viene vacía en el 99% de las órdenes
  -- migradas del legacy y trae años absurdos (2001) en otras.
  (c.primer_consumo AT TIME ZONE 'America/Guatemala')::date             AS fecha_impresion,
  op.estatus,
  COALESCE(l.items, 0)                                                  AS items,
  COALESCE(l.items_impresos, 0)                                         AS items_impresos,
  COALESCE(l.items, 0) - COALESCE(l.items_impresos, 0)                  AS items_pendientes,
  CASE
    WHEN COALESCE(l.items, 0) = 0 THEN 'SIN_ITEMS'
    WHEN l.items_impresos = 0 THEN 'PENDIENTE'
    WHEN l.items_impresos < l.items THEN 'PARCIAL'
    ELSE 'IMPRESA'
  END                                                                   AS estado_impresion,
  COALESCE(l.piezas, 0)                                                 AS piezas,
  COALESCE(c.impresion_yd, 0)                                           AS impresion_yd,
  COALESCE(c.enguiamiento_yd, 0)                                        AS enguiamiento_yd,
  COALESCE(c.en_blanco_yd, 0)                                           AS en_blanco_yd,
  COALESCE(rp.reposiciones, 0)                                          AS reposiciones,
  COALESCE(rp.reposicion_yd, 0)                                         AS reposicion_yd,
  COALESCE(c.impresion_yd, 0) + COALESCE(c.enguiamiento_yd, 0)
    + COALESCE(c.en_blanco_yd, 0) + COALESCE(rp.reposicion_yd, 0)       AS total_yd,
  of_.codigo                                                            AS codigo_of,
  of_.numero_factura,
  of_.fecha_factura,
  COALESCE(l.yardas_servicio, 0) + COALESCE(c.yardas_sin_talla, 0)       AS yardas_servicio
FROM costeo.orden_produccion op
LEFT JOIN recetas.clientes cli ON cli.id_cliente = op.id_cliente
LEFT JOIN lineas l ON l.id_orden_produccion = op.id_orden_produccion
LEFT JOIN consumo c ON c.id_orden_produccion = op.id_orden_produccion
LEFT JOIN repos rp ON rp.id_orden_produccion = op.id_orden_produccion
LEFT JOIN costeo.of_op ofo
  ON ofo.id_orden_produccion = op.id_orden_produccion AND ofo.anulado_en IS NULL
LEFT JOIN costeo.orden_facturacion of_
  ON of_.id_orden_facturacion = ofo.id_orden_facturacion AND of_.anulada_en IS NULL;

COMMENT ON VIEW analitica.v_ordenes IS
  'Una fila por OP con piezas (sin yardas de servicio), avance de impresión (un servicio enviado a medias no cuenta como impreso), yardas por concepto (total_yd = impresión + enguiamiento + en blanco + reposiciones) y su OF.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_lector') THEN
    GRANT SELECT ON analitica.v_ordenes TO bi_lector;
  END IF;
END
$$;
