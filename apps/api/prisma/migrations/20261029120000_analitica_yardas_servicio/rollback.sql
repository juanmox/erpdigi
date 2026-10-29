-- Restaura `piezas` a contar TODA la cantidad (yardas de servicio incluidas).
-- Las columnas nuevas (yardas_servicio, es_servicio) quedan: CREATE OR REPLACE VIEW no
-- puede quitar columnas, y quitarlas obligaría a recrear las 4 vistas dependientes.

CREATE OR REPLACE VIEW analitica.v_consumo AS
SELECT
  c.id_consumo_papel,
  op.id_empresa,
  c.fecha,
  (c.fecha AT TIME ZONE 'America/Guatemala')::date                      AS fecha_dia,
  to_char(c.fecha AT TIME ZONE 'America/Guatemala', 'YYYY-MM')          AS anio_mes,
  c.origen,
  op.codigo                                                             AS codigo_op,
  cli.nombre                                                            AS cliente,
  sub.nombre                                                            AS marca,
  op.orden_compra,
  lp.codigo_line                                                        AS item,
  p.codigo                                                              AS producto,
  p.descripcion                                                         AS producto_descripcion,
  p.desarrollo,
  p.deporte,
  COALESCE(es.nombre, es_op.nombre)                                     AS estilo,
  li.nombre                                                             AS linea,
  ge.nombre                                                             AS genero,
  co.nombre                                                             AS composicion,
  t.nombre                                                              AS talla,
  imp.codigo                                                            AS impresora,
  imp.grupo                                                             AS grupo_impresora,
  tp.nombre                                                             AS tipo_papel,
  rc.codigo                                                             AS rollo,
  c.cantidad                                                            AS piezas,
  c.consumo_yd                                                          AS impresion_yd,
  c.enguiamiento_yd,
  c.en_blanco_yd,
  c.consumo_yd + c.enguiamiento_yd + c.en_blanco_yd                     AS total_yd,
  of_.codigo                                                            AS codigo_of,
  of_.numero_factura,
  CASE WHEN t.nombre = 'YARDAS' THEN c.cantidad ELSE 0 END               AS yardas_servicio,
  COALESCE(t.nombre = 'YARDAS', false)                                  AS es_servicio
FROM costeo.consumo_papel c
JOIN costeo.orden_produccion op ON op.id_orden_produccion = c.id_orden_produccion
LEFT JOIN recetas.clientes cli ON cli.id_cliente = op.id_cliente
LEFT JOIN recetas.estilos es_op ON es_op.id_estilo = op.id_estilo
LEFT JOIN costeo.linea_produccion lp ON lp.id_linea_produccion = c.id_linea_produccion
LEFT JOIN recetas.productos p ON p.id_producto = COALESCE(c.id_producto, lp.id_producto)
LEFT JOIN recetas.subclientes sub ON sub.id_subcliente = p.id_subcliente
LEFT JOIN recetas.estilos es ON es.id_estilo = p.id_estilo
LEFT JOIN recetas.lineas li ON li.id_linea = p.id_linea
LEFT JOIN recetas.generos ge ON ge.id_genero = p.id_genero
LEFT JOIN recetas.composiciones co ON co.id_composicion = p.id_composicion
LEFT JOIN recetas.tallas t ON t.id_talla = c.id_talla
LEFT JOIN costeo.impresora imp ON imp.id_impresora = c.id_impresora
LEFT JOIN costeo.tipo_papel tp ON tp.id_tipo_papel = c.id_tipo_papel
LEFT JOIN costeo.v_rollo_codigo rc ON rc.id_rollo_papel = (
  SELECT m.id_rollo_papel FROM costeo.montaje_rollo m WHERE m.id_montaje_rollo = c.id_montaje_rollo
)
LEFT JOIN costeo.of_op ofo
  ON ofo.id_orden_produccion = op.id_orden_produccion AND ofo.anulado_en IS NULL
LEFT JOIN costeo.orden_facturacion of_
  ON of_.id_orden_facturacion = ofo.id_orden_facturacion AND of_.anulada_en IS NULL
WHERE c.anulado_en IS NULL
  AND c.origen <> 'REPOSICION';

CREATE OR REPLACE VIEW analitica.v_ordenes AS
WITH lineas AS (
  SELECT
    lp.id_orden_produccion,
    count(*)                                                            AS items,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM costeo.consumo_papel c
      WHERE c.id_linea_produccion = lp.id_linea_produccion
        AND c.origen = 'PRODUCCION' AND c.anulado_en IS NULL
    ))                                                                  AS items_impresos,
    COALESCE(sum((SELECT sum(lt.cantidad) FROM costeo.linea_produccion_talla lt
                  WHERE lt.id_linea_produccion = lp.id_linea_produccion)), 0) AS piezas,
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
         sum(en_blanco_yd) AS en_blanco_yd
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
  COALESCE(l.yardas_servicio, 0)                                         AS yardas_servicio
FROM costeo.orden_produccion op
LEFT JOIN recetas.clientes cli ON cli.id_cliente = op.id_cliente
LEFT JOIN lineas l ON l.id_orden_produccion = op.id_orden_produccion
LEFT JOIN consumo c ON c.id_orden_produccion = op.id_orden_produccion
LEFT JOIN repos rp ON rp.id_orden_produccion = op.id_orden_produccion
LEFT JOIN costeo.of_op ofo
  ON ofo.id_orden_produccion = op.id_orden_produccion AND ofo.anulado_en IS NULL
LEFT JOIN costeo.orden_facturacion of_
  ON of_.id_orden_facturacion = ofo.id_orden_facturacion AND of_.anulada_en IS NULL;
