-- Capa analítica para los tableros gerenciales (Apache Superset).
--
-- Los tableros NO leen las tablas de negocio: leen estas vistas, que aplican
-- UNA SOLA VEZ las mismas reglas que el ERP. Si cada tablero reescribiera
-- "qué cuenta como consumo", dos pantallas darían números distintos para la
-- misma pregunta. Reglas fijas en todas las vistas:
--   · lo anulado nunca aparece;
--   · las fechas se ofrecen también en hora de Guatemala (`fecha_dia`), porque
--     `fecha` es un instante UTC y un reporte de cierre de mes que cortara en
--     UTC perdería lo impreso por la tarde del último día;
--   · el papel que sale del rollo = impresión + enguiamiento + en blanco +
--     reposiciones (igual que `consumoPorMontajeIds` y el reporte de consumo);
--   · la tela va aparte y NO suma al papel.
--
-- ⚠️ Doble conteo a evitar: `consumo_papel` también guarda filas de
-- origen REPOSICION (las que descuentan del rollo), pero la mayoría de las
-- reposiciones —sobre todo las migradas del legacy— NO tienen fila ahí. Igual
-- que el reporte de consumo, `v_consumo` EXCLUYE el origen REPOSICION y las
-- reposiciones salen de `v_reposiciones`. Sumar las dos vistas completas es
-- correcto; sumar `consumo_papel` crudo más reposiciones no lo es.
--
-- Seguridad: las vistas son del dueño de la migración, y una vista ejecuta con
-- los permisos de su dueño. Por eso el rol de solo lectura `bi_lector` (que se
-- crea aparte, ver infra/bi/crear-rol-bi-lector.sql) solo necesita SELECT sobre
-- `analitica` y NO tiene acceso a `core` (usuarios, tokens) ni a las tablas
-- crudas.
--
-- Separación por empresa: toda vista de datos de Costeo lleva `id_empresa`
-- para que el ERP fije una regla por fila al generar el acceso del tablero.
-- `v_rollos` NO la lleva a propósito: la planta es una sola y los rollos son
-- compartidos (mismo criterio que Gestión de Rollos).
--
-- Dinero: separado en vistas `*_costo` para que solo los tableros financieros
-- las usen. Las vistas sin sufijo no traen un solo valor monetario.
--
-- Solo agrega objetos nuevos: no toca ninguna tabla existente.

CREATE SCHEMA IF NOT EXISTS analitica;

COMMENT ON SCHEMA analitica IS
  'Vistas de solo lectura para tableros (Superset). Reglas de negocio aplicadas una vez; sin dinero salvo vistas *_costo.';

-- ── Consumo de papel por talla / orden ──────────────────────────────
CREATE VIEW analitica.v_consumo AS
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
  of_.numero_factura
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

COMMENT ON VIEW analitica.v_consumo IS
  'Una fila por consumo vigente (PRODUCCION por talla; EN_BLANCO por orden). Excluye origen REPOSICION: ver v_reposiciones.';

-- ── Reposiciones ────────────────────────────────────────────────────
CREATE VIEW analitica.v_reposiciones AS
SELECT
  r.id_reposicion,
  op.id_empresa,
  r.fecha,
  (r.fecha AT TIME ZONE 'America/Guatemala')::date                      AS fecha_dia,
  to_char(r.fecha AT TIME ZONE 'America/Guatemala', 'YYYY-MM')          AS anio_mes,
  r.codigo_repo,
  r.tipo,
  op.codigo                                                             AS codigo_op,
  cli.nombre                                                            AS cliente,
  (
    SELECT string_agg(DISTINCT COALESCE(es.nombre, es_op.nombre), ', ' ORDER BY COALESCE(es.nombre, es_op.nombre))
    FROM costeo.linea_produccion lp
    JOIN recetas.productos p ON p.id_producto = lp.id_producto
    LEFT JOIN recetas.estilos es ON es.id_estilo = p.id_estilo
    LEFT JOIN recetas.estilos es_op ON es_op.id_estilo = op.id_estilo
    WHERE lp.id_orden_produccion = op.id_orden_produccion
  )                                                                     AS estilos,
  dep.nombre                                                            AS departamento,
  emp.nombres                                                           AS responsable,
  d.nombre                                                              AS defecto,
  d.categoria                                                           AS defecto_categoria,
  d.imputable_a,
  imp.codigo                                                            AS impresora,
  tp.nombre                                                             AS tipo_papel,
  r.yardas_papel,
  ins.descripcion                                                       AS tela,
  r.yardas_tela,
  (SELECT count(*) FROM costeo.reposicion_insumo ri WHERE ri.id_reposicion = r.id_reposicion)
                                                                        AS materiales_items,
  r.comentario
FROM costeo.reposicion r
JOIN costeo.orden_produccion op ON op.id_orden_produccion = r.id_orden_produccion
LEFT JOIN recetas.clientes cli ON cli.id_cliente = op.id_cliente
LEFT JOIN costeo.departamento dep ON dep.id_departamento = r.id_departamento
LEFT JOIN costeo.empleado emp ON emp.id_empleado = r.id_empleado
LEFT JOIN costeo.defecto d ON d.id_defecto = r.id_defecto
LEFT JOIN costeo.impresora imp ON imp.id_impresora = r.id_impresora
LEFT JOIN costeo.tipo_papel tp ON tp.id_tipo_papel = r.id_tipo_papel
LEFT JOIN recetas.insumos ins ON ins.id_insumo = r.id_insumo_tela
WHERE r.anulado_en IS NULL;

COMMENT ON VIEW analitica.v_reposiciones IS
  'Una fila por reposición vigente. yardas_tela va aparte y no suma al papel.';

-- ── Órdenes de producción ───────────────────────────────────────────
CREATE VIEW analitica.v_ordenes AS
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
                  WHERE lt.id_linea_produccion = lp.id_linea_produccion)), 0) AS piezas
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
  of_.fecha_factura
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
  'Una fila por OP con piezas, avance de impresión, yardas por concepto (total_yd = impresión + enguiamiento + en blanco + reposiciones) y su OF.';

-- ── Rollos de papel (inventario) ────────────────────────────────────
-- Sin id_empresa: la planta es una sola.
CREATE VIEW analitica.v_rollos AS
WITH consumo_rollo AS (
  SELECT m.id_rollo_papel,
         sum(c.consumo_yd + c.enguiamiento_yd + c.en_blanco_yd) AS consumido_yd,
         count(DISTINCT m.id_montaje_rollo)                     AS montajes
  FROM costeo.montaje_rollo m
  JOIN costeo.consumo_papel c ON c.id_montaje_rollo = m.id_montaje_rollo
  WHERE c.anulado_en IS NULL
  GROUP BY m.id_rollo_papel
)
SELECT
  r.id_rollo_papel,
  rc.codigo                                                             AS rollo,
  f.numero_factura,
  f.fecha                                                               AS fecha_factura,
  (CURRENT_DATE - f.fecha)                                              AS antiguedad_dias,
  CASE
    WHEN CURRENT_DATE - f.fecha <= 30  THEN '0-30 días'
    WHEN CURRENT_DATE - f.fecha <= 90  THEN '31-90 días'
    WHEN CURRENT_DATE - f.fecha <= 180 THEN '91-180 días'
    WHEN CURRENT_DATE - f.fecha <= 365 THEN '181-365 días'
    ELSE 'Más de 1 año'
  END                                                                   AS tramo_antiguedad,
  tp.nombre                                                             AS tipo_papel,
  r.estado,
  ub.nombre                                                             AS ubicacion,
  r.yardas_iniciales,
  COALESCE(cr.consumido_yd, 0)                                          AS consumido_yd,
  r.yardas_iniciales - COALESCE(cr.consumido_yd, 0)                     AS restante_yd,
  imp.codigo                                                            AS impresora_actual
FROM costeo.rollo_papel r
JOIN costeo.factura_papel f ON f.id_factura_papel = r.id_factura_papel
JOIN costeo.v_rollo_codigo rc ON rc.id_rollo_papel = r.id_rollo_papel
LEFT JOIN costeo.tipo_papel tp ON tp.id_tipo_papel = r.id_tipo_papel
LEFT JOIN costeo.ubicacion ub ON ub.id_ubicacion = r.id_ubicacion
LEFT JOIN consumo_rollo cr ON cr.id_rollo_papel = r.id_rollo_papel
LEFT JOIN costeo.montaje_rollo mv
  ON mv.id_rollo_papel = r.id_rollo_papel AND mv.desmontado_en IS NULL
LEFT JOIN costeo.impresora imp ON imp.id_impresora = mv.id_impresora;

COMMENT ON VIEW analitica.v_rollos IS
  'Inventario de rollos sin dinero. CONSUMIDO_FUERA: su consumo no está en el ERP, excluirlos de cualquier comparación comprado-vs-consumido.';

CREATE VIEW analitica.v_rollos_costo AS
SELECT
  v.id_rollo_papel,
  v.rollo,
  v.tipo_papel,
  v.estado,
  v.yardas_iniciales,
  v.restante_yd,
  r.costo_unitario                                                      AS costo_por_yarda,
  v.yardas_iniciales * r.costo_unitario                                 AS valor_inicial,
  v.restante_yd * r.costo_unitario                                      AS valor_restante
FROM analitica.v_rollos v
JOIN costeo.rollo_papel r ON r.id_rollo_papel = v.id_rollo_papel;

COMMENT ON VIEW analitica.v_rollos_costo IS
  'Valorización de rollos. Costo por yarda; NULL cuando el rollo no trae costo (no se inventa un 0).';

-- ── Órdenes de facturación ──────────────────────────────────────────
CREATE VIEW analitica.v_facturacion AS
SELECT
  of_.id_orden_facturacion,
  of_.id_empresa,
  of_.codigo                                                            AS codigo_of,
  of_.fecha,
  of_.fecha_factura,
  to_char(COALESCE(of_.fecha_factura, of_.fecha), 'YYYY-MM')            AS anio_mes,
  of_.numero_factura,
  cli.nombre                                                            AS cliente,
  ts.nombre                                                             AS tipo_servicio,
  of_.cantidad_facturada,
  of_.cerrada_en,
  (SELECT count(*) FROM costeo.of_op o
   WHERE o.id_orden_facturacion = of_.id_orden_facturacion AND o.anulado_en IS NULL) AS ordenes,
  (SELECT COALESCE(sum(v.piezas), 0) FROM analitica.v_ordenes v
   JOIN costeo.of_op o ON o.id_orden_produccion = v.id_orden_produccion
   WHERE o.id_orden_facturacion = of_.id_orden_facturacion AND o.anulado_en IS NULL) AS piezas,
  (SELECT COALESCE(sum(v.total_yd), 0) FROM analitica.v_ordenes v
   JOIN costeo.of_op o ON o.id_orden_produccion = v.id_orden_produccion
   WHERE o.id_orden_facturacion = of_.id_orden_facturacion AND o.anulado_en IS NULL) AS total_yd
FROM costeo.orden_facturacion of_
LEFT JOIN recetas.clientes cli ON cli.id_cliente = of_.id_cliente
LEFT JOIN costeo.tipo_servicio ts ON ts.id_tipo_servicio = of_.id_tipo_servicio
WHERE of_.anulada_en IS NULL;

COMMENT ON VIEW analitica.v_facturacion IS
  'Una fila por OF vigente con sus OP, piezas y yardas. Sin dinero: ver v_facturacion_costo.';

CREATE VIEW analitica.v_facturacion_costo AS
SELECT
  f.id_orden_facturacion,
  f.id_empresa,
  f.codigo_of,
  f.anio_mes,
  f.cliente,
  f.tipo_servicio,
  of_.venta_total,
  of_.mod_valor,
  of_.gf_valor,
  of_.fijos_valor
FROM analitica.v_facturacion f
JOIN costeo.orden_facturacion of_ ON of_.id_orden_facturacion = f.id_orden_facturacion;

COMMENT ON VIEW analitica.v_facturacion_costo IS
  'Importes de la OF (venta, MOD, GF, fijos). Solo para tableros con permiso financiero.';

-- ── Costo estándar por OP vs consumo real en yardas ─────────────────
-- Estándar = costo del desarrollo (insumos + mano de obra estándar) × piezas.
-- Es una REFERENCIA, no el costo real: el costo real en quetzales llega con F5
-- y con la captura de mano de obra real.
CREATE VIEW analitica.v_costo_op AS
-- Una sola agregación por orden (no subconsultas por fila): la versión con
-- subconsultas correlacionadas tardaba 15 s en agrupar las 6,675 órdenes.
WITH costo AS (
  SELECT lp.id_orden_produccion,
         sum(pc.costo_insumos * lt.cantidad)    AS costo_insumos,
         sum(pc.costo_mano_obra * lt.cantidad)  AS costo_mano_obra
  FROM costeo.linea_produccion lp
  JOIN costeo.linea_produccion_talla lt ON lt.id_linea_produccion = lp.id_linea_produccion
  JOIN recetas.v_producto_costo pc ON pc.id_producto = lp.id_producto
  GROUP BY lp.id_orden_produccion
)
SELECT
  o.id_orden_produccion,
  o.id_empresa,
  o.codigo_op,
  o.cliente,
  o.fecha_impresion,
  to_char(o.fecha_impresion, 'YYYY-MM')                                AS anio_mes,
  o.codigo_of,
  o.piezas,
  o.total_yd,
  COALESCE(c.costo_insumos, 0)                                          AS costo_estandar_insumos,
  COALESCE(c.costo_mano_obra, 0)                                        AS costo_estandar_mano_obra
FROM analitica.v_ordenes o
LEFT JOIN costo c ON c.id_orden_produccion = o.id_orden_produccion;

COMMENT ON VIEW analitica.v_costo_op IS
  'Costo estándar de receta × piezas por OP junto a sus yardas reales. Referencia, no costo real. Solo tableros financieros.';

-- ── Permisos: solo si el rol de lectura ya existe ───────────────────
-- El rol lo crea un superusuario (infra/bi/crear-rol-bi-lector.sql): el rol
-- dueño de esta migración no tiene CREATEROLE en el servidor. Si el rol aún
-- no existe, estos GRANT se aplican después con el mismo script.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_lector') THEN
    GRANT USAGE ON SCHEMA analitica TO bi_lector;
    GRANT SELECT ON ALL TABLES IN SCHEMA analitica TO bi_lector;
  END IF;
END
$$;
