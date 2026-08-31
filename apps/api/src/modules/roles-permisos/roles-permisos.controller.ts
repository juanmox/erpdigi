import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { RolesPermisosService } from './roles-permisos.service';

@Controller()
export class RolesPermisosController {
  constructor(private readonly rolesPermisosService: RolesPermisosService) {}

  // Antes sin gate: cualquier autenticado (un operario de planta, por
  // ejemplo) podía leer el catálogo completo de roles y permisos — el
  // plano del modelo de seguridad. No entrega credenciales, pero es
  // material de reconocimiento y no le sirve a nadie fuera de /usuarios.
  @RequirePermissions('plataforma.roles.administrar')
  @Get('roles')
  listarRoles() {
    return this.rolesPermisosService.listarRoles();
  }

  @RequirePermissions('plataforma.roles.administrar')
  @Get('permisos')
  listarPermisos() {
    return this.rolesPermisosService.listarPermisos();
  }
}
