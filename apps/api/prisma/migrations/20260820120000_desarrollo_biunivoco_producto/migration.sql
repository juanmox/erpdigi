-- Confirmado con el usuario (2026-08-20) y verificado contra 1,128 filas
-- reales de DataDisev3.xlsx (88 desarrollos únicos, 88 items únicos, cero
-- excepciones): un Desarrollo es un prototipo que, al aprobarse, se
-- convierte en exactamente un Producto — relación biunívoca.
--
-- costeo.linea_produccion.desarrollo (agregado más temprano en esta misma
-- sesión) queda redundante y riesgoso: linea_produccion.id_producto ya
-- apunta al producto correcto, y guardar el desarrollo también como texto
-- suelto ahí crea dos fuentes de verdad que se pueden desincronizar. Se
-- quita — se lee siempre vía linea_produccion.producto.desarrollo.
ALTER TABLE "costeo"."linea_produccion" DROP COLUMN "desarrollo";

-- Impone la regla biunívoca a nivel de base de datos, no solo de
-- convención. Verificado sin datos existentes que la violen antes de
-- aplicar esta migración.
CREATE UNIQUE INDEX "productos_desarrollo_key" ON "recetas"."productos"("desarrollo");
