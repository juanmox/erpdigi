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
        AND yardas_tela > 0
      ELSE false
    END
  ) NOT VALID;
