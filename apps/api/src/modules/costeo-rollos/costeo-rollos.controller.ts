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
import { CosteoRollosService } from './costeo-rollos.service';
import { DesmontarMontajeDto } from './dto/desmontar-montaje.dto';
import { EditarIngresoDto } from './dto/editar-ingreso.dto';
import { IngresoFacturaPapelDto } from './dto/ingreso-factura-papel.dto';
import { ListarRollosDto } from './dto/listar-rollos.dto';
import { MontarRolloDto } from './dto/montar-rollo.dto';

@Controller('costeo/rollos')
export class CosteoRollosController {
  constructor(private readonly service: CosteoRollosService) {}

  @RequirePermissions('costeo.rollo.ver')
  @Get('impresoras')
  listarImpresoras() {
    return this.service.listarImpresoras();
  }

  @RequirePermissions('costeo.rollo.ver')
  @Get('tipos-papel')
  listarTiposPapel() {
    return this.service.listarTiposPapel();
  }

  @RequirePermissions('costeo.rollo.ver')
  @Get('panel')
  panel() {
    return this.service.panel();
  }

  @RequirePermissions('costeo.rollo.ver')
  @Get('disponibles')
  disponibles(@Query('idImpresora') idImpresora?: string) {
    return this.service.listarDisponiblesParaMontar(
      idImpresora ? Number(idImpresora) : undefined,
    );
  }

  @RequirePermissions('costeo.rollo.ver')
  @Get('montajes/:idMontaje')
  detalleMontaje(@Param('idMontaje', ParseIntPipe) idMontaje: number) {
    return this.service.detalleMontaje(idMontaje);
  }

  @RequirePermissions('costeo.rollo.desmontar')
  @Patch('montajes/:idMontaje/desmontar')
  desmontar(
    @Param('idMontaje', ParseIntPipe) idMontaje: number,
    @Body() dto: DesmontarMontajeDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.desmontar(idMontaje, dto, usuario.sub);
  }

  @RequirePermissions('costeo.rollo.ingresar')
  @Post('ingreso')
  ingreso(
    @Body() dto: IngresoFacturaPapelDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.ingreso(dto, usuario.sub);
  }

  @RequirePermissions('costeo.rollo.ver')
  @Get('facturas/:numeroFactura')
  buscarFactura(@Param('numeroFactura') numeroFactura: string) {
    return this.service.buscarFacturaPorNumero(numeroFactura);
  }

  @RequirePermissions('costeo.rollo.ingresar')
  @Patch('facturas/:idFacturaPapel')
  editarIngreso(
    @Param('idFacturaPapel', ParseIntPipe) idFacturaPapel: number,
    @Body() dto: EditarIngresoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.editarIngreso(idFacturaPapel, dto, usuario.sub);
  }

  @RequirePermissions('costeo.rollo.ver')
  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtenerRollo(id);
  }

  @RequirePermissions('costeo.rollo.montar')
  @Post(':id/montar')
  montar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MontarRolloDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.montar(id, dto, usuario.sub);
  }

  @RequirePermissions('costeo.rollo.ver')
  @Get()
  listar(@Query() dto: ListarRollosDto) {
    return this.service.listarRollos(dto);
  }
}
