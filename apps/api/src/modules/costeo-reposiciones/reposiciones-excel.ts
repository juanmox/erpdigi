import ExcelJS from 'exceljs';
import { NOMBRE_PASO } from './flujo';
import type {
  FilaSeguimiento,
  MetricasReposiciones,
} from './reposiciones-seguimiento.service';

/**
 * Excel del seguimiento y de las métricas de tiempo de reposiciones. Funciones
 * puras sobre datos ya resueltos (mismo patrón que `materiales-excel.ts`): sin
 * fila TOTAL dentro de las tablas, que se colaría en filtros y tablas dinámicas.
 */

const AZUL = 'FF203080';
type Celda = string | number | Date | null;
interface Col {
  h: string;
  w?: number;
  fmt?: string;
}

function estiloEncabezado(c: ExcelJS.Cell) {
  c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  c.alignment = { vertical: 'middle', wrapText: true };
}

function hoja(
  wb: ExcelJS.Workbook,
  nombre: string,
  cols: Col[],
  filas: Celda[][],
) {
  const ws = wb.addWorksheet(nombre);
  ws.addRow(cols.map((c) => c.h)).eachCell(estiloEncabezado);
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.w ?? 14;
    if (c.fmt) col.numFmt = c.fmt;
  });
  for (const f of filas) ws.addRow(f);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (filas.length > 0)
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: cols.length },
    };
  return ws;
}

/** Un instante en hora de Guatemala, como fecha "local" para Excel. */
const gt = (d: Date | string | null | undefined) =>
  d == null ? null : new Date(new Date(d).getTime() - 6 * 3600_000);
const FMT_FECHA = 'dd/mm/yyyy hh:mm';

const ETIQUETA_ESTADO: Record<string, string> = {
  EN_VALIDACION: 'En validación',
  DEVUELTA: 'Devuelta',
  POR_IMPRIMIR: 'Por imprimir',
  POR_DESPACHAR: 'Por despachar',
  DESPACHADA: 'Despachada',
  HISTORICA: 'Histórica',
};

export const etiquetaEstado = (
  f: Pick<FilaSeguimiento, 'estado' | 'pasoPendiente' | 'anuladoEn'>,
) =>
  f.anuladoEn
    ? 'Anulada'
    : f.estado === 'EN_VALIDACION'
      ? `Paso ${f.pasoPendiente}: ${NOMBRE_PASO[f.pasoPendiente ?? 2]}`
      : (ETIQUETA_ESTADO[f.estado] ?? f.estado);

const ETIQUETA_ACCION: Record<string, string> = {
  CREAR: 'Creó',
  VALIDAR: 'Validó',
  DEVOLVER: 'Devolvió',
  CORREGIR: 'Corrigió',
  IMPRIMIR: 'Imprimió requisición',
  REIMPRIMIR: 'Reimprimió (copia)',
  DESPACHAR: 'Despachó',
  ANULAR: 'Anuló',
};

export async function construirExcelSeguimiento(d: {
  filas: FilaSeguimiento[];
  truncado: boolean;
  generadoEn: Date;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Digitexsa ERP';
  wb.created = d.generadoEn;

  const horasEsperando = (f: FilaSeguimiento) =>
    f.estadoDesde &&
    !f.anuladoEn &&
    !['DESPACHADA', 'HISTORICA'].includes(f.estado)
      ? Math.round(
          ((d.generadoEn.getTime() - new Date(f.estadoDesde).getTime()) /
            3600_000) *
            100,
        ) / 100
      : null;

  const porEstado = new Map<string, number>();
  for (const f of d.filas)
    porEstado.set(
      etiquetaEstado(f),
      (porEstado.get(etiquetaEstado(f)) ?? 0) + 1,
    );
  const resumen = hoja(
    wb,
    'Por estado',
    [
      { h: 'Estado', w: 32 },
      { h: 'Reposiciones', w: 14 },
    ],
    [...porEstado].sort((a, b) => b[1] - a[1]),
  );
  if (d.truncado)
    resumen.addRow([
      `⚠️ El Excel se cortó en ${d.filas.length.toLocaleString('es-GT')} filas: afiná los filtros.`,
    ]);

  hoja(
    wb,
    'Detalle',
    [
      { h: 'Reposición', w: 18 },
      { h: 'OP', w: 13 },
      { h: 'Cliente', w: 22 },
      { h: 'Fecha', w: 16, fmt: FMT_FECHA },
      { h: 'Creada', w: 16, fmt: FMT_FECHA },
      { h: 'Creada por', w: 18 },
      { h: 'Tipo', w: 12 },
      { h: 'Estado', w: 26 },
      { h: 'Esperando (h)', w: 12, fmt: '0.00' },
      { h: 'Departamento', w: 16 },
      { h: 'Defecto', w: 22 },
      { h: 'Responsable', w: 18 },
      { h: 'Prendas', w: 40 },
      { h: 'Impresora', w: 10 },
      { h: 'Tipo de papel', w: 18 },
      { h: 'Yardas papel', w: 11, fmt: '0.00' },
      { h: 'Tela', w: 28 },
      { h: 'Yardas tela', w: 11, fmt: '0.00' },
      { h: 'Materiales', w: 40 },
      { h: 'Validaciones', w: 50 },
      { h: 'Devuelta (motivo)', w: 40 },
      { h: 'Nº requisición', w: 12 },
      { h: 'Nº talonario', w: 12 },
      { h: 'Despachada', w: 16, fmt: FMT_FECHA },
      { h: 'Comentario', w: 40 },
      { h: 'Motivo de anulación', w: 30 },
    ],
    d.filas.map((f) => [
      f.codigo,
      f.codigoOp,
      f.cliente,
      gt(f.fecha),
      gt(f.creadoEn),
      f.creadoPorNombre,
      f.tipo === 'MATERIALES' ? 'Materiales' : 'Reimpresión',
      etiquetaEstado(f),
      horasEsperando(f),
      f.departamento,
      f.defecto,
      f.responsable,
      f.prendas
        .map((p) => `${p.producto} ${p.talla}×${p.cantidad} ${p.pieza}`)
        .join(', ') || null,
      f.impresora,
      f.tipoPapel,
      f.yardasPapel || null,
      f.tela ? `${f.tela.codigo} ${f.tela.descripcion}` : null,
      f.tela ? f.yardasTela : null,
      f.materiales
        .map((m) => `${m.codigo} × ${m.cantidad} ${m.unidad}`)
        .join(' · ') || null,
      f.validaciones.map((v) => `P${v.paso} ${v.usuario}`).join(' · ') || null,
      f.devolucion
        ? `${f.devolucion.usuario}: ${f.devolucion.motivo ?? ''}`
        : null,
      f.requisicion?.numero ?? null,
      f.requisicion?.numeroTalonario ?? null,
      gt(f.requisicion?.despachadaEn ?? null),
      f.comentario,
      f.motivoAnulacion,
    ]),
  );

  return wb.xlsx.writeBuffer();
}

export async function construirExcelMetricas(d: {
  metricas: MetricasReposiciones;
  eventos: {
    fecha: Date;
    codigo: string;
    accion: string;
    paso: number;
    nombrePaso: string;
    usuario: string;
    horas: number;
    motivo: string | null;
  }[];
  generadoEn: Date;
}) {
  const m = d.metricas;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Digitexsa ERP';
  wb.created = d.generadoEn;
  const H = '0.00';

  hoja(
    wb,
    'Tiempos por paso',
    [
      { h: 'Paso', w: 6 },
      { h: 'Nombre', w: 28 },
      { h: 'Acción', w: 20 },
      { h: 'Cantidad', w: 10 },
      { h: 'Promedio (h)', w: 12, fmt: H },
      { h: 'Mediana (h)', w: 12, fmt: H },
      { h: 'P90 (h)', w: 10, fmt: H },
      { h: 'Máximo (h)', w: 11, fmt: H },
    ],
    m.porPaso.map((p) => [
      p.paso,
      p.nombre,
      ETIQUETA_ACCION[p.accion] ?? p.accion,
      p.cantidad,
      p.promedioHoras,
      p.medianaHoras,
      p.p90Horas,
      p.maximoHoras,
    ]),
  );
  hoja(
    wb,
    'Por validador',
    [
      { h: 'Paso', w: 6 },
      { h: 'Nombre del paso', w: 26 },
      { h: 'Usuario', w: 22 },
      { h: 'Validadas', w: 10 },
      { h: 'Devueltas', w: 10 },
      { h: 'Promedio (h)', w: 12, fmt: H },
      { h: 'P90 (h)', w: 10, fmt: H },
      { h: 'Máximo (h)', w: 11, fmt: H },
    ],
    m.porUsuario.map((p) => [
      p.paso,
      p.nombrePaso,
      p.usuario,
      p.validadas,
      p.devueltas,
      p.promedioHoras,
      p.p90Horas,
      p.maximoHoras,
    ]),
  );
  hoja(
    wb,
    'Devoluciones por creador',
    [
      { h: 'Creador', w: 24 },
      { h: 'Creadas', w: 10 },
      { h: 'Devoluciones', w: 13 },
    ],
    m.porCreador.map((p) => [p.usuario, p.creadas, p.devueltas]),
  );
  hoja(
    wb,
    'Devoluciones',
    [
      { h: 'Fecha', w: 16, fmt: FMT_FECHA },
      { h: 'Reposición', w: 18 },
      { h: 'Paso', w: 24 },
      { h: 'Devolvió', w: 20 },
      { h: 'Creador', w: 20 },
      { h: 'Motivo', w: 60 },
    ],
    m.devoluciones.map((x) => [
      gt(x.fecha),
      x.codigo,
      x.nombrePaso,
      x.usuario,
      x.creador,
      x.motivo,
    ]),
  );
  hoja(
    wb,
    'En curso',
    [
      { h: 'Reposición', w: 18 },
      { h: 'Esperando en', w: 26 },
      { h: 'Horas', w: 10, fmt: H },
      { h: 'Creador', w: 20 },
    ],
    m.enCurso.map((x) => [x.codigo, x.nombrePaso, x.horas, x.creador]),
  );
  hoja(
    wb,
    'Eventos',
    [
      { h: 'Fecha', w: 16, fmt: FMT_FECHA },
      { h: 'Reposición', w: 18 },
      { h: 'Acción', w: 20 },
      { h: 'Paso', w: 26 },
      { h: 'Usuario', w: 22 },
      { h: 'Tardó (h)', w: 10, fmt: H },
      { h: 'Motivo', w: 50 },
    ],
    d.eventos.map((e) => [
      gt(e.fecha),
      e.codigo,
      ETIQUETA_ACCION[e.accion] ?? e.accion,
      `${e.paso}. ${e.nombrePaso}`,
      e.usuario,
      e.horas,
      e.motivo,
    ]),
  );
  return wb.xlsx.writeBuffer();
}
