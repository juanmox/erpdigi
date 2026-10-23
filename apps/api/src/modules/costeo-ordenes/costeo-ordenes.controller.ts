import {
  Body,
  Controller,
  Delete,
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
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  CosteoOrdenesService,
  type EstadoListadoOrdenes,
} from './costeo-ordenes.service';
import type { FilaPreviewLinea } from './costeo-ordenes.types';
import { CrearLineaProductoDto } from './dto/crear-linea-producto.dto';
import { EditarLineaProduccionDto } from './dto/editar-linea-produccion.dto';
import { EditarOrdenProduccionDto } from './dto/editar-orden-produccion.dto';

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

  // ── Edición de órdenes ya cargadas (solo ADMIN/ADMIN_IT_COSTEO, o a quien
  // se le asigne el permiso desde /roles). Los catálogos van antes de
  // ':codigo' por el mismo motivo que 'listado'/'clientes' de arriba.
  @RequirePermissions('costeo.orden.editar')
  @Get('edicion/catalogos')
  catalogosEdicion() {
    return this.service.listarTallasEdicion();
  }

  @RequirePermissions('costeo.orden.editar')
  @Get('edicion/productos')
  buscarProductosEdicion(@Query('q') q?: string) {
    return this.service.buscarProductosEdicion(q);
  }

  @RequirePermissions('costeo.orden.editar')
  @Patch('lineas/:idLinea')
  editarLinea(
    @Param('idLinea', ParseIntPipe) idLinea: number,
    @Body() dto: EditarLineaProduccionDto,
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.editarLinea(idLinea, dto, idEmpresa, usuario.sub);
  }

  @RequirePermissions('costeo.orden.editar')
  @Delete('lineas/:idLinea')
  eliminarLinea(
    @Param('idLinea', ParseIntPipe) idLinea: number,
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.eliminarLinea(idLinea, idEmpresa, usuario.sub);
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

  @RequirePermissions('costeo.orden.editar')
  @Patch(':id')
  editarOrden(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarOrdenProduccionDto,
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.editarOrden(id, dto, idEmpresa, usuario.sub);
  }

  @RequirePermissions('costeo.orden.editar')
  @Delete(':id')
  eliminarOrden(
    @Param('id', ParseIntPipe) id: number,
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.eliminarOrden(id, idEmpresa, usuario.sub);
  }
}
