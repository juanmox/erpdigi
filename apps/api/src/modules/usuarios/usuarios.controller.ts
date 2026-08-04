import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AsignarRolDto } from './dto/asignar-rol.dto';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { EstablecerPasswordDto } from './dto/establecer-password.dto';
import { UsuariosService } from './usuarios.service';

@RequirePermissions('plataforma.usuarios.administrar')
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  listar() {
    return this.usuariosService.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto, @CurrentUser() usuario: JwtPayload) {
    return this.usuariosService.crear(dto, usuario.sub);
  }

  @Post(':id/roles')
  asignarRol(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarRolDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.usuariosService.asignarRol(id, dto, usuario.sub);
  }

  @Delete(':id/roles/:idEmpresa/:idRol')
  quitarRol(
    @Param('id', ParseIntPipe) id: number,
    @Param('idEmpresa', ParseIntPipe) idEmpresa: number,
    @Param('idRol', ParseIntPipe) idRol: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.usuariosService.quitarRol(id, idEmpresa, idRol, usuario.sub);
  }

  @Patch(':id/desactivar')
  desactivar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.usuariosService.desactivar(id, usuario.sub);
  }

  @Patch(':id/activar')
  activar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.usuariosService.activar(id, usuario.sub);
  }

  @Patch(':id/password')
  establecerPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EstablecerPasswordDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.usuariosService.establecerPassword(id, dto, usuario.sub);
  }
}
