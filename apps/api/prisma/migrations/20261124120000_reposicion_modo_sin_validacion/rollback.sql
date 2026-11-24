-- Revierte 20261124120000_reposicion_modo_sin_validacion.
-- Ojo: borra los eventos SIN_VALIDACION (el CHECK anterior no los admite). La
-- reposición conserva su evento CREAR y su estado; solo se pierde la marca de que
-- se autorizó sin validaciones.
DELETE FROM costeo.reposicion_evento WHERE accion = 'SIN_VALIDACION';
ALTER TABLE costeo.reposicion_evento
  DROP CONSTRAINT ck_reposicion_evento_accion;
ALTER TABLE costeo.reposicion_evento
  ADD CONSTRAINT ck_reposicion_evento_accion CHECK (
    accion IN ('CREAR', 'VALIDAR', 'DEVOLVER', 'CORREGIR', 'IMPRIMIR', 'REIMPRIMIR', 'DESPACHAR', 'ANULAR')
  );
ALTER TABLE core.empresas DROP COLUMN IF EXISTS reposiciones_con_validacion;
