-- Historial de cambios de la explosión de materiales: una fila por ítem y por acto.
--
-- Hasta ahora lo único que quedaba de una modificación era `core.auditoria`, y ahí
-- el id de entidad no es uniforme (una entrada de entrega o de anulación cubre una
-- LISTA de ítems separada por comas), no hay motivo y el "antes" no siempre existe.
-- Preguntar "¿qué le pasó a este ítem?" exigía parsear JSON. Esta tabla responde
-- esa pregunta directo, con índice por ítem, y deja el MOTIVO como dato propio.
--
-- Se escribe en la misma transacción que el cambio, así que no puede haber un
-- cambio sin su historial ni al revés.
--
-- El nombre del usuario se guarda como TEXTO además de la referencia: si la
-- persona se retira de la empresa y se borra su usuario, lo que importa —qué hizo—
-- sobrevive (mismo criterio que `core.auditoria.usuario_nombre`). Por eso la FK es
-- SET NULL y no RESTRICT, al revés de `montaje_rollo.desmontado_por`: acá el
-- registro narra, no protege integridad.
--
-- No hay backfill: la explosión de materiales todavía no está en producción y lo
-- que hubiera en local son datos de prueba.

CREATE TABLE costeo.material_op_historial (
  id_historial    serial PRIMARY KEY,
  id_empresa      integer NOT NULL REFERENCES core.empresas(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT,
  id_material_op  integer NOT NULL REFERENCES costeo.material_op(id_material_op) ON UPDATE CASCADE ON DELETE RESTRICT,
  accion          varchar(30) NOT NULL,
  -- [{ "campo": "cantidad", "antes": "10", "despues": "12" }, ...]. Valores como
  -- texto: el historial es para leerlo, no para calcular con él.
  cambios         jsonb NOT NULL DEFAULT '[]'::jsonb,
  motivo          text,
  id_usuario      integer REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE SET NULL,
  usuario_nombre  varchar(80) NOT NULL,
  creado_en       timestamptz(3) NOT NULL DEFAULT now(),

  CONSTRAINT ck_material_historial_accion CHECK (
    accion IN ('EDITAR', 'ANULAR', 'ENTREGAR', 'CORREGIR_FECHA', 'REVERTIR', 'COSTO_CONGELADO', 'LIGAR_OP')
  ),
  CONSTRAINT ck_material_historial_cambios CHECK (jsonb_typeof(cambios) = 'array'),
  -- Lo que un humano decide corregir exige explicación; lo automático (congelar
  -- costo, ligar la OP) y la entrega normal no.
  CONSTRAINT ck_material_historial_motivo CHECK (
    accion NOT IN ('EDITAR', 'ANULAR', 'REVERTIR', 'CORREGIR_FECHA')
    OR length(btrim(coalesce(motivo, ''))) >= 3
  )
);

CREATE INDEX ix_material_historial_item ON costeo.material_op_historial (id_material_op, creado_en);
CREATE INDEX ix_material_historial_empresa ON costeo.material_op_historial (id_empresa, creado_en DESC);
