-- La bitácora guarda el NOMBRE del usuario como texto, además de la FK.
--
-- Decisión del usuario (2026-10-07), textual: "si el usuario se retira de la
-- empresa, ya no me interesa, pero sí me interesa saber qué hizo". O sea: el
-- usuario tiene que poder borrarse y el rastro sobrevivirle.
--
-- ⚠️ Es lo CONTRARIO de lo que se eligió para `montaje_rollo.desmontado_por`,
-- que usa FK RESTRICT para impedir el borrado. Acá es correcto porque la
-- auditoría no protege ninguna integridad referencial: solo narra. Y
-- `auditoria.id_usuario` es ON DELETE SET NULL, así que borrar un usuario hoy
-- le borra el nombre a todo su histórico.
--
-- La FK se CONSERVA: mientras el usuario exista sigue sirviendo para filtrar
-- por id. El texto es el que sobrevive cuando ya no está.
ALTER TABLE "core"."auditoria"
  ADD COLUMN "usuario_nombre" VARCHAR(60);

-- Backfill de lo que todavía se puede recuperar. Lo que ya perdió su
-- `id_usuario` NO vuelve: ese dato se fue con el usuario borrado.
UPDATE "core"."auditoria" a
   SET "usuario_nombre" = u."username"
  FROM "core"."usuarios" u
 WHERE u."id_usuario" = a."id_usuario"
   AND a."usuario_nombre" IS NULL;

-- Para filtrar por usuario en la pantalla sin recorrer la tabla entera.
CREATE INDEX "idx_auditoria_usuario_nombre"
  ON "core"."auditoria" ("usuario_nombre");

-- La pantalla abre con un rango de fechas: es el filtro que siempre está.
CREATE INDEX "idx_auditoria_creado_en"
  ON "core"."auditoria" ("creado_en" DESC);
