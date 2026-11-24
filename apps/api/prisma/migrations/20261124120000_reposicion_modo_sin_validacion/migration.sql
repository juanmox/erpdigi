-- Modo "sin validaciones" de las reposiciones (2026-11-24).
--
-- Durante la capacitación de quienes validan, el equipo necesita registrar y
-- sacar reposiciones como antes (crear → descontar papel → imprimir) SIN que el
-- flujo de validaciones lo frene. Es un interruptor POR EMPRESA que un
-- administrador prende y apaga; el flujo nuevo no se toca: con el interruptor en
-- su valor por defecto (true) todo sigue igual.
--
-- 1. core.empresas.reposiciones_con_validacion: true = flujo de validaciones
--    (default, el comportamiento vigente); false = modo transitorio sin validar.
-- 2. La acción SIN_VALIDACION del evento: deja en la línea de tiempo que esa
--    reposición se autorizó sin pasar por las validaciones. Es una acción propia
--    y no un VALIDAR a propósito: las métricas de tiempo por paso y por validador
--    filtran por VALIDAR, y mezclar acá un acto automático las distorsionaría.

ALTER TABLE core.empresas
  ADD COLUMN reposiciones_con_validacion BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE costeo.reposicion_evento
  DROP CONSTRAINT ck_reposicion_evento_accion;
ALTER TABLE costeo.reposicion_evento
  ADD CONSTRAINT ck_reposicion_evento_accion CHECK (
    accion IN ('CREAR', 'VALIDAR', 'DEVOLVER', 'CORREGIR', 'IMPRIMIR', 'REIMPRIMIR', 'DESPACHAR', 'ANULAR', 'SIN_VALIDACION')
  );
