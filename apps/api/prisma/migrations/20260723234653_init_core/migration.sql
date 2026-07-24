-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateTable
CREATE TABLE "core"."empresas" (
    "id_empresa" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_comercial" TEXT,
    "nit" TEXT,
    "id_moneda_base" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id_empresa")
);

-- CreateTable
CREATE TABLE "core"."usuarios" (
    "id_usuario" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "mfa_habilitado" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" TEXT,
    "ultimo_login_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "core"."roles" (
    "id_rol" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "es_rol_sistema" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id_rol")
);

-- CreateTable
CREATE TABLE "core"."permisos" (
    "id_permiso" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id_permiso")
);

-- CreateTable
CREATE TABLE "core"."rol_permisos" (
    "id_rol" INTEGER NOT NULL,
    "id_permiso" INTEGER NOT NULL,

    CONSTRAINT "rol_permisos_pkey" PRIMARY KEY ("id_rol","id_permiso")
);

-- CreateTable
CREATE TABLE "core"."usuario_empresa_rol" (
    "id_usuario_empresa_rol" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_empresa" INTEGER NOT NULL,
    "id_rol" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "usuario_empresa_rol_pkey" PRIMARY KEY ("id_usuario_empresa_rol")
);

-- CreateTable
CREATE TABLE "core"."monedas" (
    "id_moneda" SERIAL NOT NULL,
    "codigo_iso" CHAR(3) NOT NULL,
    "nombre" TEXT NOT NULL,
    "simbolo" TEXT NOT NULL,
    "decimales" INTEGER NOT NULL DEFAULT 2,

    CONSTRAINT "monedas_pkey" PRIMARY KEY ("id_moneda")
);

-- CreateTable
CREATE TABLE "core"."tasas_cambio" (
    "id_tasa_cambio" SERIAL NOT NULL,
    "id_moneda_origen" INTEGER NOT NULL,
    "id_moneda_destino" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "tasa" DECIMAL(18,6) NOT NULL,
    "fuente" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasas_cambio_pkey" PRIMARY KEY ("id_tasa_cambio")
);

-- CreateTable
CREATE TABLE "core"."auditoria" (
    "id_auditoria" SERIAL NOT NULL,
    "id_empresa" INTEGER,
    "id_usuario" INTEGER,
    "entidad" TEXT NOT NULL,
    "id_entidad" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "datos_anteriores" JSONB,
    "datos_nuevos" JSONB,
    "ip_origen" TEXT,
    "user_agent" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id_auditoria")
);

-- CreateTable
CREATE TABLE "core"."refresh_tokens" (
    "id_refresh_token" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_origen" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id_refresh_token")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_codigo_key" ON "core"."empresas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "core"."usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "core"."roles"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_codigo_key" ON "core"."permisos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_empresa_rol_id_usuario_id_empresa_id_rol_key" ON "core"."usuario_empresa_rol"("id_usuario", "id_empresa", "id_rol");

-- CreateIndex
CREATE UNIQUE INDEX "monedas_codigo_iso_key" ON "core"."monedas"("codigo_iso");

-- CreateIndex
CREATE UNIQUE INDEX "tasas_cambio_id_moneda_origen_id_moneda_destino_fecha_key" ON "core"."tasas_cambio"("id_moneda_origen", "id_moneda_destino", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "core"."refresh_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "core"."empresas" ADD CONSTRAINT "empresas_id_moneda_base_fkey" FOREIGN KEY ("id_moneda_base") REFERENCES "core"."monedas"("id_moneda") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."rol_permisos" ADD CONSTRAINT "rol_permisos_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "core"."roles"("id_rol") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."rol_permisos" ADD CONSTRAINT "rol_permisos_id_permiso_fkey" FOREIGN KEY ("id_permiso") REFERENCES "core"."permisos"("id_permiso") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."usuario_empresa_rol" ADD CONSTRAINT "usuario_empresa_rol_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "core"."usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."usuario_empresa_rol" ADD CONSTRAINT "usuario_empresa_rol_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "core"."empresas"("id_empresa") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."usuario_empresa_rol" ADD CONSTRAINT "usuario_empresa_rol_id_rol_fkey" FOREIGN KEY ("id_rol") REFERENCES "core"."roles"("id_rol") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."tasas_cambio" ADD CONSTRAINT "tasas_cambio_id_moneda_origen_fkey" FOREIGN KEY ("id_moneda_origen") REFERENCES "core"."monedas"("id_moneda") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."tasas_cambio" ADD CONSTRAINT "tasas_cambio_id_moneda_destino_fkey" FOREIGN KEY ("id_moneda_destino") REFERENCES "core"."monedas"("id_moneda") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."auditoria" ADD CONSTRAINT "auditoria_id_empresa_fkey" FOREIGN KEY ("id_empresa") REFERENCES "core"."empresas"("id_empresa") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."auditoria" ADD CONSTRAINT "auditoria_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "core"."usuarios"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "core"."usuarios"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;
