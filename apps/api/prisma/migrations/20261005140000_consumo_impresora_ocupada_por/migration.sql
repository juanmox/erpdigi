-- Tope (no muro) al enviar consumo a una impresora que otro operario está
-- usando — pedido del usuario: "regularmente se le asigna a un solo operario de
-- impresión una sola impresora, por lo que NO debería otro usuario poder enviar
-- consumos a una impresora que otro esté usando". Eligió explícitamente el tope
-- sobre el muro.
--
-- Esta columna es lo que le da dientes al tope. Sin registro, el aviso se
-- confirma y no queda rastro de que pasó, así que no se puede revisar después
-- si alguien se acostumbró a pasar por encima del aviso.
--
-- ⚠️ NO puede ser un bloqueo. El usuario confirmó que un operario puede montar
-- en el turno de la tarde, retirarse, y otro desmontar en la noche: "debe ser
-- posible esa situación". Un muro rompería el cambio de turno, que es
-- operación normal. Por eso se confirma y se registra, nunca se impide.
--
-- Guarda el USUARIO y no un booleano: "lo envié sobre la máquina de Pedro" es
-- la pregunta que se va a querer responder, y con un booleano habría que ir a
-- buscar a quién en otra tabla. NULL es el caso normal (la impresora estaba
-- libre, o la usaba el mismo que envía), así que el histórico previo a esta
-- migración queda correcto sin backfill: nadie envió sobre impresora ajena
-- porque la regla no existía.
ALTER TABLE "costeo"."consumo_papel"
  ADD COLUMN "impresora_ocupada_por" INTEGER;

-- FK con RESTRICT, igual que `montaje_rollo.desmontado_por`: protege el rastro.
-- En `core.auditoria` el `id_usuario` es ON DELETE SET NULL, así que borrar un
-- usuario le borra el nombre al histórico — ya se vio pasar con los usuarios de
-- prueba de sesiones anteriores. Acá la base directamente impide borrar a quien
-- aparece en este registro.
ALTER TABLE "costeo"."consumo_papel"
  ADD CONSTRAINT "consumo_papel_impresora_ocupada_por_fkey"
  FOREIGN KEY ("impresora_ocupada_por") REFERENCES "core"."usuarios"("id_usuario")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- Quien envía no puede ser "el otro que la estaba usando": si coinciden, la
-- impresora era suya y la columna debe quedar NULL. El CHECK lo impone en la
-- base y no solo en el servicio, porque una fila con los dos iguales no
-- significa nada y ensuciaría cualquier reporte que cuente estos casos.
ALTER TABLE "costeo"."consumo_papel"
  ADD CONSTRAINT "ck_consumo_papel_impresora_ocupada_por"
  CHECK ("impresora_ocupada_por" IS NULL OR "impresora_ocupada_por" <> "creado_por");

-- Índice parcial: los casos marcados son la excepción, así que un índice sobre
-- toda la tabla sería casi todo NULL. Esto es lo que hace barato el reporte de
-- "envíos sobre impresora ajena" cuando se construya el módulo de Reportes.
CREATE INDEX "idx_consumo_papel_impresora_ocupada"
  ON "costeo"."consumo_papel" ("impresora_ocupada_por")
  WHERE "impresora_ocupada_por" IS NOT NULL;
