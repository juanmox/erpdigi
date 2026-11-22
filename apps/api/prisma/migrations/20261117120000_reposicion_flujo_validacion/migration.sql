-- Reposiciones con flujo de validaciones (2026-11-17).
--
-- Hasta ahora una reposición nacía terminada: al guardarla se descontaba el papel
-- del rollo y se escribía en Google Sheets, sin que nadie la revisara. Ahora pasa
-- por 5 validaciones secuenciales, la impresión de la requisición y el despacho en
-- bodega, y el PAPEL SE DESCUENTA RECIÉN AL AUTORIZAR (paso 6), decisión del
-- usuario: la reimpresión física se hace después de autorizar.
--
--   1 creación (o corrección tras una devolución)
--   2 responsable del área · 3 calidad · 4 auditoría · 5 administración
--   6 autorización del despacho  ← acá nace el consumo_papel
--   7 impresión de la requisición · 8 despacho en bodega
--
-- ⚠️ NINGUNA fila existente se toca con UPDATE. `ck_reposicion_tipo_regla` es
-- NOT VALID y en producción hay filas que lo violan; un UPDATE vuelve a evaluar el
-- CHECK sobre ellas y abortaría la migración. Por eso:
--   · `estado` entra con DEFAULT 'HISTORICA' (ADD COLUMN con constante no reescribe
--     filas) y recién después el default pasa a 'EN_VALIDACION';
--   · `estado_desde` queda NULL en las históricas.
-- Todas las reposiciones anteriores quedan HISTORICA: ya descontaron papel y no
-- entran al flujo.

-- ── 1. Estado de la reposición ──────────────────────────────────────────────
ALTER TABLE costeo.reposicion
  ADD COLUMN estado varchar(20) NOT NULL DEFAULT 'HISTORICA',
  ADD COLUMN paso_pendiente smallint,
  ADD COLUMN estado_desde timestamptz(3);

ALTER TABLE costeo.reposicion ALTER COLUMN estado SET DEFAULT 'EN_VALIDACION';

ALTER TABLE costeo.reposicion
  ADD CONSTRAINT ck_reposicion_estado CHECK (
    estado IN ('EN_VALIDACION', 'DEVUELTA', 'POR_IMPRIMIR', 'POR_DESPACHAR', 'DESPACHADA', 'HISTORICA')
  ),
  -- El paso pendiente existe si y solo si está en validación, y es 2..6.
  ADD CONSTRAINT ck_reposicion_paso_pendiente CHECK (
    (estado = 'EN_VALIDACION') = (paso_pendiente IS NOT NULL)
    AND (paso_pendiente IS NULL OR paso_pendiente BETWEEN 2 AND 6)
  ),
  ADD CONSTRAINT ck_reposicion_estado_desde CHECK (
    estado = 'HISTORICA' OR estado_desde IS NOT NULL
  );

-- La regla por tipo exigía tipo de papel en toda REIMPRESION, pero ahora el papel
-- se conoce al autorizar (sale del rollo montado en ese momento). Mientras está en
-- validación o devuelta, la reimpresión ya lleva impresora, yardas y tela, pero no
-- tipo de papel. Sigue NOT VALID por las mismas filas viejas de siempre.
ALTER TABLE costeo.reposicion DROP CONSTRAINT ck_reposicion_tipo_regla;
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
        AND (id_tipo_papel IS NOT NULL OR estado IN ('EN_VALIDACION', 'DEVUELTA'))
        AND yardas_papel > 0
        AND id_insumo_tela IS NOT NULL
        AND yardas_tela >= 0
      ELSE false
    END
  ) NOT VALID;

CREATE INDEX ix_reposicion_flujo ON costeo.reposicion (estado, paso_pendiente) WHERE anulado_en IS NULL;
CREATE INDEX ix_reposicion_creado_por ON costeo.reposicion (creado_por, creado_en DESC);

-- ── 2. Eventos: la línea de tiempo y la fuente de las métricas ─────────────
-- Una fila por acto, escrita en la MISMA transacción que el cambio (mismo patrón
-- que costeo.material_op_historial). `desde` es cuándo quedó pendiente ese paso,
-- así que `segundos` es cuánto tardó en tiempo corrido (decisión del usuario).
-- El nombre va como TEXTO y la FK es SET NULL: si alguien se retira, lo que hizo
-- sobrevive.
CREATE TABLE costeo.reposicion_evento (
  id_evento       serial PRIMARY KEY,
  id_empresa      integer NOT NULL REFERENCES core.empresas(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT,
  id_reposicion   integer NOT NULL REFERENCES costeo.reposicion(id_reposicion) ON UPDATE CASCADE ON DELETE RESTRICT,
  accion          varchar(20) NOT NULL,
  paso            smallint NOT NULL,
  desde           timestamptz(3) NOT NULL,
  creado_en       timestamptz(3) NOT NULL DEFAULT now(),
  segundos        integer GENERATED ALWAYS AS (
                    greatest(0, floor(extract(epoch FROM (creado_en - desde))))::integer
                  ) STORED,
  motivo          text,
  -- [{ "campo": "...", "antes": "...", "despues": "..." }]
  cambios         jsonb NOT NULL DEFAULT '[]'::jsonb,
  id_usuario      integer REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE SET NULL,
  usuario_nombre  varchar(80) NOT NULL,

  CONSTRAINT ck_reposicion_evento_accion CHECK (
    accion IN ('CREAR', 'VALIDAR', 'DEVOLVER', 'CORREGIR', 'IMPRIMIR', 'REIMPRIMIR', 'DESPACHAR', 'ANULAR')
  ),
  CONSTRAINT ck_reposicion_evento_paso CHECK (paso BETWEEN 1 AND 8),
  CONSTRAINT ck_reposicion_evento_cambios CHECK (jsonb_typeof(cambios) = 'array'),
  -- Devolver y anular exigen explicación.
  CONSTRAINT ck_reposicion_evento_motivo CHECK (
    accion NOT IN ('DEVOLVER', 'ANULAR') OR length(btrim(coalesce(motivo, ''))) >= 3
  )
);

CREATE INDEX ix_reposicion_evento_repo ON costeo.reposicion_evento (id_reposicion, creado_en);
CREATE INDEX ix_reposicion_evento_empresa ON costeo.reposicion_evento (id_empresa, accion, paso, creado_en DESC);
CREATE INDEX ix_reposicion_evento_usuario ON costeo.reposicion_evento (id_usuario);

-- ── 3. Requisición de bodega ────────────────────────────────────────────────
-- 1:1 con la reposición. Tabla aparte porque el correlativo es POR EMPRESA y la
-- reposición no lleva empresa propia (la hereda de su OP). `codigo_repo` (R07) no
-- sirve de número: se repite en cada orden.
-- `numero_talonario` es opcional a propósito: por ahora conviven el número del ERP
-- y el del talonario físico, y más adelante se puede dejar uno solo sin tocar código.
CREATE TABLE costeo.requisicion_reposicion (
  id_requisicion       serial PRIMARY KEY,
  id_empresa           integer NOT NULL REFERENCES core.empresas(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT,
  numero               integer NOT NULL,
  id_reposicion        integer NOT NULL UNIQUE REFERENCES costeo.reposicion(id_reposicion) ON UPDATE CASCADE ON DELETE RESTRICT,
  impresa_en           timestamptz(3) NOT NULL DEFAULT now(),
  impresa_por          integer NOT NULL REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  impresiones          smallint NOT NULL DEFAULT 1,
  ultima_impresion_en  timestamptz(3) NOT NULL DEFAULT now(),
  numero_talonario     varchar(30),
  despachada_en        timestamptz(3),
  despachada_por       integer REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,

  CONSTRAINT uq_requisicion_reposicion_numero UNIQUE (id_empresa, numero),
  CONSTRAINT ck_requisicion_numero CHECK (numero > 0),
  CONSTRAINT ck_requisicion_impresiones CHECK (impresiones >= 1),
  CONSTRAINT ck_requisicion_despacho CHECK ((despachada_en IS NULL) = (despachada_por IS NULL)),
  CONSTRAINT ck_requisicion_talonario CHECK (numero_talonario IS NULL OR length(btrim(numero_talonario)) > 0)
);

-- ── 4. Vistas analíticas ────────────────────────────────────────────────────
-- Las reposiciones pendientes todavía NO consumieron nada: los tableros cuentan
-- solo las autorizadas (más las históricas). Mismas definiciones de antes, con ese
-- filtro agregado.

CREATE OR REPLACE VIEW analitica.v_reposiciones AS
 SELECT r.id_reposicion,
    op.id_empresa,
    r.fecha,
    (r.fecha AT TIME ZONE 'America/Guatemala'::text)::date AS fecha_dia,
    to_char((r.fecha AT TIME ZONE 'America/Guatemala'::text), 'YYYY-MM'::text) AS anio_mes,
    r.codigo_repo,
    r.tipo,
    op.codigo AS codigo_op,
    cli.nombre AS cliente,
    ( SELECT string_agg(DISTINCT COALESCE(es.nombre, es_op.nombre)::text, ', '::text ORDER BY (COALESCE(es.nombre, es_op.nombre)::text)) AS string_agg
           FROM costeo.linea_produccion lp
             JOIN recetas.productos p ON p.id_producto = lp.id_producto
             LEFT JOIN recetas.estilos es ON es.id_estilo = p.id_estilo
             LEFT JOIN recetas.estilos es_op ON es_op.id_estilo = op.id_estilo
          WHERE lp.id_orden_produccion = op.id_orden_produccion) AS estilos,
    dep.nombre AS departamento,
    emp.nombres AS responsable,
    d.nombre AS defecto,
    d.categoria AS defecto_categoria,
    d.imputable_a,
    imp.codigo AS impresora,
    tp.nombre AS tipo_papel,
    r.yardas_papel,
    ins.descripcion AS tela,
    r.yardas_tela,
    ( SELECT count(*) AS count
           FROM costeo.reposicion_insumo ri
          WHERE ri.id_reposicion = r.id_reposicion) AS materiales_items,
    r.comentario
   FROM costeo.reposicion r
     JOIN costeo.orden_produccion op ON op.id_orden_produccion = r.id_orden_produccion
     LEFT JOIN recetas.clientes cli ON cli.id_cliente = op.id_cliente
     LEFT JOIN costeo.departamento dep ON dep.id_departamento = r.id_departamento
     LEFT JOIN costeo.empleado emp ON emp.id_empleado = r.id_empleado
     LEFT JOIN costeo.defecto d ON d.id_defecto = r.id_defecto
     LEFT JOIN costeo.impresora imp ON imp.id_impresora = r.id_impresora
     LEFT JOIN costeo.tipo_papel tp ON tp.id_tipo_papel = r.id_tipo_papel
     LEFT JOIN recetas.insumos ins ON ins.id_insumo = r.id_insumo_tela
  WHERE r.anulado_en IS NULL
    AND r.estado IN ('POR_IMPRIMIR', 'POR_DESPACHAR', 'DESPACHADA', 'HISTORICA');

CREATE OR REPLACE VIEW analitica.v_reposicion_prendas AS
 SELECT rp.id_reposicion_prenda,
    op.id_empresa,
    r.fecha,
    (r.fecha AT TIME ZONE 'America/Guatemala'::text)::date AS fecha_dia,
    to_char((r.fecha AT TIME ZONE 'America/Guatemala'::text), 'YYYY-MM'::text) AS anio_mes,
    r.codigo_repo,
    r.tipo,
    op.codigo AS codigo_op,
    cli.nombre AS cliente,
    sub.nombre AS marca,
    p.codigo AS producto,
    p.descripcion AS producto_descripcion,
    p.deporte,
    es.nombre AS estilo,
    li.nombre AS linea,
    ge.nombre AS genero,
    co.nombre AS composicion,
    t.nombre AS talla,
    pz.nombre AS pieza,
    rp.cantidad AS piezas,
    dep.nombre AS departamento,
    d.nombre AS defecto,
    d.categoria AS defecto_categoria,
    d.imputable_a
   FROM costeo.reposicion_prenda rp
     JOIN costeo.reposicion r ON r.id_reposicion = rp.id_reposicion
     JOIN costeo.orden_produccion op ON op.id_orden_produccion = r.id_orden_produccion
     JOIN recetas.productos p ON p.id_producto = rp.id_producto
     JOIN recetas.tallas t ON t.id_talla = rp.id_talla
     JOIN costeo.pieza pz ON pz.id_pieza = rp.id_pieza
     LEFT JOIN recetas.clientes cli ON cli.id_cliente = op.id_cliente
     LEFT JOIN recetas.subclientes sub ON sub.id_subcliente = p.id_subcliente
     LEFT JOIN recetas.estilos es ON es.id_estilo = p.id_estilo
     LEFT JOIN recetas.lineas li ON li.id_linea = p.id_linea
     LEFT JOIN recetas.generos ge ON ge.id_genero = p.id_genero
     LEFT JOIN recetas.composiciones co ON co.id_composicion = p.id_composicion
     LEFT JOIN costeo.departamento dep ON dep.id_departamento = r.id_departamento
     LEFT JOIN costeo.defecto d ON d.id_defecto = r.id_defecto
  WHERE r.anulado_en IS NULL
    AND r.estado IN ('POR_IMPRIMIR', 'POR_DESPACHAR', 'DESPACHADA', 'HISTORICA');

CREATE OR REPLACE VIEW analitica.v_ordenes AS
 WITH lineas AS (
         SELECT lp.id_orden_produccion,
            count(*) AS items,
            count(*) FILTER (WHERE (EXISTS ( SELECT 1
                   FROM costeo.consumo_papel c_1
                  WHERE c_1.id_linea_produccion = lp.id_linea_produccion AND c_1.origen::text = 'PRODUCCION'::text AND c_1.anulado_en IS NULL)) AND NOT (EXISTS ( SELECT 1
                   FROM costeo.linea_produccion_talla lt
                     JOIN recetas.tallas t ON t.id_talla = lt.id_talla AND t.nombre::text = 'YARDAS'::text
                  WHERE lt.id_linea_produccion = lp.id_linea_produccion AND lt.cantidad > COALESCE(( SELECT sum(c_1.cantidad) AS sum
                           FROM costeo.consumo_papel c_1
                          WHERE c_1.id_linea_produccion = lp.id_linea_produccion AND c_1.id_talla = lt.id_talla AND c_1.origen::text = 'PRODUCCION'::text AND c_1.anulado_en IS NULL), 0::bigint)))) AS items_impresos,
            COALESCE(sum(( SELECT sum(lt.cantidad) AS sum
                   FROM costeo.linea_produccion_talla lt
                     JOIN recetas.tallas t ON t.id_talla = lt.id_talla
                  WHERE lt.id_linea_produccion = lp.id_linea_produccion AND t.nombre::text <> 'YARDAS'::text)), 0::numeric) AS piezas,
            COALESCE(sum(( SELECT sum(lt.cantidad) AS sum
                   FROM costeo.linea_produccion_talla lt
                     JOIN recetas.tallas t ON t.id_talla = lt.id_talla
                  WHERE lt.id_linea_produccion = lp.id_linea_produccion AND t.nombre::text = 'YARDAS'::text)), 0::numeric) AS yardas_servicio
           FROM costeo.linea_produccion lp
          GROUP BY lp.id_orden_produccion
        ), consumo AS (
         SELECT consumo_papel.id_orden_produccion,
            min(consumo_papel.fecha) AS primer_consumo,
            sum(consumo_papel.consumo_yd) AS impresion_yd,
            sum(consumo_papel.enguiamiento_yd) AS enguiamiento_yd,
            sum(consumo_papel.en_blanco_yd) AS en_blanco_yd,
            COALESCE(sum(consumo_papel.cantidad) FILTER (WHERE consumo_papel.id_talla IS NULL AND consumo_papel.origen::text = 'PRODUCCION'::text), 0::bigint) AS yardas_sin_talla
           FROM costeo.consumo_papel
          WHERE consumo_papel.anulado_en IS NULL AND consumo_papel.origen::text <> 'REPOSICION'::text
          GROUP BY consumo_papel.id_orden_produccion
        ), repos AS (
         SELECT reposicion.id_orden_produccion,
            count(*) AS reposiciones,
            sum(reposicion.yardas_papel) AS reposicion_yd
           FROM costeo.reposicion
          WHERE reposicion.anulado_en IS NULL AND reposicion.estado IN ('POR_IMPRIMIR', 'POR_DESPACHAR', 'DESPACHADA', 'HISTORICA')
          GROUP BY reposicion.id_orden_produccion
        )
 SELECT op.id_orden_produccion,
    op.id_empresa,
    op.codigo AS codigo_op,
    op.anio,
    cli.nombre AS cliente,
    op.orden_compra,
    op.fecha_recibido,
    op.fecha_compromiso,
    (c.primer_consumo AT TIME ZONE 'America/Guatemala'::text)::date AS fecha_impresion,
    op.estatus,
    COALESCE(l.items, 0::bigint) AS items,
    COALESCE(l.items_impresos, 0::bigint) AS items_impresos,
    COALESCE(l.items, 0::bigint) - COALESCE(l.items_impresos, 0::bigint) AS items_pendientes,
        CASE
            WHEN COALESCE(l.items, 0::bigint) = 0 THEN 'SIN_ITEMS'::text
            WHEN l.items_impresos = 0 THEN 'PENDIENTE'::text
            WHEN l.items_impresos < l.items THEN 'PARCIAL'::text
            ELSE 'IMPRESA'::text
        END AS estado_impresion,
    COALESCE(l.piezas, 0::numeric) AS piezas,
    COALESCE(c.impresion_yd, 0::numeric) AS impresion_yd,
    COALESCE(c.enguiamiento_yd, 0::numeric) AS enguiamiento_yd,
    COALESCE(c.en_blanco_yd, 0::numeric) AS en_blanco_yd,
    COALESCE(rp.reposiciones, 0::bigint) AS reposiciones,
    COALESCE(rp.reposicion_yd, 0::numeric) AS reposicion_yd,
    COALESCE(c.impresion_yd, 0::numeric) + COALESCE(c.enguiamiento_yd, 0::numeric) + COALESCE(c.en_blanco_yd, 0::numeric) + COALESCE(rp.reposicion_yd, 0::numeric) AS total_yd,
    of_.codigo AS codigo_of,
    of_.numero_factura,
    of_.fecha_factura,
    COALESCE(l.yardas_servicio, 0::numeric) + COALESCE(c.yardas_sin_talla, 0::bigint)::numeric AS yardas_servicio
   FROM costeo.orden_produccion op
     LEFT JOIN recetas.clientes cli ON cli.id_cliente = op.id_cliente
     LEFT JOIN lineas l ON l.id_orden_produccion = op.id_orden_produccion
     LEFT JOIN consumo c ON c.id_orden_produccion = op.id_orden_produccion
     LEFT JOIN repos rp ON rp.id_orden_produccion = op.id_orden_produccion
     LEFT JOIN costeo.of_op ofo ON ofo.id_orden_produccion = op.id_orden_produccion AND ofo.anulado_en IS NULL
     LEFT JOIN costeo.orden_facturacion of_ ON of_.id_orden_facturacion = ofo.id_orden_facturacion AND of_.anulada_en IS NULL;

-- Tiempos del flujo, para un tablero futuro. Una fila por evento.
CREATE VIEW analitica.v_reposicion_tiempos AS
SELECT
  e.id_evento,
  e.id_empresa,
  e.id_reposicion,
  op.codigo AS codigo_op,
  r.codigo_repo,
  r.tipo,
  e.accion,
  e.paso,
  CASE e.paso
    WHEN 1 THEN 'Creación'
    WHEN 2 THEN 'Responsable del área'
    WHEN 3 THEN 'Calidad'
    WHEN 4 THEN 'Auditoría'
    WHEN 5 THEN 'Administración'
    WHEN 6 THEN 'Autorización'
    WHEN 7 THEN 'Impresión de requisición'
    WHEN 8 THEN 'Despacho en bodega'
  END AS paso_nombre,
  e.usuario_nombre AS usuario,
  e.desde,
  e.creado_en,
  (e.creado_en AT TIME ZONE 'America/Guatemala')::date AS fecha_dia,
  e.segundos,
  round(e.segundos / 3600.0, 2) AS horas,
  e.motivo
FROM costeo.reposicion_evento e
JOIN costeo.reposicion r ON r.id_reposicion = e.id_reposicion
JOIN costeo.orden_produccion op ON op.id_orden_produccion = r.id_orden_produccion;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_lector') THEN
    GRANT SELECT ON analitica.v_reposicion_tiempos TO bi_lector;
  END IF;
END $$;
