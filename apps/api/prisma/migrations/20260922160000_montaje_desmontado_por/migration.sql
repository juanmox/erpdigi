-- Quién desmontó un rollo, pedido del usuario (2026-09-22).
--
-- `montaje_rollo` guardaba `creado_por` (quién montó) pero no quién desmontó:
-- ese dato solo quedaba en `core.auditoria`, así que responder "¿quién cerró
-- este rollo?" exigía una consulta SQL a mano y ninguna pantalla lo mostraba.
-- Era una asimetría del modelo, no una decisión: las otras tablas con acción de
-- cierre (`consumo_papel`, `reposicion`) sí guardan los dos actores
-- (`creado_por` + `anulado_por`).
--
-- Importa más de lo que parece: el desmontaje es donde se teclea
-- `yardas_finales`, y de ahí sale el cálculo de merma (usadas físicas − consumo
-- registrado). Es una cifra de la que alguien responde.
--
-- En el uso normal monta y desmonta la misma persona (cada operario tiene su
-- impresora asignada), pero el turno puede cambiar si el rollo dura días — que
-- es justo el caso que motivó esto.
ALTER TABLE "costeo"."montaje_rollo"
  ADD COLUMN "desmontado_por" INTEGER;

ALTER TABLE "costeo"."montaje_rollo"
  ADD CONSTRAINT "montaje_rollo_desmontado_por_fkey"
  FOREIGN KEY ("desmontado_por") REFERENCES "core"."usuarios"("id_usuario")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- Queda NULLABLE a propósito: un montaje vigente todavía no tiene quién lo
-- desmonte. El CHECK impide el estado imposible (alguien "desmontó" algo que
-- sigue montado); no exige lo inverso porque las filas históricas anteriores a
-- esta migración pueden quedar sin autor si la auditoría no lo tiene.
ALTER TABLE "costeo"."montaje_rollo"
  ADD CONSTRAINT "ck_montaje_rollo_desmontado_por"
  CHECK ("desmontado_por" IS NULL OR "desmontado_en" IS NOT NULL);

-- Backfill del histórico desde la auditoría: `desmontar()` ya venía registrando
-- ahí el UPDATE con su `id_usuario`, así que el dato existe aunque no estuviera
-- en la tabla. Se toma el registro más reciente de cada montaje. Los que no
-- tengan rastro (o cuyo usuario se haya borrado) quedan en NULL.
-- Subconsulta correlacionada, no LATERAL en el FROM: en un UPDATE la tabla
-- destino no es referenciable desde ahí (42P10).
UPDATE "costeo"."montaje_rollo" mr
SET "desmontado_por" = (
  SELECT a."id_usuario"
  FROM "core"."auditoria" a
  WHERE a."entidad" = 'costeo.montaje_rollo'
    AND a."accion" = 'UPDATE'
    AND a."id_entidad" = mr."id_montaje_rollo"::text
    AND a."id_usuario" IS NOT NULL
  ORDER BY a."creado_en" DESC
  LIMIT 1
)
WHERE mr."desmontado_en" IS NOT NULL
  AND mr."desmontado_por" IS NULL;
