import { Module } from '@nestjs/common';
import { RolesPermisosController } from './roles-permisos.controller';
import { RolesPermisosService } from './roles-permisos.service';

@Module({
  controllers: [RolesPermisosController],
  providers: [RolesPermisosService],
  exports: [RolesPermisosService],
})
export class RolesPermisosModule {}
