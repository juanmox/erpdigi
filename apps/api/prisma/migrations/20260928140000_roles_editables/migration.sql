-- Roles editables desde la aplicación (2026-09-28).
--
-- Pregunta que lo motivó: "¿cómo habilito la fecha a un usuario en Impresión de
-- OPs?". Resultó que NO SE PODÍA. `/usuarios` asigna roles, no permisos, y los
-- permisos de cada rol solo se definían en `seed.ts`; `/roles` y `/permisos`
-- eran de solo lectura. La única salida por interfaz era darle un rol enorme
-- (ADMIN_IT_COSTEO trae los 27 permisos de Costeo) para habilitar uno solo.
--
-- Esta columna resuelve el choque con el seed, que es lo que haría inútil a la
-- pantalla nueva: `upsertRolConPermisos()` RECONCILIA (agrega los permisos de
-- su lista y borra los que no estén). Sin marcar nada, cualquier ajuste hecho a
-- mano se perdería en silencio en el próximo despliegue que corra el seed.
--
-- Regla: el seed define el punto de partida de un rol; en cuanto alguien lo
-- edita desde la pantalla, el rol pasa a ser `personalizado` y el seed deja de
-- tocarle los permisos. La contracara —que un permiso nuevo de una release
-- futura no llegue solo a ese rol— es deliberada y la pantalla la muestra.
--
-- ADMIN queda fuera de esto por diseño: no es editable desde la pantalla, así
-- que el seed lo sigue reconciliando siempre y sigue siendo el camino de
-- recuperación si alguien se recorta a sí mismo por error.
ALTER TABLE "core"."roles"
  ADD COLUMN "personalizado" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "core"."roles"."personalizado" IS
  'true = sus permisos se administran desde la pantalla de Roles y el seed ya no los reconcilia.';
