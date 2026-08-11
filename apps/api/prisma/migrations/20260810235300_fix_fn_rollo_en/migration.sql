-- Corrige costeo.fn_rollo_en(): debía devolver el id de la fila de
-- costeo.montaje_rollo (el hecho físico "este rollo está montado en esta
-- impresora en este momento"), no el id_rollo_papel — así lo define
-- PROMPT_CLAUDE_CODE.md §5.4 ("SELECT m.id ... FROM costeo.montaje_rollo m").
-- Importa porque consumo_papel.id_montaje_rollo y reposicion.id_montaje_rollo
-- son FKs hacia montaje_rollo, no hacia rollo_papel — el valor que devolvía
-- la versión original de F1 no podía usarse directamente para insertar en
-- esas columnas. Encontrado en revisión antes de construir F2, que es el
-- primer consumidor real de esta función.
CREATE OR REPLACE FUNCTION "costeo"."fn_rollo_en"(p_impresora_id integer, p_momento timestamptz)
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT m."id_montaje_rollo"
  FROM "costeo"."montaje_rollo" m
  WHERE m."id_impresora" = p_impresora_id
    AND m."vigencia" @> p_momento
  LIMIT 1;
$$;
