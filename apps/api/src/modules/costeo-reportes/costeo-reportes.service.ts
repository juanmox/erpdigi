import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';

export interface FiltrosConsumo {
  /** Inicio del día `desdeTexto` en Guatemala. Inclusivo. */
  desde: Date;
  /**
   * Inicio del día SIGUIENTE a `hastaTexto` en Guatemala. **Exclusivo** — se
   * compara con `lt`, no con `lte`, para abarcar el último día entero. Lo
   * arma el controlador; ver el comentario de `filtros()` allá.
   */
  hastaExclusivo: Date;
  /** Los días calendario tal como se pidieron (`yyyy-mm-dd`), para mostrarlos. */
  desdeTexto: string;
  hastaTexto: string;
  idCliente?: number;
  idImpresora?: number;
}

/** `2026-09-30` -> `30/09/2026`, sin pasar por `Date` ni por zonas horarias. */
const diaLegible = (dia: string) => dia.split('-').reverse().join('/');

/** Una fila del resumen: el consolidado de una OP. */
export interface ResumenOrden {
  codigo: string;
  cliente: string | null;
  impresionYd: number;
  enguiamientoYd: number;
  enBlancoYd: number;
  reposicionYd: number;
  /** Suma de los cuatro conceptos de PAPEL. La tela va aparte. */
  totalPapelYd: number;
  telaYd: number;
}

const F4 = (n: number) => +n.toFixed(4);

/**
 * Cómo se identifica la fila de papel en blanco en el detalle y en el espejo a
 * Google Sheets. Es la misma etiqueta en los dos lados a propósito: el usuario
 * pidió que en la hoja se vea tal cual aparece en el reporte.
 */
export const ETIQUETA_EN_BLANCO = 'En blanco por REPO';

@Injectable()
export class CosteoReportesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consolidado de consumo por orden de producción.
   *
   * Reúne en un solo lugar todo el papel que una OP se llevó del rollo:
   * impresión, enguiamiento, papel en blanco y reposiciones. Los cuatro salen
   * del rollo montado (confirmado por el usuario el 2026-09-30), así que suman
   * a un mismo total.
   *
   * La TELA va en su propia columna y **no** entra en el total de papel: es
   * otro material y no sale del rollo. Sumarla daría un número sin significado
   * físico.
   *
   * Se excluye lo anulado (`anuladoEn: null`), mismo criterio que el descuento
   * del rollo: un consumo anulado no se consumió.
   *
   * ⚠️ El filtro de fechas va sobre `consumo_papel.fecha` / `reposicion.fecha`,
   * que es **cuándo se imprimió**, no cuándo se cargó al sistema. Es la fecha
   * que importa para cerrar un mes, y puede diferir de `creado_en` cuando se
   * registra algo con fecha pasada.
   */
  async consumoPorOrden(idEmpresa: number, f: FiltrosConsumo) {
    // `lt` y no `lte`: el límite superior es el arranque del día siguiente.
    const rangoFecha = { gte: f.desde, lt: f.hastaExclusivo };
    const ordenDeLaEmpresa = {
      idEmpresa,
      ...(f.idCliente ? { idCliente: f.idCliente } : {}),
    };

    const [consumos, reposiciones] = await Promise.all([
      this.prisma.consumoPapel.findMany({
        where: {
          anuladoEn: null,
          fecha: rangoFecha,
          ordenProduccion: ordenDeLaEmpresa,
          ...(f.idImpresora ? { idImpresora: f.idImpresora } : {}),
        },
        include: {
          ordenProduccion: {
            select: {
              codigo: true,
              anio: true,
              correlativo: true,
              cliente: { select: { nombre: true } },
            },
          },
          lineaProduccion: { select: { codigoLine: true } },
          producto: { select: { codigo: true } },
          talla: { select: { nombre: true } },
          impresora: { select: { codigo: true } },
          tipoPapel: { select: { nombre: true } },
          reposicion: { select: { codigoRepo: true } },
        },
        orderBy: [{ fecha: 'asc' }, { idConsumoPapel: 'asc' }],
      }),
      // Las reposiciones se consultan aparte porque una de SOLO TELA no genera
      // ninguna fila en `consumo_papel` — no toca el rollo. Si se leyeran solo
      // desde ahí, esa tela desaparecería del reporte.
      this.prisma.reposicion.findMany({
        where: {
          anuladoEn: null,
          fecha: rangoFecha,
          ordenProduccion: ordenDeLaEmpresa,
          ...(f.idImpresora ? { idImpresora: f.idImpresora } : {}),
        },
        include: {
          ordenProduccion: { select: { codigo: true } },
          departamento: { select: { nombre: true } },
          defecto: { select: { nombre: true } },
          impresora: { select: { codigo: true } },
          tipoPapel: { select: { nombre: true } },
          insumoTela: { select: { codigo: true, descripcion: true } },
        },
        orderBy: [{ fecha: 'asc' }, { idReposicion: 'asc' }],
      }),
    ]);

    // ── Opciones de filtro, del rango completo ──────────────────────
    const [ordenesDelRango, impresorasDelRango] = await Promise.all([
      this.prisma.ordenProduccion.findMany({
        where: {
          idEmpresa,
          consumosPapel: { some: { anuladoEn: null, fecha: rangoFecha } },
          idCliente: { not: null },
        },
        select: { idCliente: true, cliente: { select: { nombre: true } } },
        distinct: ['idCliente'],
      }),
      this.prisma.consumoPapel.findMany({
        where: {
          anuladoEn: null,
          fecha: rangoFecha,
          ordenProduccion: { idEmpresa },
        },
        select: { idImpresora: true, impresora: { select: { codigo: true } } },
        distinct: ['idImpresora'],
      }),
    ]);
    const opciones = {
      clientes: ordenesDelRango
        .map((o) => ({
          idCliente: o.idCliente!,
          nombre: o.cliente?.nombre ?? '',
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
      impresoras: impresorasDelRango
        .map((c) => ({
          idImpresora: c.idImpresora,
          codigo: c.impresora.codigo,
        }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    };

    // ── Resumen por OP ──────────────────────────────────────────────────
    const porOrden = new Map<string, ResumenOrden>();
    const vacia = (codigo: string, cliente: string | null): ResumenOrden => ({
      codigo,
      cliente,
      impresionYd: 0,
      enguiamientoYd: 0,
      enBlancoYd: 0,
      reposicionYd: 0,
      totalPapelYd: 0,
      telaYd: 0,
    });

    for (const c of consumos) {
      const cod = c.ordenProduccion.codigo;
      if (!porOrden.has(cod))
        porOrden.set(
          cod,
          vacia(cod, c.ordenProduccion.cliente?.nombre ?? null),
        );
      const r = porOrden.get(cod)!;
      if (c.origen === 'REPOSICION') r.reposicionYd += Number(c.consumoYd);
      else {
        r.impresionYd += Number(c.consumoYd);
        r.enguiamientoYd += Number(c.enguiamientoYd);
        r.enBlancoYd += Number(c.enBlancoYd);
      }
    }
    for (const rp of reposiciones) {
      const cod = rp.ordenProduccion.codigo;
      if (!porOrden.has(cod)) porOrden.set(cod, vacia(cod, null));
      porOrden.get(cod)!.telaYd += Number(rp.yardasTela);
    }

    const resumen = [...porOrden.values()]
      .map((r) => ({
        ...r,
        impresionYd: F4(r.impresionYd),
        enguiamientoYd: F4(r.enguiamientoYd),
        enBlancoYd: F4(r.enBlancoYd),
        reposicionYd: F4(r.reposicionYd),
        totalPapelYd: F4(
          r.impresionYd + r.enguiamientoYd + r.enBlancoYd + r.reposicionYd,
        ),
        telaYd: F4(r.telaYd),
      }))
      .sort((a, b) => b.codigo.localeCompare(a.codigo));

    const totales = resumen.reduce(
      (acc, r) => ({
        impresionYd: F4(acc.impresionYd + r.impresionYd),
        enguiamientoYd: F4(acc.enguiamientoYd + r.enguiamientoYd),
        enBlancoYd: F4(acc.enBlancoYd + r.enBlancoYd),
        reposicionYd: F4(acc.reposicionYd + r.reposicionYd),
        totalPapelYd: F4(acc.totalPapelYd + r.totalPapelYd),
        telaYd: F4(acc.telaYd + r.telaYd),
      }),
      {
        impresionYd: 0,
        enguiamientoYd: 0,
        enBlancoYd: 0,
        reposicionYd: 0,
        totalPapelYd: 0,
        telaYd: 0,
      },
    );

    // ── Detalle ─────────────────────────────────────────────────────────
    const detalleImpresion = consumos
      .filter((c) => c.origen !== 'REPOSICION')
      .map((c) => ({
        fecha: c.fecha,
        orden: c.ordenProduccion.codigo,
        codigoLine: c.lineaProduccion?.codigoLine ?? null,
        // La fila del papel en blanco no tiene producto: se identifica con su
        // propia descripción, que es lo único que la distingue en el detalle.
        producto:
          c.origen === 'EN_BLANCO'
            ? ETIQUETA_EN_BLANCO
            : (c.producto?.codigo ?? null),
        talla: c.talla?.nombre ?? null,
        cantidad: c.cantidad,
        impresora: c.impresora.codigo,
        tipoPapel: c.tipoPapel.nombre,
        // El detalle ya NO tiene columna "En blanco": el monto va en Consumo.
        // Sumar los dos campos da lo correcto sin ningún `if`, porque son
        // excluyentes — una fila PRODUCCION trae `enBlancoYd` en 0 y una
        // EN_BLANCO trae `consumoYd` en 0.
        consumoYd: F4(Number(c.consumoYd) + Number(c.enBlancoYd)),
        enguiamientoYd: Number(c.enguiamientoYd),
        totalYd: F4(
          Number(c.consumoYd) + Number(c.enguiamientoYd) + Number(c.enBlancoYd),
        ),
      }));

    const detalleReposiciones = reposiciones.map((rp) => ({
      fecha: rp.fecha,
      orden: rp.ordenProduccion.codigo,
      codigoRepo: rp.codigoRepo,
      departamento: rp.departamento.nombre,
      defecto: rp.defecto.nombre,
      impresora: rp.impresora?.codigo ?? null,
      tipoPapel: rp.tipoPapel?.nombre ?? null,
      yardasPapel: Number(rp.yardasPapel),
      tela: rp.insumoTela?.descripcion ?? null,
      yardasTela: Number(rp.yardasTela),
    }));

    return {
      // Las opciones de los filtros las devuelve ESTE endpoint, no los
      // catálogos de otros módulos. Verificado que hacía falta: de los 5 roles
      // que tienen `costeo.dashboard.ver`, ANALISTA_COSTOS no tiene
      // `costeo.rollo.ver` (no podría leer /costeo/rollos/impresoras) y
      // GERENCIA_COSTEO no tiene `costeo.orden.importar` (no podría leer
      // /costeo/ordenes/clientes). Armar los selectores con esos endpoints le
      // habría dado un 403 y un filtro vacío a dos de los cinco.
      //
      // Salen del rango de fechas y ANTES de aplicar los filtros de cliente e
      // impresora, para que elegir uno no borre los demás de la lista.
      opciones,
      // Se devuelven los días pedidos como texto y no los instantes: un
      // `Date` obliga al frontend a re-derivar el día calendario, que es de
      // donde salía el corrimiento de un día al mostrarlos.
      filtros: {
        desde: f.desdeTexto,
        hasta: f.hastaTexto,
        idCliente: f.idCliente ?? null,
        idImpresora: f.idImpresora ?? null,
      },
      resumen,
      totales,
      detalleImpresion,
      detalleReposiciones,
    };
  }

  /** El mismo consolidado, como .xlsx con tres hojas. */
  async consumoPorOrdenExcel(idEmpresa: number, f: FiltrosConsumo) {
    const d = await this.consumoPorOrden(idEmpresa, f);
    const wb = new ExcelJS.Workbook();
    const negrita = { font: { bold: true } } as const;
    const fecha = (x: Date) =>
      x.toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' });

    const resumen = wb.addWorksheet('Resumen');
    resumen.addRow(['Consumo por orden de producción']).font = {
      bold: true,
      size: 14,
    };
    resumen.addRow([
      `Del ${diaLegible(f.desdeTexto)} al ${diaLegible(f.hastaTexto)}`,
    ]);
    resumen.addRow([]);
    const encR = resumen.addRow([
      'OP',
      'Cliente',
      'Impresión (yd)',
      'Enguiamiento (yd)',
      'En blanco (yd)',
      'Reposiciones (yd)',
      'Total papel (yd)',
      'Tela (yd)',
    ]);
    encR.eachCell((c) => Object.assign(c, negrita));
    for (const r of d.resumen)
      resumen.addRow([
        r.codigo,
        r.cliente ?? '',
        r.impresionYd,
        r.enguiamientoYd,
        r.enBlancoYd,
        r.reposicionYd,
        r.totalPapelYd,
        r.telaYd,
      ]);
    const totalRow = resumen.addRow([
      'TOTAL',
      '',
      d.totales.impresionYd,
      d.totales.enguiamientoYd,
      d.totales.enBlancoYd,
      d.totales.reposicionYd,
      d.totales.totalPapelYd,
      d.totales.telaYd,
    ]);
    totalRow.eachCell((c) => Object.assign(c, negrita));
    resumen.columns.forEach((c, i) => (c.width = i < 2 ? 22 : 16));

    // Hoja consolidada: TODO el consumo en una sola lista, una fila por
    // registro. Existe porque las dos hojas de detalle tienen columnas
    // distintas (una habla de LINE/Producto/Talla y la otra de No.
    // repo/Departamento/Defecto), así que juntarlas exigía copiar y pegar a
    // mano cada vez.
    //
    // Cada concepto va en SU columna y vacía donde no aplica, en vez de
    // mezclar "LINE / No. repo" en una sola: una columna con dos significados
    // no se puede agrupar ni filtrar.
    //
    // ⚠️ Sin fila TOTAL a propósito. Esta hoja está pensada como fuente de
    // tablas dinámicas y filtros, y una fila de totales dentro del rango se
    // cuela en cualquier agregación. El total ya vive en "Resumen".
    const cons = wb.addWorksheet('Consolidado');
    const encC = cons.addRow([
      'Fecha',
      'Tipo',
      'OP',
      'Cliente',
      'LINE',
      'Producto',
      'Talla',
      'Cantidad',
      'No. repo',
      'Departamento',
      'Defecto',
      'Impresora',
      'Tipo de papel',
      'Papel (yd)',
      'Enguiamiento (yd)',
      'Total papel (yd)',
      'Tela',
      'Tela (yd)',
    ]);
    encC.eachCell((c) => Object.assign(c, negrita));

    // El cliente vive en el resumen (es de la orden, no de cada fila), así que
    // se resuelve por código de OP en vez de repetir la consulta.
    const clientePorOp = new Map(
      d.resumen.map((r) => [r.codigo, r.cliente ?? '']),
    );

    type FilaConsolidada = { fecha: Date; celdas: (string | number)[] };
    const filas: FilaConsolidada[] = [];

    for (const x of d.detalleImpresion)
      filas.push({
        fecha: x.fecha,
        celdas: [
          fecha(x.fecha),
          // Las filas de papel en blanco ya viajan dentro del detalle de
          // impresión rotuladas con esta etiqueta (F5-1B), así que el tipo se
          // deriva de ahí y no hace falta consultarlas aparte.
          x.producto === ETIQUETA_EN_BLANCO ? 'En blanco' : 'Impresión',
          x.orden,
          clientePorOp.get(x.orden) ?? '',
          x.codigoLine ?? '',
          x.producto ?? '',
          x.talla ?? '',
          x.cantidad ?? '',
          '',
          '',
          '',
          x.impresora,
          x.tipoPapel,
          x.consumoYd,
          x.enguiamientoYd,
          x.totalYd,
          '',
          '',
        ],
      });

    for (const x of d.detalleReposiciones)
      filas.push({
        fecha: x.fecha,
        celdas: [
          fecha(x.fecha),
          'Reposición',
          x.orden,
          clientePorOp.get(x.orden) ?? '',
          '',
          '',
          '',
          '',
          x.codigoRepo ?? '',
          x.departamento,
          x.defecto,
          x.impresora ?? '',
          x.tipoPapel ?? '',
          x.yardasPapel,
          0,
          x.yardasPapel,
          x.tela ?? '',
          // La tela va en su columna y NO suma al papel: es otro material y no
          // sale del rollo. Sumarla daría un número sin significado físico.
          x.yardasTela,
        ],
      });

    // Ordenadas por fecha para que la hoja se lea como una línea de tiempo:
    // mezcladas por tipo es justamente lo que se quiere poder agrupar después.
    filas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    for (const f2 of filas) cons.addRow(f2.celdas);
    cons.columns.forEach((c, i) => (c.width = i === 5 || i === 10 ? 24 : 14));
    // Fila de encabezado congelada: con cientos de filas, perder de vista los
    // nombres de columna al bajar vuelve la hoja ilegible.
    cons.views = [{ state: 'frozen', ySplit: 1 }];
    // Autofiltro sobre el rango real, que es lo que hace usable la hoja sin
    // tener que seleccionarla a mano cada vez.
    cons.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 18 },
    };

    const imp = wb.addWorksheet('Detalle impresión');
    const encI = imp.addRow([
      'Fecha',
      'OP',
      'LINE',
      'Producto',
      'Talla',
      'Cantidad',
      'Impresora',
      'Tipo de papel',
      'Consumo (yd)',
      'Enguiamiento (yd)',
      'Total (yd)',
    ]);
    encI.eachCell((c) => Object.assign(c, negrita));
    for (const x of d.detalleImpresion)
      imp.addRow([
        fecha(x.fecha),
        x.orden,
        x.codigoLine ?? '',
        x.producto ?? '',
        x.talla ?? '',
        x.cantidad ?? '',
        x.impresora,
        x.tipoPapel,
        x.consumoYd,
        x.enguiamientoYd,
        x.totalYd,
      ]);
    imp.columns.forEach((c, i) => (c.width = i === 3 ? 20 : 14));

    const rep = wb.addWorksheet('Detalle reposiciones');
    const encRep = rep.addRow([
      'Fecha',
      'OP',
      'No. repo',
      'Departamento',
      'Defecto',
      'Impresora',
      'Tipo de papel',
      'Yardas papel',
      'Tela',
      'Yardas tela',
    ]);
    encRep.eachCell((c) => Object.assign(c, negrita));
    for (const x of d.detalleReposiciones)
      rep.addRow([
        fecha(x.fecha),
        x.orden,
        x.codigoRepo ?? '',
        x.departamento,
        x.defecto,
        x.impresora ?? '',
        x.tipoPapel ?? '',
        x.yardasPapel,
        x.tela ?? '',
        x.yardasTela,
      ]);
    rep.columns.forEach((c, i) => (c.width = i === 4 || i === 8 ? 26 : 14));

    return wb.xlsx.writeBuffer();
  }
}
