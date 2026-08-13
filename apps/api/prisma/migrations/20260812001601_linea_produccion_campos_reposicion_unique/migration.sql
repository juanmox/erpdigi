-- Dos correcciones encontradas al preparar F3 (Reposiciones), revisando
-- DataDisev3!DatosOrigen real y el flujo de negocio con el usuario:
--
-- 1. linea_produccion.imagen / .prioridad: 2 de los "8 campos con valor de
--    negocio" que ANEXO_A §3.6 documenta como descartados por el
--    copiarDatos() legacy — la corrección #1 de §6.1 exige no perderlos.
--
-- 2. reposicion: sin UNIQUE(id_orden_produccion, numero_repo), dos
--    reposiciones concurrentes para la misma OP podían terminar con el
--    mismo número — el "siguiente número sugerido" (MAX+1) solo es
--    confiable si el motor lo garantiza, no la aplicación.
ALTER TABLE "costeo"."linea_produccion"
  ADD COLUMN "imagen" VARCHAR(500),
  ADD COLUMN "prioridad" VARCHAR(20);

CREATE UNIQUE INDEX "reposicion_id_orden_produccion_numero_repo_key"
  ON "costeo"."reposicion"("id_orden_produccion", "numero_repo");
