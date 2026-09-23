import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CosteoRollosService } from './costeo-rollos.service';
import { AplicarImportarIngresosDto } from './dto/aplicar-importar-ingresos.dto';
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

  // Las 3 rutas del import van ANTES de @Get(':id') y @Post(':id/montar):
  // Nest resuelve por orden de declaración, así que declaradas después,
  // 'plantilla-importar' entraría por el parámetro :id.
  @RequirePermissions('costeo.rollo.ingresar')
  @Get('plantilla-importar')
  async plantillaImportar(@Res() res: Response) {
    const buffer = await this.service.plantillaImportarIngresos();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_ingreso_rollos.xlsx"',
    );
    res.send(buffer);
  }

  @RequirePermissions('costeo.rollo.ingresar')
  @Post('importar/preview')
  previewImportar(@Req() req: Request) {
    return this.service.previewImportarIngresos(req.body as Buffer);
  }

  @RequirePermissions('costeo.rollo.ingresar')
  @Post('importar/aplicar')
  // El cuerpo se tipa con una CLASE, no con la interfaz del preview: las
  // interfaces se borran al compilar y el ValidationPipe global no validaría
  // nada de lo que llega acá.
  aplicarImportar(
    @Body() dto: AplicarImportarIngresosDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.aplicarImportarIngresos(dto.filas, usuario.sub);
  }

  // Antes de @Get(':id'), como el resto: si no, 'montajes' entraría por el
  // parámetro.
  @RequirePermissions('costeo.rollo.ver')
  @Get('montajes')
  historialMontajes(
    @Query('idImpresora') idImpresora?: string,
    @Query('soloAbiertos') soloAbiertos?: string,
    @Query('limite') limite?: string,
  ) {
    return this.service.historialMontajes({
      idImpresora: idImpresora ? Number(idImpresora) : undefined,
      soloAbiertos: soloAbiertos === 'true',
      limite: limite ? Number(limite) : undefined,
    });
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
