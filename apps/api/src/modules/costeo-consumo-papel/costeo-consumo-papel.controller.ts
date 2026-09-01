import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CosteoConsumoPapelService } from './costeo-consumo-papel.service';
import {
  AnularConsumoDto,
  CapturarConsumoDto,
} from './dto/capturar-consumo.dto';

@Controller('costeo/consumo-papel')
export class CosteoConsumoPapelController {
  constructor(private readonly service: CosteoConsumoPapelService) {}

  // Antes que @Get('orden/:codigo') no hace falta (rutas distintas), pero se
  // deja arriba porque es la entrada natural de la pantalla.
  @RequirePermissions('costeo.consumo.ver')
  @Get('pendientes')
  pendientes(@Query('idImpresora') idImpresora?: string) {
    const id = idImpresora ? Number(idImpresora) : undefined;
    return this.service.pendientes(
      Number.isFinite(id) && id! > 0 ? id : undefined,
    );
  }

  @RequirePermissions('costeo.consumo.ver')
  @Get('orden/:codigo')
  obtenerOrden(@Param('codigo') codigo: string) {
    return this.service.obtenerOrden(codigo);
  }

  @RequirePermissions('costeo.consumo.capturar')
  @Post()
  capturar(
    @Body() dto: CapturarConsumoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.capturar(dto, usuario.sub);
  }

  @RequirePermissions('costeo.consumo.anular')
  @Patch(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularConsumoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.anular(id, dto.motivo, usuario.sub);
  }
}
