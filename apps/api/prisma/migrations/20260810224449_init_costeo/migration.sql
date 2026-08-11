-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "costeo";

-- AlterTable
ALTER TABLE "recetas"."tallas" ADD COLUMN     "grupo" VARCHAR(20);

-- CreateTable
CREATE TABLE "costeo"."linea_producto" (
    "id_linea_producto" SERIAL NOT NULL,
    "id_cliente" INTEGER NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "linea_producto_pkey" PRIMARY KEY ("id_linea_producto")
);

-- CreateTable
CREATE TABLE "costeo"."impresora" (
    "id_impresora" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "descripcion" VARCHAR(120),
    "marca_modelo" VARCHAR(60),
    "ancho_pulgadas" DECIMAL(6,2),
    "id_tipo_papel_default" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "impresora_pkey" PRIMARY KEY ("id_impresora")
);

-- CreateTable
CREATE TABLE "costeo"."calandra" (
    "id_calandra" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "calandra_pkey" PRIMARY KEY ("id_calandra")
);

-- CreateTable
CREATE TABLE "costeo"."tipo_papel" (
    "id_tipo_papel" SERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "gramaje" DECIMAL(6,2),
    "ancho_pulgadas" DECIMAL(6,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_papel_pkey" PRIMARY KEY ("id_tipo_papel")
);

-- CreateTable
CREATE TABLE "costeo"."departamento" (
    "id_departamento" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "departamento_pkey" PRIMARY KEY ("id_departamento")
);

-- CreateTable
CREATE TABLE "costeo"."defecto" (
    "id_defecto" SERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "categoria" VARCHAR(20),
    "imputable_a" VARCHAR(20),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "defecto_pkey" PRIMARY KEY ("id_defecto")
);

-- CreateTable
CREATE TABLE "costeo"."empleado" (
    "id_empleado" SERIAL NOT NULL,
    "codigo" VARCHAR(20),
    "nombres" VARCHAR(150) NOT NULL,
    "puesto" VARCHAR(80),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "empleado_pkey" PRIMARY KEY ("id_empleado")
);

-- CreateTable
CREATE TABLE "costeo"."consumo_estandar" (
    "id_consumo_estandar" SERIAL NOT NULL,
    "id_producto" INTEGER NOT NULL,
    "id_talla" INTEGER NOT NULL,
    "pulgadas_papel" DECIMAL(10,4) NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "vigente_hasta" DATE,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" INTEGER NOT NULL,

    CONSTRAINT "consumo_estandar_pkey" PRIMARY KEY ("id_consumo_estandar")
);

-- CreateTable
CREATE TABLE "costeo"."orden_produccion" (
    "id_orden_produccion" SERIAL NOT NULL,
    "anio" SMALLINT NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "id_cliente" INTEGER,
    "id_linea_producto" INTEGER,
    "orden_compra" VARCHAR(40),
    "desarrollo" VARCHAR(40),
    "fecha_recibido" DATE,
    "fecha_compromiso" DATE,
    "estatus" VARCHAR(20) NOT NULL DEFAULT 'ABIERTO',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" INTEGER NOT NULL,

    CONSTRAINT "orden_produccion_pkey" PRIMARY KEY ("id_orden_produccion")
);

-- CreateTable
CREATE TABLE "costeo"."tipo_servicio" (
    "id_tipo_servicio" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,

    CONSTRAINT "tipo_servicio_pkey" PRIMARY KEY ("id_tipo_servicio")
);

-- CreateTable
CREATE TABLE "costeo"."orden_facturacion" (
    "id_orden_facturacion" SERIAL NOT NULL,
    "anio" SMALLINT NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "numero_factura" VARCHAR(30),
    "id_cliente" INTEGER NOT NULL,
    "id_tipo_servicio" INTEGER NOT NULL,
    "cantidad_facturada" INTEGER,
    "venta_total" DECIMAL(14,4),
    "mod_valor" DECIMAL(14,4),
    "gf_valor" DECIMAL(14,4),
    "fijos_valor" DECIMAL(14,4),
    "cerrada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" INTEGER NOT NULL,

    CONSTRAINT "orden_facturacion_pkey" PRIMARY KEY ("id_orden_facturacion")
);

-- CreateTable
CREATE TABLE "costeo"."of_op" (
    "id_orden_facturacion" INTEGER NOT NULL,
    "id_orden_produccion" INTEGER NOT NULL,

    CONSTRAINT "of_op_pkey" PRIMARY KEY ("id_orden_facturacion","id_orden_produccion")
);

-- CreateTable
CREATE TABLE "costeo"."factura_papel" (
    "id_factura_papel" SERIAL NOT NULL,
    "numero_factura" VARCHAR(30) NOT NULL,
    "fecha" DATE NOT NULL,
    "total_rollos" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" INTEGER NOT NULL,

    CONSTRAINT "factura_papel_pkey" PRIMARY KEY ("id_factura_papel")
);

-- CreateTable
CREATE TABLE "costeo"."rollo_papel" (
    "id_rollo_papel" SERIAL NOT NULL,
    "id_factura_papel" INTEGER NOT NULL,
    "secuencia" INTEGER NOT NULL,
    "id_tipo_papel" INTEGER NOT NULL,
    "yardas_iniciales" DECIMAL(12,4),
    "costo_unitario" DECIMAL(12,6),
    "estado" VARCHAR(20) NOT NULL DEFAULT 'EN_BODEGA',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rollo_papel_pkey" PRIMARY KEY ("id_rollo_papel")
);

-- CreateTable
CREATE TABLE "costeo"."montaje_rollo" (
    "id_montaje_rollo" SERIAL NOT NULL,
    "id_rollo_papel" INTEGER NOT NULL,
    "id_impresora" INTEGER NOT NULL,
    "montado_en" TIMESTAMPTZ(3) NOT NULL,
    "desmontado_en" TIMESTAMPTZ(3),
    "yardas_finales" DECIMAL(12,4),
    "creado_por" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "montaje_rollo_pkey" PRIMARY KEY ("id_montaje_rollo")
);

-- CreateTable
CREATE TABLE "costeo"."linea_produccion" (
    "id_linea_produccion" SERIAL NOT NULL,
    "codigo_line" VARCHAR(40) NOT NULL,
    "id_orden_produccion" INTEGER NOT NULL,
    "id_producto" INTEGER NOT NULL,
    "id_impresora" INTEGER,
    "id_tipo_papel" INTEGER,
    "enguiamiento_yd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "consumo_en_blanco" BOOLEAN NOT NULL DEFAULT false,
    "factor_en_blanco" DECIMAL(6,4) NOT NULL DEFAULT 0.6,
    "fecha_data" DATE,
    "fecha_recibido" DATE,
    "fecha_cliente" DATE,
    "fecha_entregar" DATE,
    "estatus" VARCHAR(20) NOT NULL DEFAULT 'ABIERTO',
    "procesada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" INTEGER NOT NULL,

    CONSTRAINT "linea_produccion_pkey" PRIMARY KEY ("id_linea_produccion")
);

-- CreateTable
CREATE TABLE "costeo"."linea_produccion_talla" (
    "id_linea_produccion_talla" SERIAL NOT NULL,
    "id_linea_produccion" INTEGER NOT NULL,
    "id_talla" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "linea_produccion_talla_pkey" PRIMARY KEY ("id_linea_produccion_talla")
);

-- CreateTable
CREATE TABLE "costeo"."consumo_papel" (
    "id_consumo_papel" SERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "id_orden_produccion" INTEGER NOT NULL,
    "id_linea_produccion" INTEGER,
    "id_reposicion" INTEGER,
    "id_producto" INTEGER,
    "id_talla" INTEGER,
    "id_impresora" INTEGER NOT NULL,
    "id_montaje_rollo" INTEGER,
    "id_tipo_papel" INTEGER NOT NULL,
    "cantidad" INTEGER,
    "id_consumo_estandar" INTEGER,
    "enguiamiento_yd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "en_blanco_yd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "consumo_yd" DECIMAL(12,4) NOT NULL,
    "observacion" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" INTEGER NOT NULL,
    "anulado_en" TIMESTAMPTZ(3),
    "anulado_por" INTEGER,
    "motivo_anulacion" TEXT,

    CONSTRAINT "consumo_papel_pkey" PRIMARY KEY ("id_consumo_papel")
);

-- CreateTable
CREATE TABLE "costeo"."reposicion" (
    "id_reposicion" SERIAL NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL,
    "id_orden_produccion" INTEGER NOT NULL,
    "numero_repo" SMALLINT NOT NULL,
    "id_departamento" INTEGER NOT NULL,
    "id_empleado" INTEGER,
    "id_defecto" INTEGER NOT NULL,
    "bodega_sac" VARCHAR(20),
    "id_impresora" INTEGER,
    "id_calandra" INTEGER,
    "id_montaje_rollo" INTEGER,
    "id_tipo_papel" INTEGER,
    "yardas_papel" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "id_insumo_tela" INTEGER,
    "yardas_tela" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" INTEGER NOT NULL,
    "anulado_en" TIMESTAMPTZ(3),
    "anulado_por" INTEGER,
    "motivo_anulacion" TEXT,

    CONSTRAINT "reposicion_pkey" PRIMARY KEY ("id_reposicion")
);

-- CreateTable
CREATE TABLE "costeo"."insumo_costo" (
    "id_insumo_costo" SERIAL NOT NULL,
    "id_insumo" INTEGER NOT NULL,
    "costo_unitario" DECIMAL(14,6) NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "vigente_hasta" DATE,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" INTEGER NOT NULL,

    CONSTRAINT "insumo_costo_pkey" PRIMARY KEY ("id_insumo_costo")
);

-- CreateTable
CREATE TABLE "costeo"."of_insumo" (
    "id_of_insumo" SERIAL NOT NULL,
    "id_orden_facturacion" INTEGER NOT NULL,
    "id_insumo" INTEGER NOT NULL,
    "cantidad" DECIMAL(14,4) NOT NULL,
    "id_insumo_costo" INTEGER NOT NULL,
    "costo_unitario" DECIMAL(14,6) NOT NULL,
    "nota" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" INTEGER NOT NULL,

    CONSTRAINT "of_insumo_pkey" PRIMARY KEY ("id_of_insumo")
);

-- CreateTable
CREATE TABLE "costeo"."plantilla_insumo" (
    "id_plantilla_insumo" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "id_tipo_servicio" INTEGER,
    "id_linea_producto" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plantilla_insumo_pkey" PRIMARY KEY ("id_plantilla_insumo")
);

-- CreateTable
CREATE TABLE "costeo"."plantilla_insumo_detalle" (
    "id_plantilla_insumo" INTEGER NOT NULL,
    "id_insumo" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plantilla_insumo_detalle_pkey" PRIMARY KEY ("id_plantilla_insumo","id_insumo")
);

-- CreateTable
CREATE TABLE "costeo"."sync_outbox" (
    "id_sync_outbox" SERIAL NOT NULL,
    "destino" VARCHAR(40) NOT NULL,
    "entidad" VARCHAR(40) NOT NULL,
    "entidad_id" BIGINT NOT NULL,
    "operacion" VARCHAR(10) NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE',
    "intentos" SMALLINT NOT NULL DEFAULT 0,
    "ultimo_error" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesado_en" TIMESTAMPTZ(3),

    CONSTRAINT "sync_outbox_pkey" PRIMARY KEY ("id_sync_outbox")
);

-- CreateIndex
CREATE UNIQUE INDEX "linea_producto_id_cliente_nombre_key" ON "costeo"."linea_producto"("id_cliente", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "impresora_codigo_key" ON "costeo"."impresora"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "calandra_codigo_key" ON "costeo"."calandra"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_papel_codigo_key" ON "costeo"."tipo_papel"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "departamento_codigo_key" ON "costeo"."departamento"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "defecto_codigo_key" ON "costeo"."defecto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "empleado_codigo_key" ON "costeo"."empleado"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "orden_produccion_anio_correlativo_key" ON "costeo"."orden_produccion"("anio", "correlativo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_servicio_codigo_key" ON "costeo"."tipo_servicio"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "orden_facturacion_anio_correlativo_key" ON "costeo"."orden_facturacion"("anio", "correlativo");

-- CreateIndex
CREATE UNIQUE INDEX "factura_papel_numero_factura_key" ON "costeo"."factura_papel"("numero_factura");

-- CreateIndex
CREATE UNIQUE INDEX "rollo_papel_id_factura_papel_secuencia_key" ON "costeo"."rollo_papel"("id_factura_papel", "secuencia");

-- CreateIndex
CREATE UNIQUE INDEX "linea_produccion_codigo_line_key" ON "costeo"."linea_produccion"("codigo_line");

-- CreateIndex
CREATE UNIQUE INDEX "linea_produccion_talla_id_linea_produccion_id_talla_key" ON "costeo"."linea_produccion_talla"("id_linea_produccion", "id_talla");

-- CreateIndex
CREATE INDEX "consumo_papel_id_orden_produccion_idx" ON "costeo"."consumo_papel"("id_orden_produccion");

-- CreateIndex
CREATE INDEX "consumo_papel_fecha_idx" ON "costeo"."consumo_papel"("fecha" DESC);

-- CreateIndex
CREATE INDEX "consumo_papel_id_montaje_rollo_idx" ON "costeo"."consumo_papel"("id_montaje_rollo");

-- CreateIndex
CREATE INDEX "reposicion_id_orden_produccion_idx" ON "costeo"."reposicion"("id_orden_produccion");

-- CreateIndex
CREATE INDEX "reposicion_fecha_idx" ON "costeo"."reposicion"("fecha" DESC);

-- CreateIndex
CREATE INDEX "reposicion_id_defecto_idx" ON "costeo"."reposicion"("id_defecto");

-- CreateIndex
CREATE UNIQUE INDEX "of_insumo_id_orden_facturacion_id_insumo_key" ON "costeo"."of_insumo"("id_orden_facturacion", "id_insumo");

-- AddForeignKey
ALTER TABLE "costeo"."linea_producto" ADD CONSTRAINT "linea_producto_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "recetas"."clientes"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."impresora" ADD CONSTRAINT "impresora_id_tipo_papel_default_fkey" FOREIGN KEY ("id_tipo_papel_default") REFERENCES "costeo"."tipo_papel"("id_tipo_papel") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_estandar" ADD CONSTRAINT "consumo_estandar_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "recetas"."productos"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_estandar" ADD CONSTRAINT "consumo_estandar_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "recetas"."tallas"("id_talla") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."orden_produccion" ADD CONSTRAINT "orden_produccion_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "recetas"."clientes"("id_cliente") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."orden_produccion" ADD CONSTRAINT "orden_produccion_id_linea_producto_fkey" FOREIGN KEY ("id_linea_producto") REFERENCES "costeo"."linea_producto"("id_linea_producto") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."orden_facturacion" ADD CONSTRAINT "orden_facturacion_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "recetas"."clientes"("id_cliente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."orden_facturacion" ADD CONSTRAINT "orden_facturacion_id_tipo_servicio_fkey" FOREIGN KEY ("id_tipo_servicio") REFERENCES "costeo"."tipo_servicio"("id_tipo_servicio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."of_op" ADD CONSTRAINT "of_op_id_orden_facturacion_fkey" FOREIGN KEY ("id_orden_facturacion") REFERENCES "costeo"."orden_facturacion"("id_orden_facturacion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."of_op" ADD CONSTRAINT "of_op_id_orden_produccion_fkey" FOREIGN KEY ("id_orden_produccion") REFERENCES "costeo"."orden_produccion"("id_orden_produccion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."rollo_papel" ADD CONSTRAINT "rollo_papel_id_factura_papel_fkey" FOREIGN KEY ("id_factura_papel") REFERENCES "costeo"."factura_papel"("id_factura_papel") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."rollo_papel" ADD CONSTRAINT "rollo_papel_id_tipo_papel_fkey" FOREIGN KEY ("id_tipo_papel") REFERENCES "costeo"."tipo_papel"("id_tipo_papel") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."montaje_rollo" ADD CONSTRAINT "montaje_rollo_id_rollo_papel_fkey" FOREIGN KEY ("id_rollo_papel") REFERENCES "costeo"."rollo_papel"("id_rollo_papel") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."montaje_rollo" ADD CONSTRAINT "montaje_rollo_id_impresora_fkey" FOREIGN KEY ("id_impresora") REFERENCES "costeo"."impresora"("id_impresora") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."linea_produccion" ADD CONSTRAINT "linea_produccion_id_orden_produccion_fkey" FOREIGN KEY ("id_orden_produccion") REFERENCES "costeo"."orden_produccion"("id_orden_produccion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."linea_produccion" ADD CONSTRAINT "linea_produccion_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "recetas"."productos"("id_producto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."linea_produccion" ADD CONSTRAINT "linea_produccion_id_impresora_fkey" FOREIGN KEY ("id_impresora") REFERENCES "costeo"."impresora"("id_impresora") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."linea_produccion" ADD CONSTRAINT "linea_produccion_id_tipo_papel_fkey" FOREIGN KEY ("id_tipo_papel") REFERENCES "costeo"."tipo_papel"("id_tipo_papel") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."linea_produccion_talla" ADD CONSTRAINT "linea_produccion_talla_id_linea_produccion_fkey" FOREIGN KEY ("id_linea_produccion") REFERENCES "costeo"."linea_produccion"("id_linea_produccion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."linea_produccion_talla" ADD CONSTRAINT "linea_produccion_talla_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "recetas"."tallas"("id_talla") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_id_orden_produccion_fkey" FOREIGN KEY ("id_orden_produccion") REFERENCES "costeo"."orden_produccion"("id_orden_produccion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_id_linea_produccion_fkey" FOREIGN KEY ("id_linea_produccion") REFERENCES "costeo"."linea_produccion"("id_linea_produccion") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_id_reposicion_fkey" FOREIGN KEY ("id_reposicion") REFERENCES "costeo"."reposicion"("id_reposicion") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_id_producto_fkey" FOREIGN KEY ("id_producto") REFERENCES "recetas"."productos"("id_producto") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_id_talla_fkey" FOREIGN KEY ("id_talla") REFERENCES "recetas"."tallas"("id_talla") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_id_impresora_fkey" FOREIGN KEY ("id_impresora") REFERENCES "costeo"."impresora"("id_impresora") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_id_montaje_rollo_fkey" FOREIGN KEY ("id_montaje_rollo") REFERENCES "costeo"."montaje_rollo"("id_montaje_rollo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_id_tipo_papel_fkey" FOREIGN KEY ("id_tipo_papel") REFERENCES "costeo"."tipo_papel"("id_tipo_papel") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_id_consumo_estandar_fkey" FOREIGN KEY ("id_consumo_estandar") REFERENCES "costeo"."consumo_estandar"("id_consumo_estandar") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_id_orden_produccion_fkey" FOREIGN KEY ("id_orden_produccion") REFERENCES "costeo"."orden_produccion"("id_orden_produccion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_id_departamento_fkey" FOREIGN KEY ("id_departamento") REFERENCES "costeo"."departamento"("id_departamento") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_id_empleado_fkey" FOREIGN KEY ("id_empleado") REFERENCES "costeo"."empleado"("id_empleado") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_id_defecto_fkey" FOREIGN KEY ("id_defecto") REFERENCES "costeo"."defecto"("id_defecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_id_impresora_fkey" FOREIGN KEY ("id_impresora") REFERENCES "costeo"."impresora"("id_impresora") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_id_calandra_fkey" FOREIGN KEY ("id_calandra") REFERENCES "costeo"."calandra"("id_calandra") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_id_tipo_papel_fkey" FOREIGN KEY ("id_tipo_papel") REFERENCES "costeo"."tipo_papel"("id_tipo_papel") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_id_insumo_tela_fkey" FOREIGN KEY ("id_insumo_tela") REFERENCES "recetas"."insumos"("id_insumo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."insumo_costo" ADD CONSTRAINT "insumo_costo_id_insumo_fkey" FOREIGN KEY ("id_insumo") REFERENCES "recetas"."insumos"("id_insumo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."of_insumo" ADD CONSTRAINT "of_insumo_id_orden_facturacion_fkey" FOREIGN KEY ("id_orden_facturacion") REFERENCES "costeo"."orden_facturacion"("id_orden_facturacion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."of_insumo" ADD CONSTRAINT "of_insumo_id_insumo_fkey" FOREIGN KEY ("id_insumo") REFERENCES "recetas"."insumos"("id_insumo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."of_insumo" ADD CONSTRAINT "of_insumo_id_insumo_costo_fkey" FOREIGN KEY ("id_insumo_costo") REFERENCES "costeo"."insumo_costo"("id_insumo_costo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."plantilla_insumo" ADD CONSTRAINT "plantilla_insumo_id_tipo_servicio_fkey" FOREIGN KEY ("id_tipo_servicio") REFERENCES "costeo"."tipo_servicio"("id_tipo_servicio") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."plantilla_insumo" ADD CONSTRAINT "plantilla_insumo_id_linea_producto_fkey" FOREIGN KEY ("id_linea_producto") REFERENCES "costeo"."linea_producto"("id_linea_producto") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."plantilla_insumo_detalle" ADD CONSTRAINT "plantilla_insumo_detalle_id_plantilla_insumo_fkey" FOREIGN KEY ("id_plantilla_insumo") REFERENCES "costeo"."plantilla_insumo"("id_plantilla_insumo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costeo"."plantilla_insumo_detalle" ADD CONSTRAINT "plantilla_insumo_detalle_id_insumo_fkey" FOREIGN KEY ("id_insumo") REFERENCES "recetas"."insumos"("id_insumo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- A PARTIR DE AQUÍ: adiciones manuales, no generadas por `prisma migrate diff`.
-- Todo lo de arriba es exactamente lo que Prisma generó a partir de costeo.prisma
-- (schema, tablas, índices, FKs) — no se modificó nada de eso.
-- Lo de abajo cubre features de Postgres que Prisma 7 no puede expresar en su
-- DSL: columnas GENERATED ALWAYS AS ... STORED, tipos range + EXCLUDE USING
-- gist (versionado SCD2 a prueba de solapes a nivel de motor), CHECK
-- constraints de enums en VARCHAR, un índice único parcial (idempotencia), una
-- función SQL y una vista. Ver costeo.prisma (comentarios "// + SQL:") y
-- docs/02-MODELO-ER-PROPUESTO.md para el porqué de cada omisión en el DSL.
-- ============================================================================

-- ── FKs de auditoría hacia core.usuarios ────────────────────────────────
-- Prisma no las genera porque estas columnas se modelaron como Int planos
-- (sin `@relation`) para no ensuciar core.Usuario con ~12 arrays de relación
-- inversa. Los constraints reales sí se agregan aquí a mano.
ALTER TABLE "costeo"."consumo_estandar" ADD CONSTRAINT "consumo_estandar_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."orden_produccion" ADD CONSTRAINT "orden_produccion_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."orden_facturacion" ADD CONSTRAINT "orden_facturacion_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."factura_papel" ADD CONSTRAINT "factura_papel_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."montaje_rollo" ADD CONSTRAINT "montaje_rollo_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."linea_produccion" ADD CONSTRAINT "linea_produccion_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "consumo_papel_anulado_por_fkey" FOREIGN KEY ("anulado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "reposicion_anulado_por_fkey" FOREIGN KEY ("anulado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."insumo_costo" ADD CONSTRAINT "insumo_costo_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "costeo"."of_insumo" ADD CONSTRAINT "of_insumo_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "core"."usuarios"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Columnas GENERATED ALWAYS AS ... STORED ─────────────────────────────
-- orden_produccion.codigo: "26OP000123" (año 2 dígitos + OP + correlativo 6 dígitos)
ALTER TABLE "costeo"."orden_produccion" ADD COLUMN "codigo" TEXT GENERATED ALWAYS AS (lpad("anio"::text, 2, '0') || 'OP' || lpad("correlativo"::text, 6, '0')) STORED;
CREATE INDEX "idx_op_codigo" ON "costeo"."orden_produccion"("codigo");
CREATE INDEX "idx_op_orden_compra" ON "costeo"."orden_produccion"("orden_compra");

-- orden_facturacion.codigo: "26OF000045"
ALTER TABLE "costeo"."orden_facturacion" ADD COLUMN "codigo" TEXT GENERATED ALWAYS AS (lpad("anio"::text, 2, '0') || 'OF' || lpad("correlativo"::text, 6, '0')) STORED;
CREATE INDEX "idx_of_codigo" ON "costeo"."orden_facturacion"("codigo");

-- reposicion.codigo_repo: "R01".."R99" (numero_repo ya validado 1-99 más abajo)
ALTER TABLE "costeo"."reposicion" ADD COLUMN "codigo_repo" TEXT GENERATED ALWAYS AS ('R' || lpad("numero_repo"::text, 2, '0')) STORED;

-- consumo_estandar.yardas: pulgadas_papel / 36 (regla heredada de ANEXO_A, 36in=1yd)
ALTER TABLE "costeo"."consumo_estandar" ADD COLUMN "yardas" DECIMAL(10, 4) GENERATED ALWAYS AS ("pulgadas_papel" / 36.0) STORED;

-- of_insumo.costo_total: snapshot congelado (cantidad × costo_unitario ya copiado a la fila, no recalculado contra insumo_costo vigente)
ALTER TABLE "costeo"."of_insumo" ADD COLUMN "costo_total" DECIMAL(16, 4) GENERATED ALWAYS AS ("cantidad" * "costo_unitario") STORED;

-- ── SCD Type 2: rangos generados + EXCLUDE USING gist (anti-solape a nivel de motor) ──
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- consumo_estandar: un producto+talla no puede tener dos vigencias que se solapen
ALTER TABLE "costeo"."consumo_estandar" ADD CONSTRAINT "ck_consumo_estandar_vigencia" CHECK ("vigente_hasta" IS NULL OR "vigente_hasta" > "vigente_desde");
ALTER TABLE "costeo"."consumo_estandar" ADD COLUMN "vigencia" daterange GENERATED ALWAYS AS (daterange("vigente_desde", "vigente_hasta", '[)')) STORED;
ALTER TABLE "costeo"."consumo_estandar" ADD CONSTRAINT "ex_consumo_estandar_solape" EXCLUDE USING gist ("id_producto" WITH =, "id_talla" WITH =, "vigencia" WITH &&);
CREATE INDEX "idx_consumo_estandar_lookup" ON "costeo"."consumo_estandar"("id_producto", "id_talla", "vigente_desde" DESC);

-- insumo_costo: un insumo no puede tener dos costos vigentes al mismo tiempo
ALTER TABLE "costeo"."insumo_costo" ADD CONSTRAINT "ck_insumo_costo_vigencia" CHECK ("vigente_hasta" IS NULL OR "vigente_hasta" > "vigente_desde");
ALTER TABLE "costeo"."insumo_costo" ADD COLUMN "vigencia" daterange GENERATED ALWAYS AS (daterange("vigente_desde", "vigente_hasta", '[)')) STORED;
ALTER TABLE "costeo"."insumo_costo" ADD CONSTRAINT "ex_insumo_costo_solape" EXCLUDE USING gist ("id_insumo" WITH =, "vigencia" WITH &&);
CREATE INDEX "idx_insumo_costo_lookup" ON "costeo"."insumo_costo"("id_insumo", "vigente_desde" DESC);

-- montaje_rollo: una impresora no puede tener dos montajes con ventanas de tiempo solapadas
ALTER TABLE "costeo"."montaje_rollo" ADD CONSTRAINT "ck_montaje_rollo_rango" CHECK ("desmontado_en" IS NULL OR "desmontado_en" > "montado_en");
ALTER TABLE "costeo"."montaje_rollo" ADD COLUMN "vigencia" tstzrange GENERATED ALWAYS AS (tstzrange("montado_en", "desmontado_en", '[)')) STORED;
ALTER TABLE "costeo"."montaje_rollo" ADD CONSTRAINT "ex_montaje_rollo_impresora" EXCLUDE USING gist ("id_impresora" WITH =, "vigencia" WITH &&);
CREATE INDEX "idx_montaje_rollo_vigencia" ON "costeo"."montaje_rollo" USING gist ("id_impresora", "vigencia");

-- ── CHECK constraints: enums sobre VARCHAR y reglas de negocio ─────────
ALTER TABLE "costeo"."defecto" ADD CONSTRAINT "ck_defecto_categoria" CHECK ("categoria" IS NULL OR "categoria" IN ('MATERIAL', 'PROCESO', 'EQUIPO', 'HUMANO', 'EXTERNO'));
ALTER TABLE "costeo"."defecto" ADD CONSTRAINT "ck_defecto_imputable_a" CHECK ("imputable_a" IS NULL OR "imputable_a" IN ('INTERNO', 'CLIENTE', 'PROVEEDOR'));

ALTER TABLE "costeo"."rollo_papel" ADD CONSTRAINT "ck_rollo_papel_estado" CHECK ("estado" IN ('EN_BODEGA', 'MONTADO', 'AGOTADO', 'DESCARTADO'));
ALTER TABLE "costeo"."factura_papel" ADD CONSTRAINT "ck_factura_papel_total_rollos" CHECK ("total_rollos" > 0);
ALTER TABLE "costeo"."rollo_papel" ADD CONSTRAINT "ck_rollo_papel_secuencia" CHECK ("secuencia" > 0);

ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "ck_consumo_papel_origen" CHECK ("origen" IN ('PRODUCCION', 'REPOSICION'));
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "ck_consumo_papel_origen_regla" CHECK (
  ("origen" = 'PRODUCCION' AND "id_linea_produccion" IS NOT NULL AND "id_reposicion" IS NULL)
  OR ("origen" = 'REPOSICION' AND "id_reposicion" IS NOT NULL)
);
ALTER TABLE "costeo"."consumo_papel" ADD CONSTRAINT "ck_consumo_papel_consumo_yd" CHECK ("consumo_yd" >= 0);

ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "ck_reposicion_numero_repo" CHECK ("numero_repo" BETWEEN 1 AND 99);
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "ck_reposicion_yardas_papel" CHECK ("yardas_papel" >= 0);
ALTER TABLE "costeo"."reposicion" ADD CONSTRAINT "ck_reposicion_yardas_tela" CHECK ("yardas_tela" >= 0);

ALTER TABLE "costeo"."orden_produccion" ADD CONSTRAINT "ck_orden_produccion_anio" CHECK ("anio" BETWEEN 0 AND 99);
ALTER TABLE "costeo"."orden_produccion" ADD CONSTRAINT "ck_orden_produccion_correlativo" CHECK ("correlativo" BETWEEN 1 AND 999999);
ALTER TABLE "costeo"."orden_facturacion" ADD CONSTRAINT "ck_orden_facturacion_anio" CHECK ("anio" BETWEEN 0 AND 99);
ALTER TABLE "costeo"."orden_facturacion" ADD CONSTRAINT "ck_orden_facturacion_correlativo" CHECK ("correlativo" BETWEEN 1 AND 999999);

ALTER TABLE "costeo"."consumo_estandar" ADD CONSTRAINT "ck_consumo_estandar_pulgadas" CHECK ("pulgadas_papel" > 0);
ALTER TABLE "costeo"."insumo_costo" ADD CONSTRAINT "ck_insumo_costo_valor" CHECK ("costo_unitario" >= 0);
ALTER TABLE "costeo"."of_insumo" ADD CONSTRAINT "ck_of_insumo_cantidad" CHECK ("cantidad" > 0);

ALTER TABLE "costeo"."sync_outbox" ADD CONSTRAINT "ck_sync_outbox_operacion" CHECK ("operacion" IN ('INSERT', 'UPDATE', 'DELETE'));
ALTER TABLE "costeo"."sync_outbox" ADD CONSTRAINT "ck_sync_outbox_estado" CHECK ("estado" IN ('PENDIENTE', 'PROCESANDO', 'OK', 'ERROR'));
CREATE INDEX "idx_sync_outbox_pendientes" ON "costeo"."sync_outbox"("estado", "creado_en") WHERE "estado" IN ('PENDIENTE', 'ERROR');

-- ── Idempotencia: una sola fila de PRODUCCION viva por línea+talla ──────
-- (permite re-enviar el mismo evento sin duplicar consumo; REPOSICION no
-- lleva esta restricción porque una misma línea+talla puede repetirse en
-- varias reposiciones distintas por diseño)
CREATE UNIQUE INDEX "ux_consumo_papel_produccion_natural" ON "costeo"."consumo_papel"("id_linea_produccion", "id_talla") WHERE "origen" = 'PRODUCCION' AND "anulado_en" IS NULL;

-- ── Función: rollo montado en una impresora en un momento dado ─────────
CREATE OR REPLACE FUNCTION "costeo"."fn_rollo_en"(p_impresora_id integer, p_momento timestamptz)
RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT m."id_rollo_papel"
  FROM "costeo"."montaje_rollo" m
  WHERE m."id_impresora" = p_impresora_id
    AND m."vigencia" @> p_momento
  LIMIT 1;
$$;

-- ── Vista: código legible de rollo ("factura-totalRollos-secuencia") ───
CREATE VIEW "costeo"."v_rollo_codigo" AS
SELECT
  r."id_rollo_papel" AS "id_rollo_papel",
  f."numero_factura" || '-' || f."total_rollos" || '-' || r."secuencia" AS "codigo",
  f."numero_factura",
  f."total_rollos",
  r."secuencia",
  r."id_tipo_papel",
  r."estado"
FROM "costeo"."rollo_papel" r
JOIN "costeo"."factura_papel" f ON f."id_factura_papel" = r."id_factura_papel";

