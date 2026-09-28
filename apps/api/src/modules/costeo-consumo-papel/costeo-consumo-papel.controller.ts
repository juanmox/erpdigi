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
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
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
  pendientes(
    @EmpresaActual() idEmpresa: number,
    @Query('idImpresora') idImpresora?: string,
  ) {
    const id = idImpresora ? Number(idImpresora) : undefined;
    return this.service.pendientes(
      idEmpresa,
      Number.isFinite(id) && id! > 0 ? id : undefined,
    );
  }

  @RequirePermissions('costeo.consumo.ver')
  @Get('orden/:codigo')
  obtenerOrden(
    @Param('codigo') codigo: string,
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.obtenerOrden(codigo, idEmpresa, usuario.sub);
  }

  @RequirePermissions('costeo.consumo.capturar')
  @Post()
  capturar(
    @Body() dto: CapturarConsumoDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    // Permiso OPCIONAL, así que no puede ir en @RequirePermissions (que exige
    // TODOS los que lista). Se resuelve acá y el servicio decide con él.
    return this.service.capturarLote(
      dto,
      usuario.sub,
      idEmpresa,
      usuario.permisos.includes('costeo.consumo.fecha_manual'),
    );
  }

  @RequirePermissions('costeo.consumo.anular')
  @Patch(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularConsumoDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.anular(id, dto.motivo, usuario.sub, idEmpresa);
  }
}
