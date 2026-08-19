import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { CosteoOrdenesService } from './costeo-ordenes.service';
import type { FilaPreviewLinea } from './costeo-ordenes.types';
import { CrearLineaProductoDto } from './dto/crear-linea-producto.dto';
import { EditarLineaProduccionDto } from './dto/editar-linea-produccion.dto';

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
  previewImportar(@Req() req: Request) {
    return this.service.previewImportarLineas(req.body as Buffer);
  }

  @RequirePermissions('costeo.orden.importar')
  @Post('importar/aplicar')
  aplicarImportar(
    @Body('filas') filas: FilaPreviewLinea[],
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.aplicarImportarLineas(filas, usuario.sub);
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

  @RequirePermissions('costeo.orden.importar')
  @Patch('lineas/:id')
  editarLineaProduccion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarLineaProduccionDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.editarLineaProduccion(id, dto, usuario.sub);
  }

  @RequirePermissions('costeo.orden.ver')
  @Get(':codigo')
  buscarPorCodigo(@Param('codigo') codigo: string) {
    return this.service.buscarPorCodigo(codigo);
  }
}
