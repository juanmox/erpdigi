-- ============================================================================
-- Desarrollo pasa a ser entidad de primera clase y DUEÑO PERMANENTE de la
-- receta (BOM) y de la mano de obra. Invierte el modelo anterior, donde la
-- receta colgaba del Producto y `desarrollo` era apenas texto libre.
--
-- Decisiones del usuario (2026-08-26):
--   1. 01_erp ya no se usa para EDITAR RECETAS -> el BOM sale de
--      producto_insumos. Esa tabla NO se borra ni se vacía: queda congelada.
--   2. El Desarrollo es dueño de la receta antes y después de aprobarse.
--      El Producto nunca posee receta propia.
--   3. Estados: BORRADOR -> APROBADO, exactamente dos.
--   4. La mano de obra (minutos_mo / costo_mo_minuto) se muda a Desarrollo.
--      Las columnas de productos quedan como legacy para no romper 01_erp.
--   5. Desarrollo <-> Producto es 1:1 (ya impuesto por productos_desarrollo_key,
--      migración 20260820120000).
--   9. SIN llave foránea productos.desarrollo -> desarrollos.codigo: 01_erp
--      ESCRIBE esa columna como texto libre al dar de alta/editar productos
--      (app.js 1195, 1232, 1380, 1900) y sigue en producción; una FK real haría
--      fallar esas 4 pantallas con 23503. La integridad la valida el backend
--      nuevo. Agregar la FK es una migración de una línea cuando 01_erp se
--      apague (Fase 5).
--
-- Verificado contra los datos reales ANTES de escribir esta migración:
--   1,287 productos / 1,285 con desarrollo (los 2 sin desarrollo son los
--   productos de prueba TEST-PROD-01 y TEST-BULK-01) / 1,285 desarrollos
--   distintos, también distintos en minúsculas y sin espacios al borde;
--   49 líneas en producto_insumos repartidas en 5 productos; 6 productos con
--   minutos_mo > 0; 0 duplicados (id_producto, id_insumo, id_area);
--   los 1,285 tienen tamano='L', que resuelve contra recetas.tallas.
--
-- Esta migración es casi enteramente ADITIVA (no borra datos ni columnas), así
-- que el rollback es restaurar la definición vieja de v_producto_costo y
-- borrar lo creado. Ver rollback.sql al lado de este archivo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tablas nuevas
-- ---------------------------------------------------------------------------
CREATE TABLE "recetas"."desarrollos" (
    "id_desarrollo"   SERIAL NOT NULL,
    "codigo"          VARCHAR(40) NOT NULL,
    "descripcion"     VARCHAR(250) NOT NULL,
    "estado"          VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
    "id_cliente"      INTEGER,
    "id_talla_base"   INTEGER,
    "minutos_mo"      DECIMAL(10,2) NOT NULL DEFAULT 0,
    "costo_mo_minuto" DECIMAL(10,4) NOT NULL DEFAULT 0.33,
    "notas"           TEXT,
    "activo"          BOOLEAN NOT NULL DEFAULT true,
    "creado_en"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por"      INTEGER,
    "aprobado_en"     TIMESTAMPTZ(6),
    "aprobado_por"    INTEGER,

    CONSTRAINT "desarrollos_pkey" PRIMARY KEY ("id_desarrollo")
);

-- Solo dos estados, impuesto por la base y no solo por la aplicación (mismo
-- criterio que los CHECK de enum sobre VARCHAR de costeo, migración
-- 20260810224449).
ALTER TABLE "recetas"."desarrollos"
  ADD CONSTRAINT "ck_desarrollo_estado" CHECK ("estado" IN ('BORRADOR','APROBADO'));

-- Coherencia: un desarrollo aprobado tiene fecha de aprobación, y uno en
-- borrador no. Evita estados a medias por un UPDATE manual.
ALTER TABLE "recetas"."desarrollos"
  ADD CONSTRAINT "ck_desarrollo_aprobado_en" CHECK (
    ("estado" = 'APROBADO' AND "aprobado_en" IS NOT NULL) OR
    ("estado" = 'BORRADOR' AND "aprobado_en" IS NULL)
  );

CREATE UNIQUE INDEX "desarrollos_codigo_key" ON "recetas"."desarrollos"("codigo");
CREATE INDEX "idx_desarrollo_estado"  ON "recetas"."desarrollos"("estado");
CREATE INDEX "idx_desarrollo_cliente" ON "recetas"."desarrollos"("id_cliente");

CREATE TABLE "recetas"."desarrollo_insumos" (
    "id_desarrollo_insumo" SERIAL NOT NULL,
    "id_desarrollo"        INTEGER NOT NULL,
    "id_insumo"            INTEGER NOT NULL,
    "consumo"              DECIMAL(14,6) NOT NULL DEFAULT 0,
    "id_area"              INTEGER,

    CONSTRAINT "desarrollo_insumos_pkey" PRIMARY KEY ("id_desarrollo_insumo")
);

-- NULLS NOT DISTINCT es deliberado y corrige de origen un bug real heredado de
-- producto_insumos: con el default (NULLS DISTINCT) se puede insertar dos veces
-- el mismo insumo con id_area NULL, y el "ON CONFLICT (...) DO UPDATE" del
-- import nunca dispara para esas filas -- en vez de actualizar el consumo,
-- duplica la línea y el costo sale inflado en silencio.
-- Requiere PostgreSQL >= 15 (local es 18.4; verificar en producción).
-- Prisma no expresa esta cláusula: el @@unique del schema lleva un comentario
-- "// + SQL:" advirtiéndolo, y todo `migrate diff` futuro va a querer
-- recrear el índice sin ella.
CREATE UNIQUE INDEX "desarrollo_insumos_id_desarrollo_id_insumo_id_area_key"
  ON "recetas"."desarrollo_insumos"("id_desarrollo","id_insumo","id_area")
  NULLS NOT DISTINCT;

CREATE INDEX "idx_desins_desarrollo" ON "recetas"."desarrollo_insumos"("id_desarrollo");

ALTER TABLE "recetas"."desarrollos" ADD CONSTRAINT "desarrollos_id_cliente_fkey"
  FOREIGN KEY ("id_cliente") REFERENCES "recetas"."clientes"("id_cliente")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "recetas"."desarrollos" ADD CONSTRAINT "desarrollos_id_talla_base_fkey"
  FOREIGN KEY ("id_talla_base") REFERENCES "recetas"."tallas"("id_talla")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "recetas"."desarrollo_insumos" ADD CONSTRAINT "desarrollo_insumos_id_desarrollo_fkey"
  FOREIGN KEY ("id_desarrollo") REFERENCES "recetas"."desarrollos"("id_desarrollo")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "recetas"."desarrollo_insumos" ADD CONSTRAINT "desarrollo_insumos_id_insumo_fkey"
  FOREIGN KEY ("id_insumo") REFERENCES "recetas"."insumos"("id_insumo")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "recetas"."desarrollo_insumos" ADD CONSTRAINT "desarrollo_insumos_id_area_fkey"
  FOREIGN KEY ("id_area") REFERENCES "recetas"."areas_uso"("id_area")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- 2. Datos: un desarrollo por cada código ya en uso.
--    Todos nacen APROBADO porque ya están asignados a un producto vivo -- no
--    son prototipos en curso. aprobado_por queda NULL a propósito: no hay un
--    usuario real al que atribuirle el backfill, e inventarlo sería peor.
--    La talla base se resuelve contra recetas.tallas por nombre (verificado:
--    los 1,285 son 'L' y resuelven; si alguno no resolviera queda NULL).
-- ---------------------------------------------------------------------------
INSERT INTO "recetas"."desarrollos"
  ("codigo","descripcion","estado","id_cliente","id_talla_base",
   "minutos_mo","costo_mo_minuto","aprobado_en","notas")
SELECT p."desarrollo",
       p."descripcion",
       'APROBADO',
       p."id_cliente",
       t."id_talla",
       p."minutos_mo",
       p."costo_mo_minuto",
       CURRENT_TIMESTAMP,
       'Creado automáticamente al promover Desarrollo a entidad (migración 20260826120000).'
FROM "recetas"."productos" p
LEFT JOIN "recetas"."tallas" t ON t."nombre" = p."tamano"
WHERE p."desarrollo" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Datos: copia del BOM producto_insumos -> desarrollo_insumos.
--    OJO: de las 49 líneas actuales solo 47 son migrables. Las otras 2 son de
--    TEST-BULK-01, que tiene receta pero desarrollo NULL (dato de prueba;
--    CLAUDE.md pide no tocar TEST sin confirmar, así que NO se le inventa un
--    desarrollo). Quedan solo en producto_insumos, que se conserva congelada.
-- ---------------------------------------------------------------------------
INSERT INTO "recetas"."desarrollo_insumos"
  ("id_desarrollo","id_insumo","consumo","id_area")
SELECT d."id_desarrollo", pi."id_insumo", pi."consumo", pi."id_area"
FROM "recetas"."producto_insumos" pi
JOIN "recetas"."productos"   p ON p."id_producto" = pi."id_producto"
JOIN "recetas"."desarrollos" d ON d."codigo"      = p."desarrollo";

-- Red de seguridad: si el conteo no cuadra, aborta la migración entera en vez
-- de dejar el BOM a medias.
DO $$
DECLARE origen INT; copiadas INT; huerfanas INT;
BEGIN
  SELECT count(*) INTO origen   FROM "recetas"."producto_insumos";
  SELECT count(*) INTO copiadas FROM "recetas"."desarrollo_insumos";
  SELECT count(*) INTO huerfanas
    FROM "recetas"."producto_insumos" pi
    JOIN "recetas"."productos" p ON p."id_producto" = pi."id_producto"
   WHERE p."desarrollo" IS NULL;
  RAISE NOTICE 'BOM: % líneas en producto_insumos, % copiadas, % huérfanas (producto sin desarrollo)',
    origen, copiadas, huerfanas;
  IF copiadas + huerfanas <> origen THEN
    RAISE EXCEPTION 'Conteo inconsistente al copiar el BOM: % copiadas + % huérfanas <> % origen',
      copiadas, huerfanas, origen;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Vistas de costo.
--    v_desarrollo_costo es la fuente única; v_producto_costo se apoya en ella
--    para que el costo del producto y el de su desarrollo no puedan divergir.
--
--    CREATE OR REPLACE (no DROP + CREATE) conserva la vista existente sin
--    ventana de indisponibilidad: 01_erp la lee en app.js 108/210/295/371.
--    Solo funciona porque la lista de columnas, su orden y sus tipos no
--    cambian; si algún día cambian, Postgres exige DROP VIEW.
--
--    ⚠️ INVARIANTE: v_producto_costo debe devolver SIEMPRE una fila por
--    producto, incluidos los que no tienen desarrollo -- listar() de
--    productos.service.ts hace JOIN (no LEFT JOIN) contra ella, así que un
--    producto sin fila DESAPARECERÍA del catálogo sin ningún error visible.
--    De ahí que el FROM siga siendo recetas.productos con LEFT JOINs.
-- ---------------------------------------------------------------------------
CREATE VIEW "recetas"."v_desarrollo_costo" AS
SELECT d.id_desarrollo,
       d.codigo,
       COALESCE(sum(di.consumo * i.costo_promedio), 0::numeric) AS costo_insumos,
       (d.minutos_mo * d.costo_mo_minuto)                       AS costo_mano_obra,
       COALESCE(sum(di.consumo * i.costo_promedio), 0::numeric)
         + (d.minutos_mo * d.costo_mo_minuto)                   AS costo_unitario
FROM recetas.desarrollos d
LEFT JOIN recetas.desarrollo_insumos di ON di.id_desarrollo = d.id_desarrollo
LEFT JOIN recetas.insumos i             ON i.id_insumo      = di.id_insumo
GROUP BY d.id_desarrollo;

CREATE OR REPLACE VIEW "recetas"."v_producto_costo" AS
SELECT p.id_producto,
       p.codigo,
       p.descripcion,
       COALESCE(vd.costo_insumos,   0::numeric) AS costo_insumos,
       COALESCE(vd.costo_mano_obra, 0::numeric) AS costo_mano_obra,
       COALESCE(vd.costo_unitario,  0::numeric) AS costo_unitario
FROM recetas.productos p
LEFT JOIN recetas.desarrollos        d  ON d.codigo        = p.desarrollo
LEFT JOIN recetas.v_desarrollo_costo vd ON vd.id_desarrollo = d.id_desarrollo;
