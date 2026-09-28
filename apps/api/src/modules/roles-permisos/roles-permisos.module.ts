import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { RolesPermisosController } from './roles-permisos.controller';
import { RolesPermisosService } from './roles-permisos.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [RolesPermisosController],
  providers: [RolesPermisosService],
  exports: [RolesPermisosService],
})
export class RolesPermisosModule {}
