import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  CosteoOrdenesService,
  type EstadoListadoOrdenes,
} from './costeo-ordenes.service';
import type { FilaPreviewLinea } from './costeo-ordenes.types';
import { CrearLineaProductoDto } from './dto/crear-linea-producto.dto';

@Controller('costeo/ordenes')
export class CosteoOrdenesController {
  constructor(private readonly service: CosteoOrdenesService) {}

  @RequirePermissions('costeo.orden.ver')
  @Get('plantilla-importar')
  async plantilla(@Res() res: Response) {
    const buffer = await this.service.plantillaImportarLineas();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_ordenes_items.xlsx"',
    );
    res.send(buffer);
  }

  @RequirePermissions('costeo.orden.importar')
  @Post('importar/preview')
  previewImportar(@Req() req: Request, @EmpresaActual() idEmpresa: number) {
    return this.service.previewImportarLineas(req.body as Buffer, idEmpresa);
  }

  @RequirePermissions('costeo.orden.importar')
  @Post('importar/aplicar')
  aplicarImportar(
    @Body('filas') filas: FilaPreviewLinea[],
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.aplicarImportarLineas(filas, usuario.sub, idEmpresa);
  }

  // Va ANTES de @Get(':codigo') o 'listado' se leería como un código de OP.
  @RequirePermissions('costeo.orden.ver')
  @Get('listado')
  listarOrdenes(
    @EmpresaActual() idEmpresa: number,
    @Query('estado') estado?: string,
  ) {
    // Cualquier valor raro cae en 'pendientes', que es el modo por defecto de
    // la pantalla: no tiene sentido rechazar la carga por un query param mal
    // escrito cuando hay un default obvio y seguro.
    const modo: EstadoListadoOrdenes =
      estado === 'impresas' || estado === 'todas' ? estado : 'pendientes';
    return this.service.listarOrdenes(idEmpresa, modo);
  }

  @RequirePermissions('costeo.orden.importar')
  @Get('clientes')
  listarClientes() {
    return this.service.listarClientes();
  }

  @RequirePermissions('costeo.orden.importar')
  @Get('lineas-producto')
  listarLineasProducto() {
    return this.service.listarLineasProducto();
  }

  @RequirePermissions('costeo.orden.importar')
  @Post('lineas-producto')
  crearLineaProducto(
    @Body() dto: CrearLineaProductoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.crearLineaProducto(dto, usuario.sub);
  }

  @RequirePermissions('costeo.orden.ver')
  @Get(':codigo')
  buscarPorCodigo(
    @Param('codigo') codigo: string,
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.buscarPorCodigo(codigo, idEmpresa, usuario.sub);
  }
}
