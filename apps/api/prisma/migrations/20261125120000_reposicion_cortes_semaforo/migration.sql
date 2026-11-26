-- Cortes de requisiciones, semáforo en minutos y entrega al solicitante (2026-11-25).
--
-- La operación real trabaja por CORTES (07:00, 09:00, 11:00, 14:00, 16:30, de lunes
-- a viernes): entre un corte y el siguiente se recopilan las reposiciones y se
-- validan los pasos 2 a 5; a la hora del corte se autoriza, se imprime y bodega
-- tiene ~30 min para dejar todo listo. Con el semáforo fijo de 24/48 h medido
-- "desde el último paso" nada de eso se podía evaluar.
--
-- 1. costeo.reposicion_corte          horarios de corte por empresa (configurables).
-- 2. costeo.reposicion_configuracion  minutos del semáforo y tolerancia para recoger.
-- 3. costeo.reposicion.corte_en       el corte al que quedó asignada (CONGELADO al crear).
-- 4. Estado POR_RECOGER               bodega avisa "lista"; falta que el solicitante recoja.
-- 5. requisicion_reposicion           lista_en / lista_por / recibido_por.
-- 6. reposicion_evento                acción PREPARAR (paso 8) y entrega en el paso 9.
-- 7. Vistas analíticas                POR_RECOGER cuenta como autorizada.
--
-- ⚠️ Ninguna fila HISTORICA se toca con UPDATE: ck_reposicion_tipo_regla es NOT VALID
-- y hay filas viejas que lo violan; un UPDATE lo reevaluaría y abortaría la migración.

-- ── 1. Cortes ───────────────────────────────────────────────────────────────
-- `hora` va como texto HH:MM (hora de Guatemala) y `dias` con ISO 1=lunes … 7=domingo.
CREATE TABLE costeo.reposicion_corte (
  id_corte    serial PRIMARY KEY,
  id_empresa  integer NOT NULL REFERENCES core.empresas(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT,
  hora        varchar(5) NOT NULL,
  dias        smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  CONSTRAINT uq_reposicion_corte_hora UNIQUE (id_empresa, hora),
  CONSTRAINT ck_reposicion_corte_hora CHECK (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT ck_reposicion_corte_dias CHECK (
    cardinality(dias) > 0 AND dias <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
  )
);

INSERT INTO costeo.reposicion_corte (id_empresa, hora)
SELECT e.id_empresa, h.hora
FROM core.empresas e
CROSS JOIN (VALUES ('07:00'), ('09:00'), ('11:00'), ('14:00'), ('16:30')) AS h(hora);

-- ── 2. Semáforo ─────────────────────────────────────────────────────────────
-- Una fila por empresa. Va aparte de core.empresas para no cargar el core con
-- reglas de costeo. Sin fila, el código usa los mismos valores por defecto.
CREATE TABLE costeo.reposicion_configuracion (
  id_empresa        integer PRIMARY KEY REFERENCES core.empresas(id_empresa) ON UPDATE CASCADE ON DELETE RESTRICT,
  minutos_verde     integer NOT NULL DEFAULT 45,
  minutos_amarillo  integer NOT NULL DEFAULT 60,
  minutos_recoger   integer NOT NULL DEFAULT 15,
  actualizado_en    timestamptz(3) NOT NULL DEFAULT now(),
  actualizado_por   integer REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT ck_reposicion_config_semaforo CHECK (
    minutos_verde > 0 AND minutos_verde < minutos_amarillo AND minutos_amarillo <= 1440
  ),
  CONSTRAINT ck_reposicion_config_recoger CHECK (minutos_recoger BETWEEN 1 AND 1440)
);

INSERT INTO costeo.reposicion_configuracion (id_empresa)
SELECT id_empresa FROM core.empresas;

-- ── 3. Corte de cada reposición ─────────────────────────────────────────────
ALTER TABLE costeo.reposicion ADD COLUMN corte_en timestamptz(3);

CREATE INDEX ix_reposicion_corte ON costeo.reposicion (corte_en)
  WHERE anulado_en IS NULL AND corte_en IS NOT NULL;

-- Primer corte configurado POSTERIOR al instante (estrictamente: a las 09:00:00 en
-- punto va al de las 11:00), en un día que ese corte atienda. Hora de Guatemala.
-- Temporal: solo sirve para rellenar lo que ya está en el flujo. La misma regla
-- vive en apps/api/src/common/cortes-reposicion.ts.
CREATE FUNCTION pg_temp.siguiente_corte(p_empresa integer, p_instante timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT min(c.corte)
  FROM (
    SELECT ((d::date + k.hora::time) AT TIME ZONE 'America/Guatemala') AS corte
    FROM generate_series(
           (p_instante AT TIME ZONE 'America/Guatemala')::date,
           (p_instante AT TIME ZONE 'America/Guatemala')::date + 8,
           interval '1 day') AS d
    JOIN costeo.reposicion_corte k
      ON k.id_empresa = p_empresa
     AND extract(isodow FROM d)::smallint = ANY (k.dias)
  ) c
  WHERE c.corte > p_instante
$$;

-- Solo lo que está en el flujo. Las HISTORICA no pasan por cortes.
UPDATE costeo.reposicion r
SET corte_en = pg_temp.siguiente_corte(op.id_empresa, r.creado_en)
FROM costeo.orden_produccion op
WHERE op.id_orden_produccion = r.id_orden_produccion
  AND r.estado <> 'HISTORICA';

-- ── 4. Estado POR_RECOGER ───────────────────────────────────────────────────
ALTER TABLE costeo.reposicion DROP CONSTRAINT ck_reposicion_estado;
ALTER TABLE costeo.reposicion
  ADD CONSTRAINT ck_reposicion_estado CHECK (
    estado IN ('EN_VALIDACION', 'DEVUELTA', 'POR_IMPRIMIR', 'POR_DESPACHAR', 'POR_RECOGER', 'DESPACHADA', 'HISTORICA')
  );

-- ── 5. Requisición: "lista" y "entregada" son dos actos ─────────────────────
ALTER TABLE costeo.requisicion_reposicion
  ADD COLUMN lista_en     timestamptz(3),
  ADD COLUMN lista_por    integer REFERENCES core.usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD COLUMN recibido_por varchar(80);

-- Lo ya despachado antes de esta migración fue, de un solo acto, listo y entregado.
UPDATE costeo.requisicion_reposicion
SET lista_en = despachada_en, lista_por = despachada_por
WHERE despachada_en IS NOT NULL;

ALTER TABLE costeo.requisicion_reposicion
  ADD CONSTRAINT ck_requisicion_lista CHECK ((lista_en IS NULL) = (lista_por IS NULL)),
  ADD CONSTRAINT ck_requisicion_entrega_requiere_lista CHECK (despachada_en IS NULL OR lista_en IS NOT NULL),
  ADD CONSTRAINT ck_requisicion_recibido CHECK (recibido_por IS NULL OR length(btrim(recibido_por)) > 0);

-- ── 6. Eventos ──────────────────────────────────────────────────────────────
ALTER TABLE costeo.reposicion_evento DROP CONSTRAINT ck_reposicion_evento_accion;
ALTER TABLE costeo.reposicion_evento
  ADD CONSTRAINT ck_reposicion_evento_accion CHECK (
    accion IN ('CREAR', 'VALIDAR', 'DEVOLVER', 'CORREGIR', 'IMPRIMIR', 'REIMPRIMIR', 'DESPACHAR', 'ANULAR', 'SIN_VALIDACION', 'PREPARAR')
  );
ALTER TABLE costeo.reposicion_evento DROP CONSTRAINT ck_reposicion_evento_paso;
ALTER TABLE costeo.reposicion_evento
  ADD CONSTRAINT ck_reposicion_evento_paso CHECK (paso BETWEEN 1 AND 9);

-- Los DESPACHAR de antes (paso 8) eran listo+entregado en un solo acto: el tiempo de
-- bodega pasa a un PREPARAR (paso 8) y la entrega queda en el paso 9 con 0 segundos
-- (no hubo espera del solicitante que medir).
INSERT INTO costeo.reposicion_evento
  (id_empresa, id_reposicion, accion, paso, desde, creado_en, motivo, cambios, id_usuario, usuario_nombre)
SELECT id_empresa, id_reposicion, 'PREPARAR', 8, desde, creado_en, NULL, '[]'::jsonb, id_usuario, usuario_nombre
FROM costeo.reposicion_evento
WHERE accion = 'DESPACHAR' AND paso = 8;

UPDATE costeo.reposicion_evento
SET paso = 9, desde = creado_en
WHERE accion = 'DESPACHAR' AND paso = 8;

-- ── 7. Vistas analíticas ────────────────────────────────────────────────────
-- Una reposición lista para recoger ya consumió: sigue contando como autorizada.
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
    AND r.estado IN ('POR_IMPRIMIR', 'POR_DESPACHAR', 'POR_RECOGER', 'DESPACHADA', 'HISTORICA');

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
    AND r.estado IN ('POR_IMPRIMIR', 'POR_DESPACHAR', 'POR_RECOGER', 'DESPACHADA', 'HISTORICA');

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
          WHERE reposicion.anulado_en IS NULL AND reposicion.estado IN ('POR_IMPRIMIR', 'POR_DESPACHAR', 'POR_RECOGER', 'DESPACHADA', 'HISTORICA')
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


-- Tiempos del flujo, ahora con el nombre de los pasos 8 y 9 y el corte al final
-- (CREATE OR REPLACE solo permite agregar columnas al final).
CREATE OR REPLACE VIEW analitica.v_reposicion_tiempos AS
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
    WHEN 8 THEN 'Preparación en bodega'
    WHEN 9 THEN 'Entrega al solicitante'
  END AS paso_nombre,
  e.usuario_nombre AS usuario,
  e.desde,
  e.creado_en,
  (e.creado_en AT TIME ZONE 'America/Guatemala')::date AS fecha_dia,
  e.segundos,
  round(e.segundos / 3600.0, 2) AS horas,
  e.motivo,
  r.corte_en
FROM costeo.reposicion_evento e
JOIN costeo.reposicion r ON r.id_reposicion = e.id_reposicion
JOIN costeo.orden_produccion op ON op.id_orden_produccion = r.id_orden_produccion;
