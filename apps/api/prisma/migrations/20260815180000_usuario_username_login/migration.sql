-- Reemplaza email como identificador de login por un campo "username" simple
-- (ej. "juan", "lissette"), sin formato de correo forzado -- el <input
-- type="email"> del login bloqueaba nombres de usuario simples en el
-- navegador antes de que la petición llegara al backend. email pasa a ser
-- opcional: hoy no tiene ningún uso funcional (no hay recuperación de
-- contraseña ni notificaciones por correo), solo un dato de referencia si
-- algún día hace falta.
ALTER TABLE "core"."usuarios" ADD COLUMN "username" TEXT;

-- Backfill: username = local-part del email existente, en minúsculas.
-- Verificado sin colisiones contra los 8 usuarios reales de este ambiente
-- antes de aplicar (admin, cotizador, editor, prueba.qa, playwright.qa,
-- playwright.qa2, prueba, prueba-editada).
UPDATE "core"."usuarios" SET "username" = lower(split_part("email", '@', 1));

ALTER TABLE "core"."usuarios" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "core"."usuarios" ADD CONSTRAINT "usuarios_username_key" UNIQUE ("username");

ALTER TABLE "core"."usuarios" ALTER COLUMN "email" DROP NOT NULL;
