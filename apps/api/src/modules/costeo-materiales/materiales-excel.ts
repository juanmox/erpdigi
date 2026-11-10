import ExcelJS from 'exceljs';

/**
 * Excel de la explosión de materiales: lo que se ha cargado en la página, con
 * resúmenes para leerlo sin tener que armar una tabla dinámica.
 *
 * Es una función PURA sobre datos ya resueltos (el servicio consulta y mapea):
 * así el armado de hojas se lee de corrido y no mezcla consultas con formato.
 *
 * Reglas que atraviesan todas las hojas:
 *  - Los anulados NO cuentan en ningún resumen ni total (solo aparecen en el
 *    detalle, marcados, y en el resumen por estado).
 *  - Las cantidades solo se suman por insumo (misma unidad). Entre insumos
 *    distintos no se suman nunca: las unidades se mezclan.
 *  - El dinero solo existe si `verDinero`; sin el permiso las columnas ni se crean.
 *  - Sin fila TOTAL dentro de las tablas: se colaría en cualquier filtro o tabla
 *    dinámica. Los totales viven en la hoja "Resumen".
 */

export type EstadoExport = 'PENDIENTE' | 'ENTREGADO' | 'ANULADO';

export interface FilaExport {
  idMaterialOp: number;
  ordenPlanificacion: string;
  /** yyyy-mm-dd */
  fechaPlanificador: string;
  /** yyyy-mm-dd, en hora de Guatemala */
  fechaCarga: string;
  /** yyyy-mm-dd; null mientras esté pendiente */
  fechaEntrega: string | null;
  codigoOp: string;
  cliente: string | null;
  opLigada: boolean;
  insumoCodigo: string;
  insumoDescripcion: string;
  unidad: string;
  cantidad: number;
  estado: EstadoExport;
  salidaSac: string | null;
  entregadoPor: string | null;
  cargadoPor: string;
  idCarga: number | null;
  archivo: string | null;
  comentario: string | null;
  motivoAnulacion: string | null;
  sinCosto: boolean;
  /** null sin `ver_financiero` (y null si el ítem está sin costo). */
  costoUnitario: number | null;
  costoTotal: number | null;
  modificaciones: number;
  ultimaModificacion: Date | null;
}

export interface EventoExport {
  idMaterialOp: number;
  fecha: Date;
  accion: string;
  codigoOp: string;
  ordenPlanificacion: string;
  insumo: string;
  campo: string | null;
  antes: string | null;
  despues: string | null;
  motivo: string | null;
  usuario: string;
}

export interface DatosExcel {
  empresa: string;
  generadoPor: string;
  generadoEn: Date;
  /** Texto de cada filtro aplicado, para dejarlo escrito en el archivo. */
  filtros: string[];
  /** Si el tope cortó el resultado: cuántos hay y cuántos se exportaron. */
  truncado: { total: number; exportados: number } | null;
  verDinero: boolean;
  items: FilaExport[];
  eventos: EventoExport[];
}

const AZUL = 'FF203080';
const FMT_FECHA = 'dd/mm/yyyy';
const FMT_FECHA_HORA = 'dd/mm/yyyy hh:mm';
const FMT_Q = '#,##0.00';
const FMT_CANT = '#,##0.####';
const FMT_PCT = '0.0%';

type Celda = string | number | boolean | Date | null;
interface Col {
  h: string;
  w?: number;
  fmt?: string;
}

export const ETIQUETA_ACCION: Record<string, string> = {
  CARGA: 'Carga',
  EDITAR: 'Modificación',
  ANULAR: 'Anulación',
  ENTREGAR: 'Entrega',
  CORREGIR_FECHA: 'Corrección de fecha de entrega',
  REVERTIR: 'Entrega revertida',
  COSTO_CONGELADO: 'Costo congelado',
  LIGAR_OP: 'OP ligada',
};

export const ETIQUETA_CAMPO: Record<string, string> = {
  ordenPlanificacion: 'Orden de planificación',
  fechaPlanificador: 'Fecha del planificador',
  codigoOp: 'OP',
  insumo: 'Insumo',
  cantidad: 'Cantidad',
  comentario: 'Comentario',
  costoUnitario: 'Costo unitario',
  estado: 'Estado',
  salidaSac: 'Salida SAC',
  fechaEntrega: 'Fecha de entrega',
  opLigada: 'OP en el ERP',
};

const ETIQUETA_ESTADO: Record<EstadoExport, string> = {
  PENDIENTE: 'Pendiente',
  ENTREGADO: 'Entregado',
  ANULADO: 'Anulado',
};

/** yyyy-mm-dd -> Date a medianoche UTC: Excel lo muestra como ese mismo día. */
const dia = (d: string | null): Date | null =>
  d ? new Date(`${d}T00:00:00.000Z`) : null;

/**
 * Un instante como hora de Guatemala. ExcelJS escribe los campos UTC de la
 * fecha, así que se corre -6 h para que la celda muestre la hora local.
 */
const instante = (d: Date | null): Date | null =>
  d ? new Date(d.getTime() - 6 * 3600_000) : null;

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);

const unicos = <T>(xs: T[]) => [...new Set(xs)];
const suma = (xs: (number | null)[]) =>
  xs.reduce<number>((a, x) => a + (x ?? 0), 0);
const prom = (xs: number[]) => (xs.length ? suma(xs) / xs.length : null);
const redondear = (n: number | null, d = 1) =>
  n == null ? null : Math.round(n * 10 ** d) / 10 ** d;

function agrupar<T>(xs: T[], clave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = clave(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
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
): ExcelJS.Worksheet {
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

export async function construirExcelMateriales(
  d: DatosExcel,
): Promise<ExcelJS.Buffer> {
  const { verDinero } = d;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Digitexsa ERP';
  wb.created = d.generadoEn;

  const items = d.items;
  const vig = items.filter((i) => i.estado !== 'ANULADO');
  const pend = vig.filter((i) => i.estado === 'PENDIENTE');
  const ent = vig.filter((i) => i.estado === 'ENTREGADO');
  const hoy = instante(d.generadoEn)!.toISOString().slice(0, 10);
  const q = (xs: FilaExport[]) => suma(xs.map((i) => i.costoTotal));
  const pct = (a: number, b: number) => (b > 0 ? a / b : null);

  // ───────────────────────── Resumen ─────────────────────────
  const rs = wb.addWorksheet('Resumen');
  rs.getColumn(1).width = 46;
  rs.getColumn(2).width = 22;
  rs.getColumn(3).width = 60;
  rs.addRow(['Explosión de materiales — resumen']).font = {
    bold: true,
    size: 14,
  };
  rs.addRow([d.empresa]);
  rs.addRow([
    `Generado el ${instante(d.generadoEn)!.toLocaleString('es-GT', { timeZone: 'UTC' })} por ${d.generadoPor}`,
  ]);
  rs.addRow([
    d.filtros.length
      ? `Filtros: ${d.filtros.join(' · ')}`
      : 'Sin filtros: todo lo cargado',
  ]);
  if (d.truncado)
    rs.addRow([
      `⚠ Hay ${d.truncado.total} ítems con estos filtros y se exportaron los primeros ${d.truncado.exportados}: afiná los filtros para ver el resto.`,
    ]).font = { bold: true, color: { argb: 'FFB45309' } };
  rs.addRow([]);

  const seccion = (titulo: string) => {
    const r = rs.addRow([titulo, '', '']);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (let col = 1; col <= 3; col++)
      r.getCell(col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: AZUL },
      };
  };
  const kv = (etiqueta: string, valor: Celda, fmt?: string, nota?: string) => {
    const r = rs.addRow([etiqueta, valor, nota ?? '']);
    if (fmt) r.getCell(2).numFmt = fmt;
    r.getCell(2).alignment = { horizontal: 'right' };
    r.getCell(3).font = { italic: true, color: { argb: 'FF6B7280' } };
  };

  seccion('Estado de la explosión');
  kv('Ítems vigentes', vig.length, '#,##0', 'Sin contar los anulados');
  kv('Pendientes de entrega', pend.length, '#,##0');
  kv('Entregados', ent.length, '#,##0');
  kv('% entregado', pct(ent.length, vig.length), FMT_PCT);
  const anul = items.filter((i) => i.estado === 'ANULADO').length;
  if (anul > 0)
    kv('Anulados', anul, '#,##0', 'Aparecen en el detalle, marcados');
  const modificados = vig.filter((i) => i.modificaciones > 0).length;
  kv(
    'Ítems con modificaciones',
    modificados,
    '#,##0',
    'Detalle en la hoja "Historial de cambios"',
  );
  kv(
    'Sin costo (el insumo no tenía precio al cargar)',
    vig.filter((i) => i.sinCosto).length,
    '#,##0',
  );
  kv(
    'Con la OP todavía sin cargar en el ERP',
    vig.filter((i) => !i.opLigada).length,
    '#,##0',
  );

  rs.addRow([]);
  seccion('Alcance');
  kv(
    'Órdenes de planificación',
    unicos(vig.map((i) => i.ordenPlanificacion)).length,
    '#,##0',
  );
  kv('OP distintas', unicos(vig.map((i) => i.codigoOp)).length, '#,##0');
  kv(
    'Insumos distintos',
    unicos(vig.map((i) => i.insumoCodigo)).length,
    '#,##0',
  );
  kv(
    'Salidas SAC distintas',
    unicos(ent.map((i) => i.salidaSac)).length,
    '#,##0',
  );
  kv(
    'Archivos cargados',
    unicos(vig.map((i) => i.idCarga).filter((x) => x != null)).length,
    '#,##0',
  );
  const fechas = vig.map((i) => i.fechaPlanificador).sort();
  if (fechas.length) {
    kv('Primera fecha de planificador', dia(fechas[0]), FMT_FECHA);
    kv(
      'Última fecha de planificador',
      dia(fechas[fechas.length - 1]),
      FMT_FECHA,
    );
  }

  rs.addRow([]);
  seccion('Tiempos');
  const entrega = ent
    .filter((i) => i.fechaEntrega)
    .map((i) => diasEntre(i.fechaPlanificador, i.fechaEntrega!));
  kv(
    'Días del planificador a la entrega (promedio)',
    redondear(prom(entrega)),
    '0.0',
    'Solo ítems entregados',
  );
  kv(
    'Días del planificador a la entrega (máximo)',
    entrega.length ? Math.max(...entrega) : null,
    '0',
  );
  const espera = pend.map((i) => diasEntre(i.fechaPlanificador, hoy));
  kv(
    'Días de espera de los pendientes (promedio)',
    redondear(prom(espera)),
    '0.0',
    'Desde la fecha del planificador hasta hoy',
  );
  kv(
    'Días de espera del pendiente más antiguo',
    espera.length ? Math.max(...espera) : null,
    '0',
  );
  const tramos: [string, (n: number) => boolean][] = [
    ['Pendientes con 0 a 2 días', (n) => n <= 2],
    ['Pendientes con 3 a 7 días', (n) => n >= 3 && n <= 7],
    ['Pendientes con 8 a 15 días', (n) => n >= 8 && n <= 15],
    ['Pendientes con más de 15 días', (n) => n > 15],
  ];
  for (const [t, f] of tramos) kv(t, espera.filter(f).length, '#,##0');

  if (verDinero) {
    rs.addRow([]);
    seccion('Costo congelado (Q)');
    kv(
      'Costo total de lo vigente',
      q(vig),
      FMT_Q,
      'No incluye los ítems sin costo',
    );
    kv('Costo de lo ya entregado', q(ent), FMT_Q);
    kv('Costo de lo pendiente de entrega', q(pend), FMT_Q);
  }

  // ───────────────────────── Por orden de planificación ─────────────────────────
  {
    const cols: Col[] = [
      { h: 'Orden de planificación', w: 20 },
      { h: 'Fecha del planificador', w: 14, fmt: FMT_FECHA },
      { h: 'Ítems', w: 8, fmt: '#,##0' },
      { h: 'OP', w: 8, fmt: '#,##0' },
      { h: 'Pendientes', w: 11, fmt: '#,##0' },
      { h: 'Entregados', w: 11, fmt: '#,##0' },
      { h: '% entregado', w: 11, fmt: FMT_PCT },
      { h: 'Sin costo', w: 10, fmt: '#,##0' },
      { h: 'OP sin cargar', w: 12, fmt: '#,##0' },
      { h: 'Primera entrega', w: 14, fmt: FMT_FECHA },
      { h: 'Última entrega', w: 14, fmt: FMT_FECHA },
      { h: 'Días a entregar (prom.)', w: 14, fmt: '0.0' },
      { h: 'Pendiente más antiguo (días)', w: 16, fmt: '0' },
      { h: 'Cargado por', w: 24 },
      ...(verDinero ? [{ h: 'Costo (Q)', w: 14, fmt: FMT_Q }] : []),
    ];
    const filas = [...agrupar(vig, (i) => i.ordenPlanificacion).entries()]
      .map(([plan, xs]) => {
        const e = xs.filter((i) => i.estado === 'ENTREGADO');
        const p = xs.filter((i) => i.estado === 'PENDIENTE');
        const fe = e
          .map((i) => i.fechaEntrega!)
          .filter(Boolean)
          .sort();
        const fp = xs.map((i) => i.fechaPlanificador).sort();
        return {
          orden: fp[0],
          fila: [
            plan,
            dia(fp[0]),
            xs.length,
            unicos(xs.map((i) => i.codigoOp)).length,
            p.length,
            e.length,
            pct(e.length, xs.length),
            xs.filter((i) => i.sinCosto).length,
            xs.filter((i) => !i.opLigada).length,
            dia(fe[0] ?? null),
            dia(fe[fe.length - 1] ?? null),
            redondear(
              prom(
                e
                  .filter((i) => i.fechaEntrega)
                  .map((i) => diasEntre(i.fechaPlanificador, i.fechaEntrega!)),
              ),
            ),
            p.length
              ? Math.max(...p.map((i) => diasEntre(i.fechaPlanificador, hoy)))
              : null,
            unicos(xs.map((i) => i.cargadoPor)).join(', '),
            ...(verDinero ? [q(xs)] : []),
          ] as Celda[],
        };
      })
      // Lo más reciente primero, igual que la página.
      .sort((a, b) => (a.orden < b.orden ? 1 : a.orden > b.orden ? -1 : 0))
      .map((x) => x.fila);
    hoja(wb, 'Por planificador', cols, filas);
  }

  // ───────────────────────── Por fecha ─────────────────────────
  {
    // Las tres fechas en una sola tabla: cuánto se planificó, cuánto se cargó y
    // cuánto se entregó cada día, para ver el desfase entre las tres.
    const planificados = agrupar(vig, (i) => i.fechaPlanificador);
    const cargados = agrupar(vig, (i) => i.fechaCarga);
    const entregados = agrupar(
      ent.filter((i) => i.fechaEntrega),
      (i) => i.fechaEntrega!,
    );
    const dias = unicos([
      ...planificados.keys(),
      ...cargados.keys(),
      ...entregados.keys(),
    ]).sort();
    const cols: Col[] = [
      { h: 'Fecha', w: 13, fmt: FMT_FECHA },
      { h: 'Ítems planificados ese día', w: 16, fmt: '#,##0' },
      { h: 'Ítems cargados ese día', w: 16, fmt: '#,##0' },
      { h: 'Ítems entregados ese día', w: 16, fmt: '#,##0' },
      { h: 'Órdenes de planificación (planificadas)', w: 18, fmt: '#,##0' },
      { h: 'OP entregadas', w: 12, fmt: '#,##0' },
      ...(verDinero ? [{ h: 'Costo entregado (Q)', w: 16, fmt: FMT_Q }] : []),
    ];
    const filas = dias.map((dd) => {
      const p = planificados.get(dd) ?? [];
      const c = cargados.get(dd) ?? [];
      const e = entregados.get(dd) ?? [];
      return [
        dia(dd),
        p.length,
        c.length,
        e.length,
        unicos(p.map((i) => i.ordenPlanificacion)).length,
        unicos(e.map((i) => i.codigoOp)).length,
        ...(verDinero ? [q(e)] : []),
      ] as Celda[];
    });
    hoja(wb, 'Por fecha', cols, filas);
  }

  // ───────────────────────── Por estado ─────────────────────────
  {
    const cols: Col[] = [
      { h: 'Estado', w: 44 },
      { h: 'Ítems', w: 10, fmt: '#,##0' },
      { h: 'OP', w: 10, fmt: '#,##0' },
      { h: 'Órdenes de planificación', w: 14, fmt: '#,##0' },
      ...(verDinero ? [{ h: 'Costo (Q)', w: 14, fmt: FMT_Q }] : []),
    ];
    const fila = (etiqueta: string, xs: FilaExport[]): Celda[] => [
      etiqueta,
      xs.length,
      unicos(xs.map((i) => i.codigoOp)).length,
      unicos(xs.map((i) => i.ordenPlanificacion)).length,
      ...(verDinero ? [q(xs)] : []),
    ];
    hoja(wb, 'Por estado', cols, [
      fila('Pendiente', pend),
      fila('Entregado', ent),
      fila(
        'Anulado',
        items.filter((i) => i.estado === 'ANULADO'),
      ),
      fila(
        '— de lo vigente: sin costo',
        vig.filter((i) => i.sinCosto),
      ),
      fila(
        '— de lo vigente: OP sin cargar en el ERP',
        vig.filter((i) => !i.opLigada),
      ),
      fila(
        '— de lo vigente: con modificaciones',
        vig.filter((i) => i.modificaciones > 0),
      ),
    ]);
  }

  // ───────────────────────── Por insumo ─────────────────────────
  {
    const cols: Col[] = [
      { h: 'Código', w: 16 },
      { h: 'Descripción', w: 44 },
      { h: 'Unidad', w: 10 },
      { h: 'Ítems', w: 8, fmt: '#,##0' },
      { h: 'OP', w: 8, fmt: '#,##0' },
      { h: 'Cantidad pedida', w: 15, fmt: FMT_CANT },
      { h: 'Cantidad entregada', w: 16, fmt: FMT_CANT },
      { h: 'Cantidad pendiente', w: 16, fmt: FMT_CANT },
      { h: 'Ítems sin costo', w: 12, fmt: '#,##0' },
      ...(verDinero ? [{ h: 'Costo (Q)', w: 14, fmt: FMT_Q }] : []),
    ];
    const filas = [...agrupar(vig, (i) => i.insumoCodigo).entries()]
      .map(([codigo, xs]) => ({
        n: xs.length,
        fila: [
          codigo,
          xs[0].insumoDescripcion,
          xs[0].unidad,
          xs.length,
          unicos(xs.map((i) => i.codigoOp)).length,
          suma(xs.map((i) => i.cantidad)),
          suma(
            xs.filter((i) => i.estado === 'ENTREGADO').map((i) => i.cantidad),
          ),
          suma(
            xs.filter((i) => i.estado === 'PENDIENTE').map((i) => i.cantidad),
          ),
          xs.filter((i) => i.sinCosto).length,
          ...(verDinero ? [q(xs)] : []),
        ] as Celda[],
      }))
      .sort((a, b) => b.n - a.n)
      .map((x) => x.fila);
    hoja(wb, 'Por insumo', cols, filas);
  }

  // ───────────────────────── Por OP ─────────────────────────
  {
    const cols: Col[] = [
      { h: 'OP', w: 14 },
      { h: 'Cliente', w: 26 },
      { h: 'OP cargada en el ERP', w: 14 },
      { h: 'Órdenes de planificación', w: 26 },
      { h: 'Ítems', w: 8, fmt: '#,##0' },
      { h: 'Pendientes', w: 11, fmt: '#,##0' },
      { h: 'Entregados', w: 11, fmt: '#,##0' },
      ...(verDinero ? [{ h: 'Costo (Q)', w: 14, fmt: FMT_Q }] : []),
    ];
    const filas = [...agrupar(vig, (i) => i.codigoOp).entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(
        ([op, xs]) =>
          [
            op,
            xs[0].cliente ?? '',
            xs[0].opLigada ? 'Sí' : 'No',
            unicos(xs.map((i) => i.ordenPlanificacion)).join(', '),
            xs.length,
            xs.filter((i) => i.estado === 'PENDIENTE').length,
            xs.filter((i) => i.estado === 'ENTREGADO').length,
            ...(verDinero ? [q(xs)] : []),
          ] as Celda[],
      );
    hoja(wb, 'Por OP', cols, filas);
  }

  // ───────────────────────── Por salida SAC ─────────────────────────
  {
    const cols: Col[] = [
      { h: 'Salida SAC', w: 14 },
      { h: 'Primera fecha de entrega', w: 14, fmt: FMT_FECHA },
      { h: 'Última fecha de entrega', w: 14, fmt: FMT_FECHA },
      { h: 'Ítems', w: 8, fmt: '#,##0' },
      { h: 'Insumos distintos', w: 12, fmt: '#,##0' },
      { h: 'OP', w: 8, fmt: '#,##0' },
      { h: 'Órdenes de planificación', w: 24 },
      { h: 'Registrada por', w: 24 },
      ...(verDinero ? [{ h: 'Costo (Q)', w: 14, fmt: FMT_Q }] : []),
    ];
    const filas = [
      ...agrupar(
        ent.filter((i) => i.salidaSac),
        (i) => i.salidaSac!,
      ).entries(),
    ]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([salida, xs]) => {
        const fe = xs
          .map((i) => i.fechaEntrega!)
          .filter(Boolean)
          .sort();
        return [
          salida,
          dia(fe[0] ?? null),
          dia(fe[fe.length - 1] ?? null),
          xs.length,
          unicos(xs.map((i) => i.insumoCodigo)).length,
          unicos(xs.map((i) => i.codigoOp)).length,
          unicos(xs.map((i) => i.ordenPlanificacion)).join(', '),
          unicos(xs.map((i) => i.entregadoPor ?? ''))
            .filter(Boolean)
            .join(', '),
          ...(verDinero ? [q(xs)] : []),
        ] as Celda[];
      });
    hoja(wb, 'Por salida SAC', cols, filas);
  }

  // ───────────────────────── Por carga ─────────────────────────
  {
    const cols: Col[] = [
      { h: 'Carga #', w: 9 },
      { h: 'Archivo', w: 38 },
      { h: 'Fecha de carga', w: 14, fmt: FMT_FECHA },
      { h: 'Cargado por', w: 24 },
      { h: 'Ítems', w: 8, fmt: '#,##0' },
      { h: 'Vigentes', w: 10, fmt: '#,##0' },
      { h: 'Anulados', w: 10, fmt: '#,##0' },
      { h: 'Pendientes', w: 11, fmt: '#,##0' },
      { h: 'Entregados', w: 11, fmt: '#,##0' },
      ...(verDinero ? [{ h: 'Costo (Q)', w: 14, fmt: FMT_Q }] : []),
    ];
    const filas = [
      ...agrupar(items, (i) => String(i.idCarga ?? 'sin')).entries(),
    ]
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([id, xs]) => {
        const v = xs.filter((i) => i.estado !== 'ANULADO');
        return [
          id === 'sin' ? null : Number(id),
          xs[0].archivo ??
            (id === 'sin'
              ? '(sin archivo: viene de Inventario)'
              : '(sin nombre)'),
          dia(xs[0].fechaCarga),
          xs[0].cargadoPor,
          xs.length,
          v.length,
          xs.length - v.length,
          v.filter((i) => i.estado === 'PENDIENTE').length,
          v.filter((i) => i.estado === 'ENTREGADO').length,
          ...(verDinero ? [q(v)] : []),
        ] as Celda[];
      });
    hoja(wb, 'Por carga', cols, filas);
  }

  // ───────────────────────── Por usuario ─────────────────────────
  {
    // Quién hizo qué. Los ítems cargados salen del propio ítem; el resto, del
    // historial de cambios de estos mismos ítems.
    type Cont = {
      cargados: number;
      entregadosVigentes: number;
      modificaciones: number;
      fechas: number;
      reversiones: number;
      anulaciones: number;
    };
    const por = new Map<string, Cont>();
    const c = (u: string) => {
      let x = por.get(u);
      if (!x) {
        x = {
          cargados: 0,
          entregadosVigentes: 0,
          modificaciones: 0,
          fechas: 0,
          reversiones: 0,
          anulaciones: 0,
        };
        por.set(u, x);
      }
      return x;
    };
    for (const i of items) c(i.cargadoPor).cargados++;
    for (const i of ent)
      if (i.entregadoPor) c(i.entregadoPor).entregadosVigentes++;
    // Un acto sobre varios campos son varias filas de evento: se cuenta una vez
    // por (acto, ítem), que es lo que identifican fecha+usuario+ítem+acción.
    const vistos = new Set<string>();
    for (const e of d.eventos) {
      // Con el id del ítem: dos ítems del mismo insumo en la misma OP (legítimo)
      // anulados en un mismo lote tienen todo lo demás igual.
      const k = `${e.fecha.getTime()}|${e.usuario}|${e.idMaterialOp}|${e.accion}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      const x = c(e.usuario);
      if (e.accion === 'EDITAR') x.modificaciones++;
      else if (e.accion === 'CORREGIR_FECHA') x.fechas++;
      else if (e.accion === 'REVERTIR') x.reversiones++;
      else if (e.accion === 'ANULAR') x.anulaciones++;
    }
    const cols: Col[] = [
      { h: 'Usuario', w: 30 },
      { h: 'Ítems cargados', w: 14, fmt: '#,##0' },
      { h: 'Ítems entregados (registró la salida)', w: 20, fmt: '#,##0' },
      { h: 'Modificaciones', w: 15, fmt: '#,##0' },
      { h: 'Fechas de entrega corregidas', w: 17, fmt: '#,##0' },
      { h: 'Entregas revertidas', w: 14, fmt: '#,##0' },
      { h: 'Anulaciones', w: 13, fmt: '#,##0' },
    ];
    const filas = [...por.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([u, x]) =>
          [
            u,
            x.cargados,
            x.entregadosVigentes,
            x.modificaciones,
            x.fechas,
            x.reversiones,
            x.anulaciones,
          ] as Celda[],
      );
    hoja(wb, 'Por usuario', cols, filas);
  }

  // ───────────────────────── Detalle ─────────────────────────
  {
    const cols: Col[] = [
      { h: 'Orden de planificación', w: 20 },
      { h: 'Fecha del planificador', w: 13, fmt: FMT_FECHA },
      { h: 'OP', w: 14 },
      { h: 'Cliente', w: 24 },
      { h: 'OP cargada en el ERP', w: 12 },
      { h: 'Código insumo', w: 16 },
      { h: 'Descripción', w: 40 },
      { h: 'Unidad', w: 9 },
      { h: 'Cantidad', w: 12, fmt: FMT_CANT },
      { h: 'Estado', w: 11 },
      { h: 'Fecha de carga', w: 13, fmt: FMT_FECHA },
      { h: 'Cargado por', w: 22 },
      { h: 'Archivo', w: 30 },
      { h: 'Fecha de entrega', w: 13, fmt: FMT_FECHA },
      { h: 'Salida SAC', w: 11 },
      { h: 'Entregado por', w: 22 },
      { h: 'Días a la entrega', w: 11, fmt: '0' },
      { h: 'Días de espera', w: 11, fmt: '0' },
      { h: 'Comentario', w: 32 },
      { h: 'Motivo de anulación', w: 32 },
      { h: 'Modificaciones', w: 13, fmt: '#,##0' },
      { h: 'Última modificación', w: 17, fmt: FMT_FECHA_HORA },
      { h: 'Sin costo', w: 9 },
      ...(verDinero
        ? [
            { h: 'Costo unitario (Q)', w: 14, fmt: '#,##0.000000' },
            { h: 'Costo total (Q)', w: 14, fmt: FMT_Q },
          ]
        : []),
    ];
    const filas = items.map(
      (i) =>
        [
          i.ordenPlanificacion,
          dia(i.fechaPlanificador),
          i.codigoOp,
          i.cliente ?? '',
          i.opLigada ? 'Sí' : 'No',
          i.insumoCodigo,
          i.insumoDescripcion,
          i.unidad,
          i.cantidad,
          ETIQUETA_ESTADO[i.estado],
          dia(i.fechaCarga),
          i.cargadoPor,
          i.archivo ?? '',
          dia(i.fechaEntrega),
          i.salidaSac ?? '',
          i.entregadoPor ?? '',
          i.estado === 'ENTREGADO' && i.fechaEntrega
            ? diasEntre(i.fechaPlanificador, i.fechaEntrega)
            : null,
          i.estado === 'PENDIENTE' ? diasEntre(i.fechaPlanificador, hoy) : null,
          i.comentario ?? '',
          i.motivoAnulacion ?? '',
          i.modificaciones,
          instante(i.ultimaModificacion),
          i.sinCosto ? 'Sí' : 'No',
          ...(verDinero ? [i.costoUnitario, i.costoTotal] : []),
        ] as Celda[],
    );
    hoja(wb, 'Detalle', cols, filas);
  }

  // ───────────────────────── Historial de cambios ─────────────────────────
  {
    const cols: Col[] = [
      { h: 'Fecha y hora', w: 17, fmt: FMT_FECHA_HORA },
      { h: 'Acción', w: 26 },
      { h: 'OP', w: 14 },
      { h: 'Orden de planificación', w: 20 },
      { h: 'Insumo', w: 40 },
      { h: 'Campo', w: 22 },
      { h: 'Antes', w: 34 },
      { h: 'Después', w: 34 },
      { h: 'Motivo', w: 40 },
      { h: 'Usuario', w: 24 },
    ];
    const filas = d.eventos.map(
      (e) =>
        [
          instante(e.fecha),
          ETIQUETA_ACCION[e.accion] ?? e.accion,
          e.codigoOp,
          e.ordenPlanificacion,
          e.insumo,
          e.campo ? (ETIQUETA_CAMPO[e.campo] ?? e.campo) : '',
          e.antes ?? '',
          e.despues ?? '',
          e.motivo ?? '',
          e.usuario,
        ] as Celda[],
    );
    hoja(wb, 'Historial de cambios', cols, filas);
  }

  return wb.xlsx.writeBuffer();
}
