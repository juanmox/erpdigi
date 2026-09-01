-- El catálogo de tallas pasó de 13 a 155 al preparar F4 (Consumo de Papel).
-- Con 155 opciones, una lista plana es inusable, y agruparlas por línea de
-- prenda (YOUTH/ADULT/MEN/...) ayudó pero dejó las tallas de todos los días
-- mezcladas entre variantes raras.
--
-- Medido contra el catálogo real de consumo estándar (2,982 filas): 13 tallas
-- concentran el 80.4% del uso, y son exactamente las 13 que existían antes de
-- la carga. La 14ª (5XL) baja de 289 filas a 25 — el corte es nítido.
--
-- `frecuente` las agrupa primero en los selectores. Es solo de presentación: no
-- participa de ningún cálculo, y se puede reasignar cuando el uso cambie sin
-- tocar código ni desplegar.
ALTER TABLE "recetas"."tallas"
  ADD COLUMN "frecuente" BOOLEAN NOT NULL DEFAULT false;

UPDATE "recetas"."tallas"
SET "frecuente" = true
WHERE "nombre" IN ('YXS','YS','YM','YL','YXL','XS','S','M','L','XL','2XL','3XL','4XL');
