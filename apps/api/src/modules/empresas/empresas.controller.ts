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
import { ActualizarEmpresaDto } from './dto/actualizar-empresa.dto';
import { CrearEmpresaDto } from './dto/crear-empresa.dto';
import { EmpresasService } from './empresas.service';

@Controller('empresas')
export class EmpresasController {
  constructor(private readonly empresasService: EmpresasService) {}

  @Get()
  listar() {
    return this.empresasService.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.empresasService.obtener(id);
  }

  @RequirePermissions('plataforma.empresas.administrar')
  @Post()
  crear(@Body() dto: CrearEmpresaDto, @CurrentUser() usuario: JwtPayload) {
    return this.empresasService.crear(dto, usuario.sub);
  }

  @RequirePermissions('plataforma.empresas.administrar')
  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarEmpresaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.empresasService.actualizar(id, dto, usuario.sub);
  }

  @RequirePermissions('plataforma.empresas.administrar')
  @Patch(':id/desactivar')
  desactivar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.empresasService.desactivar(id, usuario.sub);
  }
}
