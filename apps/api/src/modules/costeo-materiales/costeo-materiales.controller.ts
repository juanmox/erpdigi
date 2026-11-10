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
import { CosteoMaterialesReporteService } from './costeo-materiales-reporte.service';
import { CosteoMaterialesService } from './costeo-materiales.service';
import type {
  CampoFecha,
  EstadoMaterial,
  FiltrosHistorial,
  FiltrosMateriales,
  PermisosMateriales,
} from './costeo-materiales.types';
import {
  AnularMaterialesDto,
  EditarMaterialDto,
  EntregaMaterialesDto,
} from './dto/acciones.dto';
import { AplicarImportarMaterialesDto } from './dto/aplicar-importar.dto';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS: EstadoMaterial[] = [
  'todos',
  'pendientes',
  'entregados',
  'anulados',
  'sin_costo',
  'sin_ligar',
  'modificados',
];
const CAMPOS: CampoFecha[] = ['planificador', 'carga', 'entrega'];

function dia(v: string | undefined, nombre: string): string | undefined {
  if (!v) return undefined;
  if (!DIA.test(v))
    throw new BadRequestException(`"${nombre}" no tiene el formato yyyy-mm-dd`);
  return v;
}

/** Un único punto de interpretación de la query, como en el reporte de consumo. */
function filtros(q: Record<string, string | undefined>): FiltrosMateriales {
  const estado = ESTADOS.find((e) => e === q.estado);
  const campoFecha = CAMPOS.find((c) => c === q.campoFecha);
  const desde = dia(q.desde, 'desde');
  const hasta = dia(q.hasta, 'hasta');
  if (desde && hasta && desde > hasta)
    throw new BadRequestException('"desde" no puede ser posterior a "hasta"');
  return {
    ordenPlanificacion: q.ordenPlanificacion,
    op: q.op,
    insumo: q.insumo,
    salida: q.salida,
    estado,
    campoFecha,
    desde,
    hasta,
    soloMios: q.soloMios === 'true',
  };
}

const ACCIONES_HISTORIAL = [
  'EDITAR',
  'ANULAR',
  'ENTREGAR',
  'CORREGIR_FECHA',
  'REVERTIR',
  'COSTO_CONGELADO',
  'LIGAR_OP',
];

function filtrosHistorial(
  q: Record<string, string | undefined>,
): FiltrosHistorial {
  const desde = dia(q.desde, 'desde');
  const hasta = dia(q.hasta, 'hasta');
  if (desde && hasta && desde > hasta)
    throw new BadRequestException('"desde" no puede ser posterior a "hasta"');
  return {
    desde,
    hasta,
    accion: ACCIONES_HISTORIAL.find((a) => a === q.accion),
    usuario: q.usuario,
    op: q.op,
    ordenPlanificacion: q.ordenPlanificacion,
    insumo: q.insumo,
  };
}

/**
 * Los permisos OPCIONALES se resuelven acá y se pasan al servicio como
 * booleanos: `@RequirePermissions` exige TODOS los que lista, así que no sirve
 * para "con este permiso puede además tocar lo ajeno".
 */
function permisosDe(u: JwtPayload): PermisosMateriales {
  const tiene = (p: string) => u.permisos.includes(p);
  return {
    importar: tiene('costeo.material.importar'),
    entregar: tiene('costeo.material.entregar'),
    editarAjenos: tiene('costeo.material.editar_ajenos'),
    valorizar: tiene('costeo.material.valorizar'),
    verDinero: tiene('costeo.dashboard.ver_financiero'),
  };
}

@Controller('costeo/materiales')
export class CosteoMaterialesController {
  constructor(
    private readonly service: CosteoMaterialesService,
    private readonly reporte: CosteoMaterialesReporteService,
  ) {}

  @RequirePermissions('costeo.material.importar')
  @Get('plantilla')
  async plantilla(@Res() res: Response) {
    const buffer = await this.service.plantillaImportar();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_explosion_materiales.xlsx"',
    );
    res.send(buffer);
  }

  @RequirePermissions('costeo.material.importar')
  @Post('importar/preview')
  previewImportar(@Req() req: Request, @EmpresaActual() idEmpresa: number) {
    return this.service.previewImportar(req.body as Buffer, idEmpresa);
  }

  @RequirePermissions('costeo.material.importar')
  @Post('importar/aplicar')
  aplicarImportar(
    @Body() dto: AplicarImportarMaterialesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.aplicarImportar(
      dto.filas,
      dto.nombreArchivo,
      usuario.sub,
      idEmpresa,
    );
  }

  @RequirePermissions('costeo.material.ver')
  @Get()
  listar(
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
    @Query() q: Record<string, string | undefined>,
  ) {
    return this.service.listar(
      idEmpresa,
      filtros(q),
      usuario.sub,
      permisosDe(usuario),
    );
  }

  /** El mismo filtro de la página, como Excel con resúmenes. */
  @RequirePermissions('costeo.material.ver')
  @Get('exportar')
  async exportar(
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
    @Query() q: Record<string, string | undefined>,
    @Res() res: Response,
  ) {
    const { buffer, nombre } = await this.reporte.exportarExcel(
      idEmpresa,
      filtros(q),
      usuario.sub,
      permisosDe(usuario),
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(buffer);
  }

  /** Todos los cambios de los ítems, del más reciente al más antiguo. */
  @RequirePermissions('costeo.material.ver')
  @Get('historial')
  historial(
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
    @Query() q: Record<string, string | undefined>,
  ) {
    return this.reporte.listarHistorial(
      idEmpresa,
      filtrosHistorial(q),
      permisosDe(usuario),
    );
  }

  /** La historia de UN ítem: su carga y cada cambio, con quién y por qué. */
  @RequirePermissions('costeo.material.ver')
  @Get(':id/historial')
  historialDeItem(
    @Param('id', ParseIntPipe) id: number,
    @EmpresaActual() idEmpresa: number,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.reporte.historialDeItem(id, idEmpresa, permisosDe(usuario));
  }

  // Las rutas fijas van ANTES de `:id`, o "entrega" entraría como un id.
  @RequirePermissions('costeo.material.entregar')
  @Patch('entrega')
  entrega(
    @Body() dto: EntregaMaterialesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.entrega(dto, usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.material.importar')
  @Patch('anular')
  anular(
    @Body() dto: AnularMaterialesDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.anular(
      dto,
      usuario.sub,
      idEmpresa,
      permisosDe(usuario),
    );
  }

  @RequirePermissions('costeo.material.valorizar')
  @Patch('congelar-costos')
  congelarCostos(
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.congelarCostos(usuario.sub, idEmpresa);
  }

  @RequirePermissions('costeo.material.importar')
  @Patch(':id')
  editar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarMaterialDto,
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
  ) {
    return this.service.editar(
      id,
      dto,
      usuario.sub,
      idEmpresa,
      permisosDe(usuario),
    );
  }
}
