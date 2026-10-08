-- Cierre de sesión por inactividad, configurable por usuario y por rol.
--
-- Pedido del usuario (2026-10-07): en planta las máquinas quedan desatendidas y
-- otro operario podría usar la sesión abierta de un compañero. Hasta hoy la
-- sesión duraba 30 días renovables, o sea prácticamente nunca caducaba.
--
-- ⚠️ Esto NO es lo mismo que acortar la vida del token, y la diferencia se
-- midió: la app hace peticiones sola (el panel de impresoras refresca cada 30s
-- y react-query recarga al recuperar el foco), así que una pantalla olvidada
-- renueva su propio token indefinidamente. Solo un contador que mire la
-- actividad REAL del usuario —mouse y teclado— cierra una máquina sola.
--
-- El tope duro de sesión (13 horas, un login por turno de 12) quedó para una
-- fase aparte: toca el camino de autenticación y su modo de falla es dejar a
-- todos afuera, así que conviene separarlo para que un problema sea
-- diagnosticable.

-- NULL significa "no definido acá, mirá el siguiente nivel". La cadena es
-- usuario → rol → DEFAULT del código (15 min), así que un NULL en los dos
-- lados deja el valor por defecto sin tener que escribirlo en ninguna fila.
ALTER TABLE "core"."roles"
  ADD COLUMN "minutos_inactividad" INTEGER;

ALTER TABLE "core"."usuarios"
  ADD COLUMN "minutos_inactividad" INTEGER;

-- 0 = nunca cerrar, para roles de oficina donde el cierre automático estorba
-- más de lo que protege. El tope de 1440 (24 h) no es una regla de negocio:
-- evita que un typo (1500 en vez de 15) desactive el control en la práctica
-- sin que nadie lo note.
ALTER TABLE "core"."roles"
  ADD CONSTRAINT "ck_roles_minutos_inactividad"
  CHECK ("minutos_inactividad" IS NULL OR ("minutos_inactividad" >= 0 AND "minutos_inactividad" <= 1440));

ALTER TABLE "core"."usuarios"
  ADD CONSTRAINT "ck_usuarios_minutos_inactividad"
  CHECK ("minutos_inactividad" IS NULL OR ("minutos_inactividad" >= 0 AND "minutos_inactividad" <= 1440));
