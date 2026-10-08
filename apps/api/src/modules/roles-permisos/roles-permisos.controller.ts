import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  ActualizarInactividadRolDto,
  ActualizarPermisosRolDto,
  CrearRolDto,
} from './dto/roles.dto';
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

  @RequirePermissions('plataforma.roles.administrar')
  @Post('roles')
  crearRol(@Body() dto: CrearRolDto, @CurrentUser() usuario: JwtPayload) {
    return this.rolesPermisosService.crearRol(dto, usuario.sub);
  }

  @RequirePermissions('plataforma.roles.administrar')
  @Patch('roles/:id/inactividad')
  actualizarInactividadRol(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarInactividadRolDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.rolesPermisosService.actualizarInactividadRol(
      id,
      dto,
      usuario.sub,
    );
  }

  @RequirePermissions('plataforma.roles.administrar')
  @Patch('roles/:id/permisos')
  actualizarPermisos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarPermisosRolDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    // Los roles del actor van al servicio solo para la guarda anti-bloqueo
    // (que no se quite a sí mismo el acceso a esta pantalla).
    return this.rolesPermisosService.actualizarPermisos(
      id,
      dto,
      usuario.sub,
      usuario.roles,
    );
  }
}
