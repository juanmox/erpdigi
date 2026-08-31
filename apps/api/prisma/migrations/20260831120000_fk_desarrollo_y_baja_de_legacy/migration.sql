-- Cierre del acoplamiento con 01_erp (el ERP legacy, solo-Recetas y sin
-- autenticación), que el usuario confirmó apagar el 2026-08-31: nunca tuvo
-- usuarios reales, y todos sus endpoints ya existen en el ERP nuevo.
--
-- Mientras seguía encendido, tres cosas quedaron a medias a propósito:
--   1. No se podía poner la FK productos.desarrollo -> desarrollos.codigo,
--      porque 01_erp ESCRIBE esa columna como texto libre en 4 endpoints y la
--      FK los habría roto con 23503.
--   2. recetas.producto_insumos quedó congelada como red de seguridad para él.
--   3. v_producto_costo tuvo que conservar sus 6 columnas exactas y usar
--      LEFT JOIN + COALESCE para que 01_erp siguiera leyendo sin romperse.
-- Con el legacy apagado, las tres se resuelven acá.

-- ---------------------------------------------------------------------------
-- 1) La FK, que es lo que de verdad se venía a ganar
-- ---------------------------------------------------------------------------
-- Precondición verificada antes de escribir esto: 1,285 productos, 0 con
-- desarrollo NULL y 0 apuntando a un código inexistente. Si esto no se cumple,
-- el ALTER falla y la migración aborta: es la red que queremos.
ALTER TABLE "recetas"."productos"
  ALTER COLUMN "desarrollo" SET NOT NULL;

-- ON UPDATE CASCADE: si algún día se renombra el código de un desarrollo, el
-- producto lo sigue. ON DELETE RESTRICT: no se puede borrar un desarrollo que
-- tenga producto — la misma regla que ya imponía el backend, ahora en la base.
ALTER TABLE "recetas"."productos"
  ADD CONSTRAINT "productos_desarrollo_fkey"
  FOREIGN KEY ("desarrollo") REFERENCES "recetas"."desarrollos"("codigo")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2) v_producto_costo sin COALESCE: el Q0 silencioso deja de ser posible
-- ---------------------------------------------------------------------------
-- Con la FK + NOT NULL, todo producto resuelve a exactamente un desarrollo, y
-- v_desarrollo_costo devuelve exactamente una fila por desarrollo (agrupa por
-- id_desarrollo con LEFT JOINs). Así que el JOIN interno conserva el invariante
-- de una fila por producto — el mismo que productos.service.ts necesita — sin
-- necesidad de inventar un 0 cuando algo no matchea.
--
-- Antes, un desarrollo inexistente hacía que el producto apareciera en el
-- catálogo con Costo Q0.00 sin ninguna señal, y ese costo se propagaba a las
-- cotizaciones nuevas como margen del 100%.
CREATE OR REPLACE VIEW "recetas"."v_producto_costo" AS
SELECT p.id_producto,
       p.codigo,
       p.descripcion,
       vd.costo_insumos,
       vd.costo_mano_obra,
       vd.costo_unitario
FROM recetas.productos p
JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
JOIN recetas.v_desarrollo_costo vd ON vd.id_desarrollo = d.id_desarrollo;

-- ---------------------------------------------------------------------------
-- 3) Baja de la tabla congelada
-- ---------------------------------------------------------------------------
-- Su contenido se copió a desarrollo_insumos en la migración
-- 20260826120000_desarrollos_duenos_de_receta y desde entonces nadie la lee:
-- solo existía para que 01_erp no se rompiera. El rollback la recrea vacía.
DROP TABLE "recetas"."producto_insumos";
