-- Órdenes de Facturación (OF) cargadas por plantilla, mientras no existe el
-- módulo de facturación. `costeo.orden_facturacion` y `costeo.of_op` existen
-- desde F1 y están VACÍAS (0 filas en producción, verificado antes de
-- escribir esto) — se pueden reestructurar sin backfill ni riesgo de dato.
--
-- Decisiones del usuario (2026-10-21):
--   * Pantalla propia "Órdenes de Facturación" + botón desde el reporte de
--     costeo — es el embrión del módulo de facturación futuro.
--   * Una OF = un cliente (se resuelve de sus OP).
--   * Un número de factura puede cubrir varias OF (no es único).
--   * La unidad que se asigna a una OF es la OP COMPLETA, nunca una línea
--     suelta — confirmado explícitamente tras una pregunta de ambigüedad.
--   * Quitar una OP de una OF, o anular la OF entera, la deja libre para
--     otra OF — es la razón de ser del índice único PARCIAL de más abajo.
--
-- ───────────────────────────────── 1) orden_facturacion gana id_empresa ────
-- Mismo criterio que `orden_produccion`/`linea_produccion` del 2026-09-28:
-- la separación por empresa quedó "para cuando se diseñe esto" — es ahora.
-- Sin backfill porque la tabla está vacía: NOT NULL desde el primer momento.
ALTER TABLE "costeo"."orden_facturacion"
  ADD COLUMN "id_empresa" INTEGER NOT NULL;

ALTER TABLE "costeo"."orden_facturacion"
  ADD CONSTRAINT "orden_facturacion_id_empresa_fkey"
  FOREIGN KEY ("id_empresa") REFERENCES "core"."empresas"("id_empresa")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- El correlativo de la OF tampoco lo genera un contador global: cada empresa
-- trae el suyo, igual que `orden_produccion`.
ALTER TABLE "costeo"."orden_facturacion"
  DROP CONSTRAINT IF EXISTS "orden_facturacion_anio_correlativo_key";

CREATE UNIQUE INDEX "orden_facturacion_id_empresa_anio_correlativo_key"
  ON "costeo"."orden_facturacion" ("id_empresa", "anio", "correlativo");

CREATE INDEX "idx_of_empresa" ON "costeo"."orden_facturacion" ("id_empresa");

-- Par (id, empresa) sobre la raíz: destino de la FK compuesta de `of_op` de
-- más abajo. Redundante como restricción (id_orden_facturacion ya es PK),
-- pero Postgres exige un UNIQUE sobre las columnas exactas de una FK.
ALTER TABLE "costeo"."orden_facturacion"
  ADD CONSTRAINT "orden_facturacion_id_empresa_uq" UNIQUE ("id_orden_facturacion", "id_empresa");

-- ───────────────────── 2) Tipo de servicio pasa a ser opcional ─────────────
-- La plantilla de carga (OP · OF · Fecha OF) no lo trae — es un dato que
-- completará F5 o el módulo de facturación.
ALTER TABLE "costeo"."orden_facturacion"
  ALTER COLUMN "id_tipo_servicio" DROP NOT NULL;

-- ─────────────────────────── 3) Factura asignada después, por separado ─────
-- La OF se emite primero; la factura puede llegar días después (confirmado
-- por el usuario). Los dos datos van juntos: no tiene sentido un número sin
-- su fecha, ni una fecha sin su número.
ALTER TABLE "costeo"."orden_facturacion"
  ADD COLUMN "fecha_factura" DATE;

ALTER TABLE "costeo"."orden_facturacion"
  ADD CONSTRAINT "ck_orden_facturacion_factura"
  CHECK (("numero_factura" IS NULL) = ("fecha_factura" IS NULL));

CREATE INDEX "idx_of_numero_factura" ON "costeo"."orden_facturacion" ("numero_factura");
CREATE INDEX "idx_of_fecha" ON "costeo"."orden_facturacion" ("fecha");
CREATE INDEX "idx_of_fecha_factura" ON "costeo"."orden_facturacion" ("fecha_factura");

-- ───────────────────────────────────────── 4) Anulación de la OF entera ────
-- Mismo patrón nullable-por-triple que `costeo.reposicion.anulado_*`: el
-- motivo obligatorio lo exige el servicio al anular, no un CHECK — es el
-- criterio ya usado ahí, no el más estricto de `rollo_papel` (que depende de
-- un estado-enum que acá no existe).
ALTER TABLE "costeo"."orden_facturacion"
  ADD COLUMN "anulada_en" TIMESTAMPTZ(3),
  ADD COLUMN "anulada_por" INTEGER,
  ADD COLUMN "motivo_anulacion" TEXT;

-- RESTRICT: el rastro de quién anuló sobrevive al borrado del usuario, mismo
-- criterio que `montaje_rollo.desmontado_por` / `rollo_papel.consumido_fuera_por`.
ALTER TABLE "costeo"."orden_facturacion"
  ADD CONSTRAINT "orden_facturacion_anulada_por_fkey"
  FOREIGN KEY ("anulada_por") REFERENCES "core"."usuarios"("id_usuario")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ─────────────────────────────── 5) De dónde vino la OF ────────────────────
-- Deja trazado qué OF se cargó por la plantilla transitoria y cuáles creará
-- el módulo de facturación cuando exista — mismo campo, sin migrar nada el
-- día que el módulo arranque.
ALTER TABLE "costeo"."orden_facturacion"
  ADD COLUMN "origen" VARCHAR(20) NOT NULL DEFAULT 'PLANTILLA';

ALTER TABLE "costeo"."orden_facturacion"
  ADD CONSTRAINT "ck_orden_facturacion_origen"
  CHECK ("origen" IN ('PLANTILLA', 'MODULO'));

-- ═══════════════════════════ 6) of_op: de N:M sin historia a asignaciones ══
-- La tabla original era un PK compuesto (id_orden_facturacion,
-- id_orden_produccion): permitía la MISMA OP en dos OF a la vez y, al quitar
-- una OP, la fila se borraba sin dejar rastro de que existió. El usuario pidió
-- lo contrario: una OP en como mucho una OF VIGENTE a la vez, con historial de
-- cuándo entró y cuándo salió. Está vacía (verificado), así que se recrea
-- entera en vez de ALTERar un PK compuesto en el lugar.
DROP TABLE "costeo"."of_op";

CREATE TABLE "costeo"."of_op" (
  "id_of_op" SERIAL NOT NULL,
  "id_orden_facturacion" INTEGER NOT NULL,
  "id_orden_produccion" INTEGER NOT NULL,
  -- Duplicada desde la OF y no derivada por join: es lo que permite la FK
  -- compuesta de abajo, que es la que de verdad impide mezclar OF y OP de
  -- empresas distintas — mismo recurso que `linea_produccion.id_empresa`.
  "id_empresa" INTEGER NOT NULL,
  "asignado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "asignado_por" INTEGER NOT NULL,
  "anulado_en" TIMESTAMPTZ(3),
  "anulado_por" INTEGER,
  "motivo_anulacion" TEXT,

  CONSTRAINT "of_op_pkey" PRIMARY KEY ("id_of_op")
);

ALTER TABLE "costeo"."of_op"
  ADD CONSTRAINT "of_op_orden_facturacion_empresa_fkey"
  FOREIGN KEY ("id_orden_facturacion", "id_empresa")
  REFERENCES "costeo"."orden_facturacion" ("id_orden_facturacion", "id_empresa")
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "costeo"."of_op"
  ADD CONSTRAINT "of_op_orden_produccion_empresa_fkey"
  FOREIGN KEY ("id_orden_produccion", "id_empresa")
  REFERENCES "costeo"."orden_produccion" ("id_orden_produccion", "id_empresa")
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "costeo"."of_op"
  ADD CONSTRAINT "of_op_asignado_por_fkey"
  FOREIGN KEY ("asignado_por") REFERENCES "core"."usuarios"("id_usuario")
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "costeo"."of_op"
  ADD CONSTRAINT "of_op_anulado_por_fkey"
  FOREIGN KEY ("anulado_por") REFERENCES "core"."usuarios"("id_usuario")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- EL CORAZÓN DE ESTA MIGRACIÓN: una OP solo puede tener UNA asignación
-- VIGENTE (anulado_en IS NULL). Es un índice único PARCIAL y no un UNIQUE
-- normal — si fuera normal, jamás se podría reasignar una OP después de
-- quitarla una vez, porque la fila anulada seguiría "ocupando" el valor.
-- Mismo recurso que ya protege `consumo_papel` y `montaje_rollo`.
CREATE UNIQUE INDEX "ux_of_op_produccion_vigente"
  ON "costeo"."of_op" ("id_orden_produccion")
  WHERE "anulado_en" IS NULL;

CREATE INDEX "idx_of_op_facturacion" ON "costeo"."of_op" ("id_orden_facturacion");
CREATE INDEX "idx_of_op_empresa" ON "costeo"."of_op" ("id_empresa");
