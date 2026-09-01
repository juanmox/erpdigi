import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard';
import { CosteoConsumoPapelModule } from './modules/costeo-consumo-papel/costeo-consumo-papel.module';
import { CosteoEstandarModule } from './modules/costeo-estandar/costeo-estandar.module';
import { CosteoOrdenesModule } from './modules/costeo-ordenes/costeo-ordenes.module';
import { CosteoReposicionesModule } from './modules/costeo-reposiciones/costeo-reposiciones.module';
import { CosteoRollosModule } from './modules/costeo-rollos/costeo-rollos.module';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { MonedasModule } from './modules/monedas/monedas.module';
import { CotizacionesModule } from './modules/recetas-cotizaciones/cotizaciones.module';
import { DesarrollosModule } from './modules/recetas-desarrollos/desarrollos.module';
import { InsumosModule } from './modules/recetas-insumos/insumos.module';
import { ProductosModule } from './modules/recetas-productos/productos.module';
import { ReferenciasModule } from './modules/recetas-referencias/referencias.module';
import { TipoCambioModule } from './modules/recetas-tipo-cambio/tipo-cambio.module';
import { RolesPermisosModule } from './modules/roles-permisos/roles-permisos.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Necesario para verificarRutasGateadas() en main.ts: recorre los
    // controllers para exigir que cada ruta declare su acceso.
    DiscoveryModule,
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
    DesarrollosModule,
    CotizacionesModule,
    CosteoRollosModule,
    CosteoOrdenesModule,
    CosteoReposicionesModule,
    CosteoConsumoPapelModule,
    CosteoEstandarModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
