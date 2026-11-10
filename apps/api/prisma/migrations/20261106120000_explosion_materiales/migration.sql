-- Explosión de materiales por OP: lo que el planificador pide a bodega para producir cada orden.
--
-- Hoy llega por plantilla Excel (exportada del SAC) y vive acá. Cuando exista el módulo de
-- Inventario, las salidas se generarán desde allí con `origen = 'INVENTARIO'` y esta misma
-- tabla seguirá siendo la que leen la página y el reporte de costeo.
--
-- Tres fechas, a propósito (el planificador se hizo ayer, la plantilla se carga hoy y el
-- insumo se entrega mañana):
--   fecha_planificador  = la FECHA de la plantilla (viene del SAC).
--   creado_en           = cuándo se cargó (automática).
--   fecha_entrega       = vacía mientras esté pendiente; bodega la llena al registrar la salida.
--
-- "La salida es la entrega": un ítem con salida_sac está ENTREGADO; sin ella, PENDIENTE.

CREATE TABLE costeo.carga_material (
  id_carga_material  serial PRIMARY KEY,
  id_empresa         integer NOT NULL REFERENCES core.empresas(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT,
  nombre_archivo     varchar(200),
  filas              integer NOT NULL CHECK (filas > 0),
  creado_en          timestamptz(3) NOT NULL DEFAULT now(),
  creado_por         integer NOT NULL REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX ix_carga_material_empresa ON costeo.carga_material (id_empresa, creado_en DESC);

CREATE TABLE costeo.material_op (
  id_material_op       serial PRIMARY KEY,
  id_empresa           integer NOT NULL REFERENCES core.empresas(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT,
  origen               varchar(20) NOT NULL DEFAULT 'PLANTILLA',
  id_carga_material    integer REFERENCES costeo.carga_material(id_carga_material) ON UPDATE CASCADE ON DELETE RESTRICT,
  orden_planificacion  varchar(30) NOT NULL,
  fecha_planificador   date NOT NULL,
  codigo_op            varchar(20) NOT NULL,
  -- Se liga al cargar si la OP existe; si no, queda NULL y se liga cuando la OP se importe.
  id_orden_produccion  integer,
  id_insumo            integer NOT NULL REFERENCES recetas.insumos(id_insumo) ON UPDATE CASCADE ON DELETE RESTRICT,
  cantidad             numeric(14,4) NOT NULL,
  -- Foto del costo_promedio del insumo al cargar. NULL = "sin costo": el insumo estaba en 0.
  costo_unitario       numeric(14,6),
  costo_total          numeric(16,4) GENERATED ALWAYS AS (cantidad * costo_unitario) STORED,
  salida_sac           varchar(30),
  fecha_entrega        date,
  entregado_en         timestamptz(3),
  entregado_por        integer REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  comentario           text,
  creado_en            timestamptz(3) NOT NULL DEFAULT now(),
  creado_por           integer NOT NULL REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  modificado_en        timestamptz(3),
  modificado_por       integer REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  anulado_en           timestamptz(3),
  anulado_por          integer REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  motivo_anulacion     text,

  -- La OP ligada tiene que ser de la MISMA empresa que el ítem (mismo recurso que linea_produccion).
  CONSTRAINT material_op_orden_empresa_fkey
    FOREIGN KEY (id_orden_produccion, id_empresa)
    REFERENCES costeo.orden_produccion (id_orden_produccion, id_empresa)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ck_material_op_origen CHECK (origen IN ('PLANTILLA', 'INVENTARIO')),
  CONSTRAINT ck_material_op_carga CHECK (origen <> 'PLANTILLA' OR id_carga_material IS NOT NULL),
  CONSTRAINT ck_material_op_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_material_op_costo CHECK (costo_unitario IS NULL OR costo_unitario >= 0),
  -- Sin salida no hay entrega ni fecha de entrega; con salida van las tres juntas.
  CONSTRAINT ck_material_op_entrega CHECK (
    (salida_sac IS NULL AND fecha_entrega IS NULL AND entregado_en IS NULL AND entregado_por IS NULL)
    OR (salida_sac IS NOT NULL AND fecha_entrega IS NOT NULL AND entregado_en IS NOT NULL AND entregado_por IS NOT NULL)
  ),
  CONSTRAINT ck_material_op_anulacion CHECK (
    (anulado_en IS NULL AND anulado_por IS NULL AND motivo_anulacion IS NULL)
    OR (anulado_en IS NOT NULL AND anulado_por IS NOT NULL)
  )
);

CREATE INDEX ix_material_op_planificacion ON costeo.material_op (id_empresa, orden_planificacion);
CREATE INDEX ix_material_op_orden ON costeo.material_op (id_orden_produccion);
CREATE INDEX ix_material_op_codigo_op ON costeo.material_op (id_empresa, codigo_op);
CREATE INDEX ix_material_op_insumo ON costeo.material_op (id_insumo);
CREATE INDEX ix_material_op_salida ON costeo.material_op (id_empresa, salida_sac) WHERE salida_sac IS NOT NULL;
-- Los pendientes vigentes son lo que bodega mira todos los días: índice parcial.
CREATE INDEX ix_material_op_pendientes ON costeo.material_op (id_empresa, fecha_planificador)
  WHERE entregado_en IS NULL AND anulado_en IS NULL;

-- Vista para los tableros: un ítem vigente por fila, con su OP, cliente e insumo ya resueltos.
CREATE OR REPLACE VIEW analitica.v_materiales_op AS
SELECT
  m.id_material_op,
  m.id_empresa,
  m.orden_planificacion,
  m.fecha_planificador,
  to_char(m.fecha_planificador, 'YYYY-MM')                               AS anio_mes,
  (m.creado_en AT TIME ZONE 'America/Guatemala')::date                   AS fecha_carga,
  m.fecha_entrega,
  m.codigo_op,
  cli.nombre                                                             AS cliente,
  i.codigo                                                               AS insumo,
  i.descripcion                                                          AS insumo_descripcion,
  cat.nombre                                                             AS categoria,
  um.nombre                                                              AS unidad,
  m.cantidad,
  m.costo_unitario,
  m.costo_total,
  (m.costo_unitario IS NULL)                                             AS sin_costo,
  m.salida_sac,
  (m.entregado_en IS NOT NULL)                                           AS entregado,
  CASE WHEN m.entregado_en IS NULL THEN 'PENDIENTE' ELSE 'ENTREGADO' END AS estado,
  (m.id_orden_produccion IS NOT NULL)                                    AS op_ligada,
  m.origen
FROM costeo.material_op m
JOIN recetas.insumos i ON i.id_insumo = m.id_insumo
JOIN recetas.categorias_insumo cat ON cat.id_categoria = i.id_categoria
JOIN recetas.unidades_medida um ON um.id_unidad = i.id_unidad
LEFT JOIN costeo.orden_produccion op ON op.id_orden_produccion = m.id_orden_produccion
LEFT JOIN recetas.clientes cli ON cli.id_cliente = op.id_cliente
WHERE m.anulado_en IS NULL;

COMMENT ON VIEW analitica.v_materiales_op IS
  'Una fila por ítem vigente de la explosión de materiales. costo_total es NULL (sin_costo) si el insumo no tenía precio al cargar. No se suman cantidades entre insumos: las unidades se mezclan.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_lector') THEN
    GRANT SELECT ON analitica.v_materiales_op TO bi_lector;
  END IF;
END
$$;
