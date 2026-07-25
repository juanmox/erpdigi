import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { MonedasModule } from './modules/monedas/monedas.module';
import { CotizacionesModule } from './modules/recetas-cotizaciones/cotizaciones.module';
import { InsumosModule } from './modules/recetas-insumos/insumos.module';
import { ProductosModule } from './modules/recetas-productos/productos.module';
import { ReferenciasModule } from './modules/recetas-referencias/referencias.module';
import { TipoCambioModule } from './modules/recetas-tipo-cambio/tipo-cambio.module';
import { RolesPermisosModule } from './modules/roles-permisos/roles-permisos.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    AuditoriaModule,
    EmpresasModule,
    UsuariosModule,
    RolesPermisosModule,
    MonedasModule,
    TipoCambioModule,
    ReferenciasModule,
    InsumosModule,
    ProductosModule,
    CotizacionesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
