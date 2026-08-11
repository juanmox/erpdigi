-- Corrige un desajuste de precisión en costeo.fn_rollo_en(): montado_en/
-- desmontado_en son timestamptz(3) (milisegundos, redondeados al guardar),
-- pero p_momento llega con precisión de microsegundos (ej. el now() por
-- defecto de Postgres o de la aplicación). Si p_momento cae en la mitad de
-- milisegundo que se redondeó HACIA ARRIBA al guardar montado_en, el punto
-- queda técnicamente antes del límite inferior del rango `vigencia` aunque
-- para cualquier propósito práctico sea "el mismo instante" — la función
-- no encontraba el montaje activo en esa ventana de <1ms. Se corrige
-- redondeando p_momento a la misma precisión antes de comparar.
CREATE OR REPLACE FUNCTION "costeo"."fn_rollo_en"(p_impresora_id integer, p_momento timestamptz)
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT m."id_montaje_rollo"
  FROM "costeo"."montaje_rollo" m
  WHERE m."id_impresora" = p_impresora_id
    AND m."vigencia" @> (p_momento::timestamptz(3))
  LIMIT 1;
$$;
