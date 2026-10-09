-- La línea de producto deja de ser POR CLIENTE y pasa a ser un catálogo global.
--
-- Por qué estaba por cliente: en el legacy el campo CLIENTE traía el cliente y
-- la línea pegados ("BSN Jersey", "BSN Short" — ANEXO_A §2.3). Al separarlos,
-- la línea quedó colgando del cliente porque así venía en el origen, no porque
-- se hubiera verificado que lo necesitara.
--
-- Por qué cambia (pregunta del usuario, 2026-10-09): `Jersey` y `Short` son
-- TIPOS DE PRENDA, no algo de BSN. Por cliente, con 100 clientes habría que
-- crear "Jersey" 100 veces, y una estadística por línea —que es justamente
-- para lo que la quiere— tendría que agrupar por texto entre clientes. Es el
-- mismo problema que ya se corrigió con el `deporte`, que se dejó en el
-- PRODUCTO para que `Volleyball` y `Voleibol` no fueran dos cosas distintas.
--
-- Medido antes de migrar: producción tenía 0 líneas y local 2 sin nombres
-- repetidos, así que no hay nada que fusionar. El momento es el barato.
--
-- ⚠️ Si alguna vez hubiera dos clientes con el mismo nombre de línea, el UNIQUE
-- nuevo fallaría y habría que repuntar `orden_produccion.id_linea_producto`
-- hacia la fila que sobrevive ANTES de borrar la otra. Esta guarda aborta la
-- migración en vez de dejar el trabajo a medias.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT nombre FROM costeo.linea_producto GROUP BY nombre HAVING count(*) > 1
  ) x;
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay % nombre(s) de línea repetidos entre clientes. Fusionalos y repuntá orden_produccion.id_linea_producto antes de correr esta migración.', n;
  END IF;
END $$;

ALTER TABLE "costeo"."linea_producto"
  DROP CONSTRAINT IF EXISTS "linea_producto_id_cliente_nombre_key";

ALTER TABLE "costeo"."linea_producto"
  DROP CONSTRAINT IF EXISTS "linea_producto_id_cliente_fkey";

ALTER TABLE "costeo"."linea_producto"
  DROP COLUMN "id_cliente";

ALTER TABLE "costeo"."linea_producto"
  ADD CONSTRAINT "linea_producto_nombre_key" UNIQUE ("nombre");

-- `plantilla_insumo.id_linea_producto` NO se toca: sigue colgando de la línea.
-- Si en F5 resulta que un mismo tipo de prenda lleva insumos distintos según el
-- cliente, el cliente va ahí —en la plantilla— y no acá: así el catálogo de
-- líneas se mantiene único y la variación queda donde de verdad ocurre.
