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
import { CrearPiezaDto, EditarPiezaDto } from './dto/pieza.dto';
import { PiezasService } from './piezas.service';

/**
 * Mantenimiento del catálogo de piezas. Es solo para administradores y los
 * usuarios a quienes se les asigne `costeo.pieza.administrar` desde /roles.
 * El selector del formulario de Reposiciones lee las piezas activas de
 * `GET /costeo/reposiciones/piezas` (con `costeo.reposicion.ver`).
 */
@Controller('costeo/piezas')
export class PiezasController {
  constructor(private readonly service: PiezasService) {}

  /** Todas, incluidas las retiradas y cuántas veces se usó cada una. */
  @RequirePermissions('costeo.pieza.administrar')
  @Get()
  listar() {
    return this.service.listar();
  }

  @RequirePermissions('costeo.pieza.administrar')
  @Post()
  crear(@Body() dto: CrearPiezaDto, @CurrentUser() usuario: JwtPayload) {
    return this.service.crear(dto.nombre, usuario.sub);
  }

  @RequirePermissions('costeo.pieza.administrar')
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarPiezaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.editar(id, dto, usuario.sub);
  }
}
