import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  CosteoReportesService,
  type FiltrosConsumo,
} from './costeo-reportes.service';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Guatemala es UTC-6 fijo y **sin horario de verano** (se abolió), así que el
 * desfase es constante y un día calendario se puede anclar exactamente. Si
 * alguna vez volviera el DST, esto habría que rehacerlo con una librería de
 * zonas horarias.
 */
const OFFSET_GT = '-06:00';

/** Instante en que empieza ese día calendario en Guatemala. */
function inicioDelDiaGT(dia: string): Date {
  return new Date(`${dia}T00:00:00${OFFSET_GT}`);
}

/**
 * Los cuatro filtros se resuelven acá y no en el servicio, para que las dos
 * rutas (datos y Excel) compartan exactamente la misma interpretación — si una
 * leyera las fechas distinto que la otra, el Excel no coincidiría con lo que se
 * ve en pantalla.
 *
 * ⚠️ `desde` y `hasta` son **días calendario de Guatemala**, no instantes. La
 * versión anterior hacía `new Date('2026-09-30')`, que es medianoche UTC, o sea
 * las 18:00 del 29 en Guatemala: el rango arrancaba 6 horas antes de tiempo y
 * —peor— se comía casi todo el último día, así que un cierre de mes dejaba
 * fuera lo impreso la tarde del 30 sin ningún síntoma. Por eso el límite
 * superior es el inicio del día SIGUIENTE y la comparación es exclusiva (`lt`,
 * ver el servicio): abarca el día pedido entero sin depender de la precisión
 * del timestamp.
 */
function filtros(q: Record<string, string | undefined>): FiltrosConsumo {
  if (!q.desde || !DIA.test(q.desde))
    throw new BadRequestException(
      'Falta "desde" o no tiene el formato yyyy-mm-dd',
    );
  if (!q.hasta || !DIA.test(q.hasta))
    throw new BadRequestException(
      'Falta "hasta" o no tiene el formato yyyy-mm-dd',
    );

  const desde = inicioDelDiaGT(q.desde);
  const inicioHasta = inicioDelDiaGT(q.hasta);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(inicioHasta.getTime()))
    throw new BadRequestException(
      'Alguna de las fechas no existe en el calendario',
    );
  if (inicioHasta < desde)
    throw new BadRequestException('"hasta" no puede ser anterior a "desde"');

  const hastaExclusivo = new Date(inicioHasta);
  hastaExclusivo.setUTCDate(hastaExclusivo.getUTCDate() + 1);

  const num = (v: string | undefined) => {
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    desde,
    hastaExclusivo,
    // Los días tal como se pidieron, para poder mostrarlos sin volver a
    // convertirlos: derivar el día calendario de vuelta desde un instante es
    // justo lo que hacía que la pantalla dijera "31/12/2025" cuando el usuario
    // había elegido el 1 de enero.
    desdeTexto: q.desde,
    hastaTexto: q.hasta,
    idCliente: num(q.idCliente),
    idImpresora: num(q.idImpresora),
  };
}

@Controller('costeo/reportes')
export class CosteoReportesController {
  constructor(private readonly service: CosteoReportesService) {}

  // `costeo.dashboard.ver` ya existía desde F1 sin gatear nada, y su audiencia
  // (Admin, Analista, Gerencia, Supervisor) es exactamente la de este reporte:
  // no hizo falta un permiso nuevo.
  @RequirePermissions('costeo.dashboard.ver')
  @Get('consumo')
  consumo(
    @EmpresaActual() idEmpresa: number,
    @Query() q: Record<string, string | undefined>,
  ) {
    return this.service.consumoPorOrden(idEmpresa, filtros(q));
  }

  @RequirePermissions('costeo.dashboard.ver')
  @Get('consumo/excel')
  async consumoExcel(
    @EmpresaActual() idEmpresa: number,
    @Query() q: Record<string, string | undefined>,
    @Res() res: Response,
  ) {
    const f = filtros(q);
    const buffer = await this.service.consumoPorOrdenExcel(idEmpresa, f);
    // Los días pedidos, no los instantes: `hastaExclusivo` es el día siguiente
    // y pondría una fecha que el usuario nunca eligió en el nombre del archivo.
    const nombre = `consumo_por_op_${f.desdeTexto}_a_${f.hastaTexto}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(buffer);
  }
}
