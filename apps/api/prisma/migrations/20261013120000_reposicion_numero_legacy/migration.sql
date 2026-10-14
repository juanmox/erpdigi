-- El número de reposición del legacy NO era único por orden.
--
-- El ERP calcula `numero_repo` server-side con MAX+1 y lo protege con
-- `UNIQUE (id_orden_produccion, numero_repo)`. El formulario legacy lo dejaba
-- teclear, así que se repitió: medido sobre la ventana 2026-09-01..2026-10-11,
-- hay **551 pares (orden, número) repetidos que abarcan 1,322 filas**, y de esos
-- 551 solo 19 son duplicados reales — los otros 532 son eventos DISTINTOS con
-- el mismo número (otra fecha, otro defecto, otra tela, otras yardas).
--
-- Respetando el UNIQUE tal cual se perderían ~771 reposiciones reales (21%).
-- Decisión del usuario: renumerar al migrar y guardar acá el número original,
-- para que la Requisición de Bodega en papel siga siendo rastreable.
--
-- Queda NULL en todo lo capturado por el ERP: solo lo migrado lo lleva.
ALTER TABLE costeo.reposicion ADD COLUMN numero_repo_legacy SMALLINT;

COMMENT ON COLUMN costeo.reposicion.numero_repo_legacy IS
  'Número de reposición tal como lo escribió el sistema legacy de Google Sheets. '
  'Solo lo llevan las filas migradas; el ERP numera con MAX+1 en numero_repo. '
  'No es único: el legacy repetía el número dentro de una misma orden.';

-- Un índice parcial, no uno completo: las filas migradas son la excepción, y es
-- lo que hace barato buscar "la reposición que en papel decía R03".
CREATE INDEX idx_reposicion_numero_legacy
  ON costeo.reposicion (id_orden_produccion, numero_repo_legacy)
  WHERE numero_repo_legacy IS NOT NULL;
