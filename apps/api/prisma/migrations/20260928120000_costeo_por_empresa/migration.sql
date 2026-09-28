-- Costeo separado por empresa (2026-09-28).
--
-- Hallazgo que motivó esto: al estrenar el cambio de empresa desde el menú del
-- avatar, el usuario notó que parado en Digitalpro veía las órdenes de
-- Digitexsa. No era un filtro mal puesto — NO HABÍA NINGUNA separación por
-- empresa en los datos. `id_empresa` existía solo en tres tablas, las tres de
-- `core` (`empresas`, `usuario_empresa_rol`, `auditoria`). Ni una tabla de
-- `recetas` ni de `costeo` la tenía, así que el `idEmpresa` del token decidía
-- qué permisos tenías y qué se sellaba en auditoría, nunca qué datos veías.
--
-- Alcance decidido con el usuario, no inferido:
--   * Solo Costeo se separa. `recetas` (clientes, productos, desarrollos,
--     insumos, cotizaciones) queda como catálogo corporativo compartido.
--   * La planta es una sola y los equipos son compartidos: `impresora`,
--     `tipo_papel`, `calandra`, `factura_papel`, `rollo_papel` y
--     `montaje_rollo` NO se parten. El papel de un rollo lo consumen las dos
--     empresas y el restante del panel es legítimamente la suma de ambas.
--   * `consumo_estandar` tampoco se parte: es una propiedad del producto
--     (producto+talla → pulgadas de papel) y los productos son compartidos.
--   * Lo que se separa es el trabajo: a qué empresa pertenece cada orden de
--     producción, y por herencia sus líneas, consumos y reposiciones.
--
-- Fuera de alcance a propósito: `costeo.orden_facturacion` y `costeo.empleado`
-- están vacías y sin módulo construido (F5 y RRHH de Fase 4). Cuando se
-- construyan hay que decidir su tenencia ahí, con el diseño a la vista, en vez
-- de adivinarla hoy.

-- ---------------------------------------------------------------- 1) La raíz
ALTER TABLE "costeo"."orden_produccion"
  ADD COLUMN "id_empresa" INTEGER;

-- Las 68 OP que existen hoy son todas de Digitexsa: son las 67 cargadas desde
-- `OrigenConsumo DIGITEXSA Mig.xlsx` más la OP de ejemplo de F3. Digitalpro
-- nunca cargó nada, justamente porque hasta hoy no había dónde distinguirlo.
UPDATE "costeo"."orden_produccion"
  SET "id_empresa" = (SELECT "id_empresa" FROM "core"."empresas" WHERE "codigo" = 'DIGITEXSA')
  WHERE "id_empresa" IS NULL;

-- Aborta si quedó alguna sin empresa: preferimos que la migración falle a
-- dejar una OP huérfana que después no se sabría de quién es.
DO $$
DECLARE huerfanas INTEGER;
BEGIN
  SELECT count(*) INTO huerfanas FROM "costeo"."orden_produccion" WHERE "id_empresa" IS NULL;
  IF huerfanas > 0 THEN
    RAISE EXCEPTION 'Quedaron % ordenes de produccion sin id_empresa', huerfanas;
  END IF;
END $$;

ALTER TABLE "costeo"."orden_produccion"
  ALTER COLUMN "id_empresa" SET NOT NULL;

ALTER TABLE "costeo"."orden_produccion"
  ADD CONSTRAINT "orden_produccion_id_empresa_fkey"
  FOREIGN KEY ("id_empresa") REFERENCES "core"."empresas"("id_empresa")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- El correlativo de la OP NO lo genera el ERP: viene del código que se importa
-- (`26OP010439`), o sea del sistema con el que Diseño ya trabaja. Por eso la
-- unicidad pasa a ser por empresa — cada una trae su propia numeración y
-- Digitalpro debe poder tener su `26OP000001` sin chocar con la de Digitexsa.
-- Es estrictamente más permisivo que lo de antes, así que no puede invalidar
-- ningún dato existente.
ALTER TABLE "costeo"."orden_produccion"
  DROP CONSTRAINT IF EXISTS "orden_produccion_anio_correlativo_key";
DROP INDEX IF EXISTS "costeo"."orden_produccion_anio_correlativo_key";

CREATE UNIQUE INDEX "orden_produccion_id_empresa_anio_correlativo_key"
  ON "costeo"."orden_produccion" ("id_empresa", "anio", "correlativo");

-- Para el filtro por empresa de los listados.
CREATE INDEX "idx_op_empresa" ON "costeo"."orden_produccion" ("id_empresa");

-- Par (id, empresa) sobre la raíz: es lo que hace posible la FK compuesta de
-- `linea_produccion` de más abajo. Redundante como restricción (id_orden_produccion
-- ya es PK), pero Postgres exige un UNIQUE sobre las columnas exactas a las que
-- apunta una FK.
ALTER TABLE "costeo"."orden_produccion"
  ADD CONSTRAINT "orden_produccion_id_empresa_uq" UNIQUE ("id_orden_produccion", "id_empresa");

-- ------------------------------------------------------------- 2) Las líneas
-- `linea_produccion` lleva `id_empresa` propio por dos motivos concretos, no
-- por simetría:
--   (a) `codigo_line` era UNIQUE global. El LINE es el identificador de línea
--       del pedido del cliente (`7011685109-UA`) y viene de afuera; dos
--       empresas con clientes distintos podrían repetirlo. Pasa a ser único
--       por empresa.
--   (b) la consulta de trabajo pendiente de "Impresión de OPs" recorre líneas,
--       no órdenes, y es la pantalla más usada del módulo: con la columna acá
--       filtra sin join.
ALTER TABLE "costeo"."linea_produccion"
  ADD COLUMN "id_empresa" INTEGER;

UPDATE "costeo"."linea_produccion" lp
  SET "id_empresa" = op."id_empresa"
  FROM "costeo"."orden_produccion" op
  WHERE op."id_orden_produccion" = lp."id_orden_produccion";

DO $$
DECLARE huerfanas INTEGER;
BEGIN
  SELECT count(*) INTO huerfanas FROM "costeo"."linea_produccion" WHERE "id_empresa" IS NULL;
  IF huerfanas > 0 THEN
    RAISE EXCEPTION 'Quedaron % lineas de produccion sin id_empresa', huerfanas;
  END IF;
END $$;

ALTER TABLE "costeo"."linea_produccion"
  ALTER COLUMN "id_empresa" SET NOT NULL;

-- FK COMPUESTA, no una FK suelta a `core.empresas`. Esto es lo que garantiza
-- —en la base, sin trigger ni chequeo en la aplicación— que la empresa de una
-- línea SIEMPRE sea la de su orden. Una FK simple dejaría escribir una línea de
-- Digitalpro colgando de una OP de Digitexsa, que es exactamente la clase de
-- mezcla silenciosa que esta migración existe para impedir.
ALTER TABLE "costeo"."linea_produccion"
  ADD CONSTRAINT "linea_produccion_orden_empresa_fkey"
  FOREIGN KEY ("id_orden_produccion", "id_empresa")
  REFERENCES "costeo"."orden_produccion" ("id_orden_produccion", "id_empresa")
  ON UPDATE CASCADE ON DELETE RESTRICT;

DROP INDEX IF EXISTS "costeo"."linea_produccion_codigo_line_key";
CREATE UNIQUE INDEX "linea_produccion_id_empresa_codigo_line_key"
  ON "costeo"."linea_produccion" ("id_empresa", "codigo_line");

CREATE INDEX "idx_linea_produccion_empresa" ON "costeo"."linea_produccion" ("id_empresa");

-- ------------------------------------------- 3) Identidad visual por empresa
-- Color de marca en la base y no incrustado en el frontend, mismo criterio que
-- `recetas.tallas.frecuente`: queda explícito en el modelo y se ajusta con un
-- UPDATE, sin desplegar. Es solo presentación — no participa de ningún cálculo
-- ni de ninguna regla de acceso.
--
-- Existe porque el usuario pidió poder distinguir de un vistazo en qué empresa
-- está trabajando: "evitar confusiones que posiblemente repercutan gravemente
-- al hacer una transacción de una empresa en otra".
ALTER TABLE "core"."empresas"
  ADD COLUMN "color_marca" VARCHAR(7);

ALTER TABLE "core"."empresas"
  ADD CONSTRAINT "ck_empresas_color_marca"
  CHECK ("color_marca" IS NULL OR "color_marca" ~ '^#[0-9A-Fa-f]{6}$');

-- Digitexsa conserva el azul corporativo que ya es `--accent-brand` en el
-- frontend. Digitalpro estrena un color deliberadamente lejano en tono, no una
-- variante del azul: la señal tiene que leerse de reojo.
UPDATE "core"."empresas" SET "color_marca" = '#203080' WHERE "codigo" = 'DIGITEXSA';
UPDATE "core"."empresas" SET "color_marca" = '#0f766e' WHERE "codigo" = 'CASTA';
