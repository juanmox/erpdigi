-- `yardas_tela = 0` es un caso real en reposiciones de tipo REIMPRESION: a
-- veces se usan retazos de tela y el consumo real es cero (pedido explícito
-- del usuario, 2026-10-22). El `ck_reposicion_tipo_regla` de la migración
-- 20261019120000 exigía `yardas_tela > 0` ahí, así que el formulario y el
-- servicio lo rechazaban como "falta" aunque fuera un valor intencional.
--
-- No era una regla nueva sin base: el propio comentario de esa migración ya
-- documentaba 160 reposiciones REIMPRESION vigentes con tela en 0 yardas
-- (135 migradas del legacy, que también lo toleraba) — el `NOT VALID` de
-- entonces las dejó marcadas como "pendientes de decidir", no como un error.
-- Esta migración decide: son válidas.
--
-- `yardas_papel` NO cambia — sigue exigiendo > 0. El usuario pidió esto solo
-- para tela; reimprimir 0 yardas de papel no tiene sentido como reposición.

ALTER TABLE costeo.reposicion
  DROP CONSTRAINT ck_reposicion_tipo_regla;

ALTER TABLE costeo.reposicion
  ADD CONSTRAINT ck_reposicion_tipo_regla CHECK (
    CASE tipo
      WHEN 'MATERIALES' THEN
        id_impresora IS NULL
        AND id_tipo_papel IS NULL
        AND id_montaje_rollo IS NULL
        AND id_insumo_tela IS NULL
        AND yardas_papel = 0
        AND yardas_tela = 0
      WHEN 'REIMPRESION' THEN
        id_impresora IS NOT NULL
        AND id_tipo_papel IS NOT NULL
        AND yardas_papel > 0
        AND id_insumo_tela IS NOT NULL
        AND yardas_tela >= 0
      ELSE false
    END
  ) NOT VALID;

-- Sigue NOT VALID a propósito: medido en local antes de escribir esto, las
-- violaciones reales bajan de 142 a 9 filas (local es un subconjunto de
-- producción, ahí hay que volver a medir antes de un VALIDATE CONSTRAINT) —
-- las que quedan son reposiciones sin impresora, sin yardas de papel o sin
-- insumo de tela, que siguen siendo datos incompletos de verdad, no el caso
-- que este cambio vino a resolver.
