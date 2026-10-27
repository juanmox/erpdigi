-- Revierte 20261027120000_reposicion_pieza.
--
-- ⚠️ Si hay prendas con varias piezas del mismo producto+talla, el UNIQUE viejo
-- no se puede restaurar: se fusionan sumando las piezas (se pierde QUÉ pieza era).
BEGIN;

DROP VIEW IF EXISTS analitica.v_reposicion_prendas;

CREATE TEMP TABLE _fusion AS
SELECT min(id_reposicion_prenda) AS id_conserva, id_reposicion, id_producto, id_talla,
       sum(cantidad)::int AS total
FROM costeo.reposicion_prenda
GROUP BY id_reposicion, id_producto, id_talla;

DELETE FROM costeo.reposicion_prenda rp
 WHERE NOT EXISTS (SELECT 1 FROM _fusion f WHERE f.id_conserva = rp.id_reposicion_prenda);
UPDATE costeo.reposicion_prenda rp SET cantidad = f.total
  FROM _fusion f WHERE f.id_conserva = rp.id_reposicion_prenda;

DROP INDEX costeo.ux_reposicion_prenda;
DROP INDEX costeo.idx_reposicion_prenda_pieza;
ALTER TABLE costeo.reposicion_prenda DROP CONSTRAINT reposicion_prenda_id_pieza_fkey;
ALTER TABLE costeo.reposicion_prenda DROP COLUMN id_pieza;
CREATE UNIQUE INDEX ux_reposicion_prenda
  ON costeo.reposicion_prenda (id_reposicion, id_producto, id_talla);

DROP TABLE costeo.pieza;

-- Vista anterior (sin `pieza`), tal como la dejó 20261026170000.
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_lector') THEN
    GRANT SELECT ON analitica.v_reposicion_prendas TO bi_lector;
  END IF;
END
$$;

COMMIT;
