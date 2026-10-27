-- Vista de prendas repuestas para los dashboards (Superset). UNA FILA POR PRENDA.
--
-- ⚠️ Depende de que exista el schema `analitica` (migración 20261025120000) y de
-- `costeo.reposicion_prenda` (20261026160000).
--
-- NO lleva yardas, a propósito: una reposición con varias prendas repetiría sus
-- yardas en cada fila y cualquier suma las contaría de más. Las yardas viven en
-- `analitica.v_reposiciones` (una fila por reposición). Para cruzar prendas con
-- yardas hay que ir por `codigo_repo`, nunca sumar yardas sobre esta vista.
--
-- Mismas reglas que el resto de `analitica`: sin anuladas, `id_empresa` para la
-- regla por fila, hora de Guatemala en `fecha_dia`.
CREATE VIEW analitica.v_reposicion_prendas AS
SELECT
  rp.id_reposicion_prenda,
  op.id_empresa,
  r.fecha,
  (r.fecha AT TIME ZONE 'America/Guatemala')::date                      AS fecha_dia,
  to_char(r.fecha AT TIME ZONE 'America/Guatemala', 'YYYY-MM')          AS anio_mes,
  r.codigo_repo,
  r.tipo,
  op.codigo                                                             AS codigo_op,
  cli.nombre                                                            AS cliente,
  sub.nombre                                                            AS marca,
  p.codigo                                                              AS producto,
  p.descripcion                                                         AS producto_descripcion,
  p.deporte,
  es.nombre                                                             AS estilo,
  li.nombre                                                             AS linea,
  ge.nombre                                                             AS genero,
  co.nombre                                                             AS composicion,
  t.nombre                                                              AS talla,
  rp.cantidad                                                           AS piezas,
  dep.nombre                                                            AS departamento,
  d.nombre                                                              AS defecto,
  d.categoria                                                           AS defecto_categoria,
  d.imputable_a
FROM costeo.reposicion_prenda rp
JOIN costeo.reposicion r ON r.id_reposicion = rp.id_reposicion
JOIN costeo.orden_produccion op ON op.id_orden_produccion = r.id_orden_produccion
JOIN recetas.productos p ON p.id_producto = rp.id_producto
JOIN recetas.tallas t ON t.id_talla = rp.id_talla
LEFT JOIN recetas.clientes cli ON cli.id_cliente = op.id_cliente
LEFT JOIN recetas.subclientes sub ON sub.id_subcliente = p.id_subcliente
LEFT JOIN recetas.estilos es ON es.id_estilo = p.id_estilo
LEFT JOIN recetas.lineas li ON li.id_linea = p.id_linea
LEFT JOIN recetas.generos ge ON ge.id_genero = p.id_genero
LEFT JOIN recetas.composiciones co ON co.id_composicion = p.id_composicion
LEFT JOIN costeo.departamento dep ON dep.id_departamento = r.id_departamento
LEFT JOIN costeo.defecto d ON d.id_defecto = r.id_defecto
WHERE r.anulado_en IS NULL;

COMMENT ON VIEW analitica.v_reposicion_prendas IS
  'Una fila por prenda repuesta (producto + talla + piezas). Sin yardas: ver v_reposiciones.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_lector') THEN
    GRANT SELECT ON analitica.v_reposicion_prendas TO bi_lector;
  END IF;
END
$$;
