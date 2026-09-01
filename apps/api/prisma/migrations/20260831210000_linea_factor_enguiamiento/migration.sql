-- Corrección #2 de PROMPT_CLAUDE_CODE.md §6.2: "usar el enguiamiento de la
-- línea, no la constante hardcodeada 0.084375 — migrar ese valor como default
-- configurable, no como constante en código".
--
-- La columna `enguiamiento_yd` que ya existía guarda el valor que Diseño teclea
-- por línea. Medido contra las 1,128 líneas reales de DataDisev3, ese valor NO
-- es una medición independiente: es `total_piezas * 0.084375` redondeada a un
-- decimal (81.5% hacia arriba, 16.5% al más cercano, desviación media
-- +0.0209 yd). Por eso F4 calcula el enguiamiento por talla en vez de repartir
-- el capturado, y usa el capturado solo como contraste.
--
-- Este factor es lo que hace configurable la constante: por defecto 0.084375
-- para todas las líneas, ajustable por línea si algún producto lo necesita.
ALTER TABLE "costeo"."linea_produccion"
  ADD COLUMN "factor_enguiamiento" DECIMAL(8,6) NOT NULL DEFAULT 0.084375;
