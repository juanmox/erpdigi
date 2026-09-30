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
        producto: c.producto?.codigo ?? null,
        talla: c.talla?.nombre ?? null,
        cantidad: c.cantidad,
        impresora: c.impresora.codigo,
        tipoPapel: c.tipoPapel.nombre,
        consumoYd: Number(c.consumoYd),
        enguiamientoYd: Number(c.enguiamientoYd),
        enBlancoYd: Number(c.enBlancoYd),
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
      'En blanco (yd)',
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
        x.enBlancoYd,
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
