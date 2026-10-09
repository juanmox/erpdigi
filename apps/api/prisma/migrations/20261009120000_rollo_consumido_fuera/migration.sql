-- Un rollo que YA SE CONSUMIÓ, pero fuera de este ERP.
--
-- Caso real que lo motiva (2026-10-09): una factura de 40 rollos de la que los
-- primeros 20 se gastaron registrándolos en el WebApp legacy de Google Sheets,
-- antes de que Costeo existiera. Los 20 que quedan sí se van a consumir acá.
--
-- ⚠️ Por qué un estado NUEVO y no `AGOTADO`: un rollo AGOTADO en este sistema
-- tiene su consumo registrado acá, y éste no. Si se mezclaran, el día que haya
-- un reporte de "yardas compradas contra consumidas" estos rollos aparecerían
-- como una merma gigante que nunca ocurrió. El estado los deja excluibles.
--
-- ⚠️ Por qué un estado y no una columna `activo`: `rollosDisponibles()` filtra
-- `EN_BODEGA` y `montar()` lo revalida con un 409, así que un valor nuevo queda
-- fuera de los dos sin tocar esa lógica. Un booleano aparte además permitiría
-- el estado contradictorio "EN_BODEGA pero inactivo".
--
-- La factura conserva sus 40 rollos y su costo: se compraron los 40. Lo único
-- que cambia es que 20 no se pueden montar acá.
ALTER TABLE "costeo"."rollo_papel"
  DROP CONSTRAINT IF EXISTS "ck_rollo_papel_estado";

ALTER TABLE "costeo"."rollo_papel"
  ADD CONSTRAINT "ck_rollo_papel_estado"
  CHECK ("estado" IN ('EN_BODEGA', 'MONTADO', 'AGOTADO', 'DESCARTADO', 'CONSUMIDO_FUERA'));

-- El motivo es obligatorio cuando el estado es CONSUMIDO_FUERA: dentro de un
-- año, "se gastaron en el Google Sheets antes de arrancar el ERP" explica lo
-- que de otro modo parece un error de carga.
ALTER TABLE "costeo"."rollo_papel"
  ADD COLUMN "consumido_fuera_motivo" TEXT,
  ADD COLUMN "consumido_fuera_por" INTEGER,
  ADD COLUMN "consumido_fuera_en" TIMESTAMPTZ(3);

ALTER TABLE "costeo"."rollo_papel"
  ADD CONSTRAINT "ck_rollo_papel_consumido_fuera"
  CHECK (
    ("estado" <> 'CONSUMIDO_FUERA' AND "consumido_fuera_motivo" IS NULL
       AND "consumido_fuera_por" IS NULL AND "consumido_fuera_en" IS NULL)
    OR
    ("estado" = 'CONSUMIDO_FUERA' AND btrim("consumido_fuera_motivo") <> ''
       AND "consumido_fuera_por" IS NOT NULL AND "consumido_fuera_en" IS NOT NULL)
  );

-- RESTRICT y no SET NULL: el rastro de quién sacó un rollo del circuito tiene
-- que sobrevivir al borrado del usuario, mismo criterio que
-- `montaje_rollo.desmontado_por`.
ALTER TABLE "costeo"."rollo_papel"
  ADD CONSTRAINT "rollo_papel_consumido_fuera_por_fkey"
  FOREIGN KEY ("consumido_fuera_por") REFERENCES "core"."usuarios"("id_usuario")
  ON UPDATE CASCADE ON DELETE RESTRICT;
