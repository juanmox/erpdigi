-- Catálogo de PIEZAS de una prenda (cuello, manga, frontal…) y su uso en las
-- prendas repuestas: cada línea pasa de producto+talla+cantidad a
-- producto+talla+PIEZA+cantidad ("de la talla L del producto X se repusieron 3
-- mangas").
--
-- Sin consumo por pieza, por ahora: las yardas de papel y tela siguen siendo de
-- la reposición ENTERA. Un catálogo de consumo por pieza y talla vendrá después.
--
-- ⚠️ Depende de 20261026160000 (reposicion_prenda) y 20261026170000 (vista).
-- El catálogo se siembra AQUÍ y no en seed.ts: la FK es obligatoria y el seed no
-- corre solo en un despliegue (mismo criterio que las tallas de costeo).

CREATE TABLE costeo.pieza (
  id_pieza  SERIAL PRIMARY KEY,
  nombre    VARCHAR(80) NOT NULL,
  activo    BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sin repetir aunque difiera la mayúscula: "Manga Der" = "MANGA DER".
CREATE UNIQUE INDEX ux_pieza_nombre ON costeo.pieza (lower(nombre));

COMMENT ON TABLE costeo.pieza IS
  'Piezas que integran una prenda. Se RETIRAN (activo=false), no se borran.';

INSERT INTO costeo.pieza (nombre) VALUES
  ('BOLSAS'), ('CRONCH'), ('CUADRITOS'), ('CUELLO R'), ('CUELLO V'),
  ('TRASERA'), ('FRONTAL'),
  ('HOMBRERA DER'), ('HOMBRERA IZQ'),
  ('INSERTO DE COSTADO DER'), ('INSERTO DE COSTADO IZQ'), ('INSERTO DE RUEDO'),
  ('INSERTOS BOCA MANGA'), ('INSERTOS DE COSTADO'),
  ('MANGA DER'), ('MANGA IZQ'), ('PASADORES'),
  ('PIERNA BK DER'), ('PIERNA BK IZQ'),
  ('PIERNA COMPLETA DER'), ('PIERNA COMPLETA IZQ'),
  ('PIERNA FT DER'), ('PIERNA FT IZQ'),
  ('PRENDA COMPLETA'), ('PRETINA'), ('PUÑOS'), ('SOLAPAS'),
  ('TAPA COSTURAS'), ('TRIANGULO'), ('YOCK');

-- La pieza es obligatoria. Lo que hubiera de antes (solo existe en ambientes de
-- prueba: las prendas no se habían desplegado) era la prenda entera.
ALTER TABLE costeo.reposicion_prenda ADD COLUMN id_pieza INTEGER;
UPDATE costeo.reposicion_prenda
   SET id_pieza = (SELECT id_pieza FROM costeo.pieza WHERE nombre = 'PRENDA COMPLETA');
ALTER TABLE costeo.reposicion_prenda ALTER COLUMN id_pieza SET NOT NULL;
-- RESTRICT: una pieza ya usada no se borra (se retira).
ALTER TABLE costeo.reposicion_prenda
  ADD CONSTRAINT reposicion_prenda_id_pieza_fkey
  FOREIGN KEY (id_pieza) REFERENCES costeo.pieza (id_pieza)
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX costeo.ux_reposicion_prenda;
CREATE UNIQUE INDEX ux_reposicion_prenda
  ON costeo.reposicion_prenda (id_reposicion, id_producto, id_talla, id_pieza);
CREATE INDEX idx_reposicion_prenda_pieza ON costeo.reposicion_prenda (id_pieza);

-- Vista de analítica: gana la columna `pieza`. Se recrea (no CREATE OR REPLACE)
-- para dejarla junto a producto y talla.
DROP VIEW analitica.v_reposicion_prendas;
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
  pz.nombre                                                             AS pieza,
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
JOIN costeo.pieza pz ON pz.id_pieza = rp.id_pieza
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
  'Una fila por prenda y pieza repuesta (producto + talla + pieza + piezas). Sin yardas: ver v_reposiciones.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_lector') THEN
    GRANT SELECT ON analitica.v_reposicion_prendas TO bi_lector;
  END IF;
END
$$;
