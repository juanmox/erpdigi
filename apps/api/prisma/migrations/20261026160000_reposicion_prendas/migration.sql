-- Qué PRENDAS se repusieron en una reposición (producto + talla + cantidad).
--
-- Hasta hoy una reposición se carga a la orden entera. Con atributos de producto
-- (estilo, línea, género, composición, marca, deporte) la estadística de calidad
-- necesita saber QUÉ prenda, y una reposición suele cubrir varias tallas a la vez
-- (el comentario legacy dice cosas como "M= 1 BK  XL= 1 FT").
--
-- Se elige por PRODUCTO y no por ítem de la OP: el mismo producto aparece en varios
-- ítems de una orden (3,141 casos) y es el producto el que trae todos los atributos.
-- Las yardas de papel y tela siguen siendo de la reposición ENTERA: no se reparten
-- entre prendas, y por eso esta tabla no lleva yardas.
--
-- Mismo patrón que `reposicion_insumo`. Solo agrega: las reposiciones existentes
-- quedan sin prendas, sin backfill (interpretar los comentarios legacy queda fuera
-- de alcance).

CREATE TABLE costeo.reposicion_prenda (
  id_reposicion_prenda SERIAL PRIMARY KEY,
  id_reposicion        INTEGER NOT NULL
    REFERENCES costeo.reposicion (id_reposicion) ON DELETE CASCADE ON UPDATE CASCADE,
  -- RESTRICT y no SET NULL: un producto o talla ya repuesto no se puede borrar,
  -- sería vaciar en silencio el dato que la estadística necesita.
  id_producto          INTEGER NOT NULL
    REFERENCES recetas.productos (id_producto) ON DELETE RESTRICT ON UPDATE CASCADE,
  id_talla             INTEGER NOT NULL
    REFERENCES recetas.tallas (id_talla) ON DELETE RESTRICT ON UPDATE CASCADE,
  cantidad             INTEGER NOT NULL,
  creado_en            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_reposicion_prenda_cantidad CHECK (cantidad > 0)
);

CREATE UNIQUE INDEX ux_reposicion_prenda
  ON costeo.reposicion_prenda (id_reposicion, id_producto, id_talla);
CREATE INDEX idx_reposicion_prenda_producto ON costeo.reposicion_prenda (id_producto);
CREATE INDEX idx_reposicion_prenda_talla ON costeo.reposicion_prenda (id_talla);

COMMENT ON TABLE costeo.reposicion_prenda IS
  'Prendas repuestas por una reposición. Sin yardas: esas son de la reposición entera.';
