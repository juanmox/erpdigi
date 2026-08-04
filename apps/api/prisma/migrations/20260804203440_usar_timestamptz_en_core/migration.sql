-- Los valores existentes ya son instantes UTC correctos (la sesión de Postgres usa
-- Etc/UTC por default) pero estaban guardados en columnas timestamp SIN zona horaria,
-- lo cual los dejaba ambiguos para cualquier cliente (ej. DBeaver los mostraba "pelados",
-- sin indicar que eran UTC, generando un desfase de 6 horas contra la hora real de
-- Guatemala). AT TIME ZONE 'UTC' reinterpreta cada valor existente como ese mismo
-- instante UTC al convertir a timestamptz, sin correr ni atrasar ningún dato.

-- AlterTable: empresas
ALTER TABLE "core"."empresas"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "actualizado_en" TYPE TIMESTAMPTZ(3) USING "actualizado_en" AT TIME ZONE 'UTC';

-- AlterTable: usuarios
ALTER TABLE "core"."usuarios"
  ALTER COLUMN "ultimo_login_en" TYPE TIMESTAMPTZ(3) USING "ultimo_login_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

-- AlterTable: tasas_cambio
ALTER TABLE "core"."tasas_cambio"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

-- AlterTable: auditoria
ALTER TABLE "core"."auditoria"
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';

-- AlterTable: refresh_tokens
ALTER TABLE "core"."refresh_tokens"
  ALTER COLUMN "expira_en" TYPE TIMESTAMPTZ(3) USING "expira_en" AT TIME ZONE 'UTC',
  ALTER COLUMN "creado_en" TYPE TIMESTAMPTZ(3) USING "creado_en" AT TIME ZONE 'UTC';
