import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { inicioDelDiaGT } from '../../common/dia-guatemala';
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import {
  CosteoReportesService,
  type FiltrosConsumo,
} from './costeo-reportes.service';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

// `inicioDelDiaGT` vive en `common/dia-guatemala.ts`, compartido con la
// bitácora y el inventario de rollos: son interpretaciones del "mismo día"
// que no pueden divergir. El detalle de por qué está allá.

/**
 * Los filtros se resuelven acá y no en el servicio, para que las dos
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
/**
 * ¿Trae algún filtro de OF/factura? El rango de fecha de IMPRESIÓN deja de
 * ser obligatorio cuando sí — costear una OF completa exige TODO su consumo,
 * aunque se haya impreso meses antes. Sin ningún filtro de OF, el rango
 * sigue siendo obligatorio: no tiene sentido un reporte sin ningún límite.
 */
function tieneFiltroOf(q: Record<string, string | undefined>): boolean {
  return !!(
    q.ofs ||
    q.ofDesde ||
    q.ofHasta ||
    q.numeroFactura ||
    q.fechaOfDesde ||
    q.fechaOfHasta ||
    q.fechaFacturaDesde ||
    q.fechaFacturaHasta
  );
}

/** `fecha`/`fechaFactura` de la OF son columnas `date` (sin hora ni zona) —
 * a diferencia de `consumo_papel.fecha` (timestamptz), un `date` no tiene
 * concepto de zona horaria, así que `new Date(texto)` directo es exacto, sin
 * el anclaje a UTC-6 que sí hace falta para los timestamptz. */
function fechaOfQuery(v: string | undefined, nombre: string): Date | undefined {
  if (!v) return undefined;
  if (!DIA.test(v))
    throw new BadRequestException(`"${nombre}" no tiene el formato yyyy-mm-dd`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime()))
    throw new BadRequestException(`"${nombre}" no existe en el calendario`);
  return d;
}

function filtros(q: Record<string, string | undefined>): FiltrosConsumo {
  const conFiltroOf = tieneFiltroOf(q);

  let desde: Date | undefined;
  let hastaExclusivo: Date | undefined;
  // Sin filtro de OF: desde/hasta son obligatorios, como siempre fueron. Con
  // filtro de OF: son opcionales, pero si se manda uno de los dos se exige el
  // otro — un rango a medias no tiene sentido en ningún caso.
  if (!conFiltroOf || q.desde || q.hasta) {
    if (!q.desde || !DIA.test(q.desde))
      throw new BadRequestException(
        'Falta "desde" o no tiene el formato yyyy-mm-dd',
      );
    if (!q.hasta || !DIA.test(q.hasta))
      throw new BadRequestException(
        'Falta "hasta" o no tiene el formato yyyy-mm-dd',
      );
    desde = inicioDelDiaGT(q.desde);
    const inicioHasta = inicioDelDiaGT(q.hasta);
    if (Number.isNaN(desde.getTime()) || Number.isNaN(inicioHasta.getTime()))
      throw new BadRequestException(
        'Alguna de las fechas no existe en el calendario',
      );
    if (inicioHasta < desde)
      throw new BadRequestException('"hasta" no puede ser anterior a "desde"');
    hastaExclusivo = new Date(inicioHasta);
    hastaExclusivo.setUTCDate(hastaExclusivo.getUTCDate() + 1);
  }

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
    idSubcliente: num(q.idSubcliente),
    ofs: q.ofs
      ? q.ofs
          .split(',')
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
      : undefined,
    ofDesde: q.ofDesde?.trim().toUpperCase() || undefined,
    ofHasta: q.ofHasta?.trim().toUpperCase() || undefined,
    numeroFactura: q.numeroFactura?.trim() || undefined,
    fechaOfDesde: fechaOfQuery(q.fechaOfDesde, 'fechaOfDesde'),
    fechaOfHasta: fechaOfQuery(q.fechaOfHasta, 'fechaOfHasta'),
    fechaFacturaDesde: fechaOfQuery(q.fechaFacturaDesde, 'fechaFacturaDesde'),
    fechaFacturaHasta: fechaOfQuery(q.fechaFacturaHasta, 'fechaFacturaHasta'),
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
    // Sin rango de fecha (filtrando solo por OF) no hay "desde"/"hasta" que
    // nombrar — se usa el código de OF si lo trae, o un nombre genérico.
    const rango =
      f.desdeTexto && f.hastaTexto
        ? `${f.desdeTexto}_a_${f.hastaTexto}`
        : (f.ofs?.join('_') ?? 'ordenes_de_facturacion');
    const nombre = `consumo_por_op_${rango}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(buffer);
  }
}
