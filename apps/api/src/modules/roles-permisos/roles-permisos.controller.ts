import { Controller, Get } from '@nestjs/common';
import { RolesPermisosService } from './roles-permisos.service';

@Controller()
export class RolesPermisosController {
  constructor(private readonly rolesPermisosService: RolesPermisosService) {}

  @Get('roles')
  listarRoles() {
    return this.rolesPermisosService.listarRoles();
  }

  @Get('permisos')
  listarPermisos() {
    return this.rolesPermisosService.listarPermisos();
  }
}
