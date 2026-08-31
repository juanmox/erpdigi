-- Rollback de 20260831120000_fk_desarrollo_y_baja_de_legacy.
-- OJO: recrea producto_insumos VACÍA. Sus datos vivían ahí desde antes del
-- refactor de desarrollos; si hiciera falta repoblarla, hay que hacerlo desde
-- recetas.desarrollo_insumos (ver la consulta comentada al final).

CREATE TABLE "recetas"."producto_insumos" (
  "id_producto_insumo" SERIAL PRIMARY KEY,
  "id_producto" INTEGER NOT NULL,
  "id_insumo" INTEGER NOT NULL,
  "consumo" NUMERIC(14,6) NOT NULL DEFAULT 0,
  "id_area" INTEGER,
  CONSTRAINT "producto_insumos_id_producto_fkey" FOREIGN KEY ("id_producto")
    REFERENCES "recetas"."productos"("id_producto") ON DELETE CASCADE,
  CONSTRAINT "producto_insumos_id_insumo_fkey" FOREIGN KEY ("id_insumo")
    REFERENCES "recetas"."insumos"("id_insumo"),
  CONSTRAINT "producto_insumos_id_area_fkey" FOREIGN KEY ("id_area")
    REFERENCES "recetas"."areas_uso"("id_area")
);
CREATE UNIQUE INDEX "producto_insumos_id_producto_id_insumo_id_area_key"
  ON "recetas"."producto_insumos" ("id_producto", "id_insumo", "id_area");

-- Vuelve a tolerar productos cuyo desarrollo no resuelva.
CREATE OR REPLACE VIEW "recetas"."v_producto_costo" AS
SELECT p.id_producto, p.codigo, p.descripcion,
       COALESCE(vd.costo_insumos, 0::numeric)   AS costo_insumos,
       COALESCE(vd.costo_mano_obra, 0::numeric) AS costo_mano_obra,
       COALESCE(vd.costo_unitario, 0::numeric)  AS costo_unitario
FROM recetas.productos p
LEFT JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
LEFT JOIN recetas.v_desarrollo_costo vd ON vd.id_desarrollo = d.id_desarrollo;

ALTER TABLE "recetas"."productos" DROP CONSTRAINT "productos_desarrollo_fkey";
ALTER TABLE "recetas"."productos" ALTER COLUMN "desarrollo" DROP NOT NULL;

-- Repoblado opcional de producto_insumos desde el BOM actual:
-- INSERT INTO recetas.producto_insumos (id_producto, id_insumo, consumo, id_area)
-- SELECT p.id_producto, di.id_insumo, di.consumo, di.id_area
-- FROM recetas.desarrollo_insumos di
-- JOIN recetas.desarrollos d ON d.id_desarrollo = di.id_desarrollo
-- JOIN recetas.productos p ON p.desarrollo = d.codigo;
