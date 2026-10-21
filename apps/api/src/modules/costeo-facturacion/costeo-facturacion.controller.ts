import {
  BadRequestException,
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
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  CosteoFacturacionService,
  type FiltrosOrdenesFacturacion,
} from './costeo-facturacion.service';
import { AgregarOpDto } from './dto/agregar-op.dto';
import { AplicarImportarOfDto } from './dto/aplicar-importar.dto';
import { AsignarFacturaDto } from './dto/asignar-factura.dto';
import { EditarOrdenFacturacionDto } from './dto/editar-orden-facturacion.dto';
import { MotivoDto } from './dto/motivo.dto';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function fechaQuery(v: string | undefined, nombre: string): Date | undefined {
  if (!v) return undefined;
  if (!DIA.test(v))
    throw new BadRequestException(`"${nombre}" no tiene el formato yyyy-mm-dd`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime()))
    throw new BadRequestException(`"${nombre}" no existe en el calendario`);
  return d;
}

/**
 * Filtros del listado, resueltos acá y no en el servicio — mismo criterio que
 * `costeo-reportes`: un único punto de interpretación de la query.
 */
function filtros(
  q: Record<string, string | undefined>,
): FiltrosOrdenesFacturacion {
  const estado =
    q.estado === 'sin_factura' ||
    q.estado === 'facturada' ||
    q.estado === 'anulada'
      ? q.estado
      : undefined;
  return {
    idCliente: q.idCliente ? Number(q.idCliente) : undefined,
    codigos: q.codigos
      ? q.codigos
          .split(',')
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
      : undefined,
    codigoDesde: q.codigoDesde?.trim().toUpperCase() || undefined,
    codigoHasta: q.codigoHasta?.trim().toUpperCase() || undefined,
    numeroFactura: q.numeroFactura?.trim() || undefined,
    fechaOfDesde: fechaQuery(q.fechaOfDesde, 'fechaOfDesde'),
    fechaOfHasta: fechaQuery(q.fechaOfHasta, 'fechaOfHasta'),
    fechaFacturaDesde: fechaQuery(q.fechaFacturaDesde, 'fechaFacturaDesde'),
    fechaFacturaHasta: fechaQuery(q.fechaFacturaHasta, 'fechaFacturaHasta'),
    estado,
  };
}

@Controller('costeo/facturacion')
export class CosteoFacturacionController {
  constructor(private readonly service: CosteoFacturacionService) {}

  @RequirePermissions('costeo.of.crear')
  @Get('plantilla')
  async plantilla(@Res() res: Response) {
    const buffer = await this.service.plantillaImportar();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_ordenes_facturacion.xlsx"',
    );
    res.send(buffer);
  }

  @RequirePermissions('costeo.of.crear')
  @Post('importar/preview')
  previewImportar(@Req() req: Request, @EmpresaActual() idEmpresa: number) {
    return this.service.previewImportar(req.body as Buffer, idEmpresa);
  }

  @RequirePermissions('costeo.of.crear')
  @Post('importar/aplicar')
  aplicarImportar(
    @Body() dto: AplicarImportarOfDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.aplicarImportar(dto.filas, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.of.ver')
  @Get()
  listar(
    @EmpresaActual() idEmpresa: number,
    @Query() q: Record<string, string | undefined>,
  ) {
    return this.service.listar(idEmpresa, filtros(q));
  }

  // "ops/:idOfOp/quitar" tiene 3 segmentos de ruta, así que nunca choca con
  // los patrones ":id..." de 1 o 2 segmentos de más abajo — el orden entre
  // ellos no importa, pero va primero por prolijidad.
  @RequirePermissions('costeo.of.editar')
  @Patch('ops/:idOfOp/quitar')
  quitarOp(
    @Param('idOfOp', ParseIntPipe) idOfOp: number,
    @Body() dto: MotivoDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.quitarOp(idOfOp, dto, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.of.ver')
  @Get(':codigo')
  obtener(
    @Param('codigo') codigo: string,
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.service.obtenerPorCodigo(codigo, idEmpresa, usuario.sub);
  }

  @RequirePermissions('costeo.of.editar')
  @Patch(':id/factura')
  asignarFactura(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarFacturaDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.asignarFactura(id, dto, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.of.anular')
  @Patch(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MotivoDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.anularOf(id, dto, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.of.editar')
  @Post(':id/ops')
  agregarOp(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AgregarOpDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.agregarOp(id, dto, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.of.editar')
  @Patch(':id')
  editarFecha(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarOrdenFacturacionDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.editarFecha(id, dto, usuario.sub, idEmpresa);
  }
}
