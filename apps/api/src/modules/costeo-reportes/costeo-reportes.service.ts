import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';

export interface FiltrosConsumo {
  /**
   * Inicio del día `desdeTexto` en Guatemala. Inclusivo. `undefined` cuando
   * hay algún filtro de OF/factura y no se pidió rango de fecha de impresión
   * — costear una OF completa exige TODO su consumo, aunque se haya impreso
   * meses antes.
   */
  desde?: Date;
  /**
   * Inicio del día SIGUIENTE a `hastaTexto` en Guatemala. **Exclusivo** — se
   * compara con `lt`, no con `lte`, para abarcar el último día entero. Lo
   * arma el controlador; ver el comentario de `filtros()` allá.
   */
  hastaExclusivo?: Date;
  /** Los días calendario tal como se pidieron (`yyyy-mm-dd`), para mostrarlos. */
  desdeTexto?: string;
  hastaTexto?: string;
  idCliente?: number;
  idImpresora?: number;
  /**
   * Marca/division del cliente. Filtra por el SUBCLIENTE DEL PRODUCTO, no
   * por el de la orden: el dato vive en el producto porque 38 ordenes
   * mezclan prendas de subcliente con prendas directas del mismo cliente.
   */
  idSubcliente?: number;
  /** Códigos completos de OF (`26OF000159`). */
  ofs?: string[];
  /** Rango de código de OF — comparación de STRING, válida porque el código
   * es ancho fijo (`lpad`) y ordena igual que el número. */
  ofDesde?: string;
  ofHasta?: string;
  numeroFactura?: string;
  /** `date` de la OF (sin hora ni zona) — ver nota de `fechaOfQuery` en el controlador. */
  fechaOfDesde?: Date;
  fechaOfHasta?: Date;
  fechaFacturaDesde?: Date;
  fechaFacturaHasta?: Date;
}

/** `2026-09-30` -> `30/09/2026`, sin pasar por `Date` ni por zonas horarias. */
const diaLegible = (dia: string) => dia.split('-').reverse().join('/');

/**
 * Un valor de columna `date` (sin hora ni zona) a `yyyy-mm-dd`. Postgres
 * guarda solo el día calendario, así que Prisma lo trae como un `Date` a
 * medianoche UTC de ESE día — `toISOString()` recupera el mismo día sin
 * ningún desfase, a diferencia de un `timestamptz` (ver `dia-guatemala.ts`).
 */
const diaISO = (d: Date) => d.toISOString().slice(0, 10);

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
  /** La OF vigente de esta OP, si tiene una asignada. null = sin asignar. */
  of: string | null;
  fechaOf: string | null;
  numeroFactura: string | null;
  fechaFactura: string | null;
}

/** Fila agregada de la tabla "Resumen por OF". */
export interface ResumenPorOf {
  of: string;
  fechaOf: string | null;
  cliente: string | null;
  numeroFactura: string | null;
  fechaFactura: string | null;
  cantidadOps: number;
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

/** `61601403 × 12 UNIDAD · 6120100 × 500 YARDAS`, para una sola celda. */
export function resumirMateriales(
  materiales: { codigo: string; cantidad: number; unidad: string }[],
): string {
  return materiales
    .map((m) => `${m.codigo} × ${m.cantidad} ${m.unidad}`)
    .join(' · ');
}

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
  /**
   * Separa las ordenes que tocan un subcliente en dos grupos: las que son
   * 100% suyas (atribucion inequivoca) y las que lo mezclan con prendas
   * directas del mismo cliente. Solo hace falta porque una reposicion no
   * registra de que prenda fue; para los consumos el producto lo dice.
   */
  private async ordenesDeUnSoloSubcliente(
    idEmpresa: number,
    idSubcliente: number,
  ) {
    const lineas = await this.prisma.lineaProduccion.findMany({
      where: { idEmpresa },
      select: {
        idOrdenProduccion: true,
        producto: { select: { idSubcliente: true } },
      },
    });
    const total = new Map<number, number>();
    const propias = new Map<number, number>();
    for (const l of lineas) {
      total.set(l.idOrdenProduccion, (total.get(l.idOrdenProduccion) ?? 0) + 1);
      if (l.producto?.idSubcliente === idSubcliente)
        propias.set(
          l.idOrdenProduccion,
          (propias.get(l.idOrdenProduccion) ?? 0) + 1,
        );
    }
    const inequivocas: number[] = [];
    const mezcladas: number[] = [];
    for (const [op, n] of propias)
      (n === total.get(op) ? inequivocas : mezcladas).push(op);
    return { inequivocas, mezcladas };
  }

  /**
   * Reposiciones que tocan el subcliente pedido pero caen en ordenes que lo
   * mezclan con prendas directas, asi que no se les puede asignar. Devuelve
   * null cuando no hay filtro de subcliente: no hay nada que advertir.
   */
  private async reposicionesAmbiguas(
    ops: { mezcladas: number[] } | null,
    rangoFecha: { gte: Date; lt: Date } | undefined,
    idImpresora?: number,
  ) {
    if (!ops || ops.mezcladas.length === 0) return null;
    const filas = await this.prisma.reposicion.findMany({
      where: {
        anuladoEn: null,
        fecha: rangoFecha,
        idOrdenProduccion: { in: ops.mezcladas },
        ...(idImpresora ? { idImpresora } : {}),
      },
      select: { yardasPapel: true, yardasTela: true },
    });
    if (filas.length === 0) return null;
    return {
      cantidad: filas.length,
      papelYd: F4(filas.reduce((a, r) => a + Number(r.yardasPapel), 0)),
      telaYd: F4(filas.reduce((a, r) => a + Number(r.yardasTela), 0)),
    };
  }

  async consumoPorOrden(idEmpresa: number, f: FiltrosConsumo) {
    // `lt` y no `lte`: el límite superior es el arranque del día siguiente.
    // `undefined` cuando se filtra solo por OF/factura sin rango de fecha de
    // impresión — Prisma OMITE el filtro entero cuando el valor es
    // `undefined`, así que esto alcanza para "sin límite de fecha".
    const rangoFecha =
      f.desde && f.hastaExclusivo
        ? { gte: f.desde, lt: f.hastaExclusivo }
        : undefined;

    // ── Filtro por OF/factura: resuelve a un conjunto de OP ────────────
    // Se resuelve ANTES y se agrega como `idOrdenProduccion: { in: [...] }`
    // a `ordenDeLaEmpresa`, que ya filtran consumos y reposiciones. Si no se
    // pidió ningún filtro de OF, esto no toca nada (undefined = sin filtro).
    const hayFiltroOf = !!(
      f.ofs?.length ||
      f.ofDesde ||
      f.ofHasta ||
      f.numeroFactura ||
      f.fechaOfDesde ||
      f.fechaOfHasta ||
      f.fechaFacturaDesde ||
      f.fechaFacturaHasta
    );
    let opsDeLaOf: number[] | undefined;
    if (hayFiltroOf) {
      const asignaciones = await this.prisma.ofOp.findMany({
        where: {
          idEmpresa,
          anuladoEn: null,
          ordenFacturacion: {
            idEmpresa,
            ...(f.ofs?.length ? { codigo: { in: f.ofs } } : {}),
            ...(f.ofDesde || f.ofHasta
              ? {
                  codigo: {
                    ...(f.ofs?.length ? { in: f.ofs } : {}),
                    ...(f.ofDesde ? { gte: f.ofDesde } : {}),
                    ...(f.ofHasta ? { lte: f.ofHasta } : {}),
                  },
                }
              : {}),
            ...(f.numeroFactura
              ? {
                  numeroFactura: {
                    contains: f.numeroFactura,
                    mode: 'insensitive',
                  },
                }
              : {}),
            ...(f.fechaOfDesde || f.fechaOfHasta
              ? {
                  fecha: {
                    ...(f.fechaOfDesde ? { gte: f.fechaOfDesde } : {}),
                    ...(f.fechaOfHasta ? { lte: f.fechaOfHasta } : {}),
                  },
                }
              : {}),
            ...(f.fechaFacturaDesde || f.fechaFacturaHasta
              ? {
                  fechaFactura: {
                    ...(f.fechaFacturaDesde
                      ? { gte: f.fechaFacturaDesde }
                      : {}),
                    ...(f.fechaFacturaHasta
                      ? { lte: f.fechaFacturaHasta }
                      : {}),
                  },
                }
              : {}),
          },
        },
        select: { idOrdenProduccion: true },
      });
      // [] y no "sin filtro" cuando no hay coincidencias: si se dejara sin
      // filtro, un código de OF que no existe traería TODO el consumo de la
      // empresa en vez de nada — el resultado correcto para "esa OF no tiene
      // nada" es una lista vacía.
      opsDeLaOf = [...new Set(asignaciones.map((a) => a.idOrdenProduccion))];
    }

    const ordenDeLaEmpresa = {
      idEmpresa,
      ...(f.idCliente ? { idCliente: f.idCliente } : {}),
      ...(opsDeLaOf ? { idOrdenProduccion: { in: opsDeLaOf } } : {}),
    };

    // ATENCION: una reposicion se vincula a la ORDEN, nunca a una linea ni a
    // un producto (verificado contra costeo.prisma), asi que no se le puede
    // atribuir un subcliente por el mismo camino que a un consumo. Se
    // incluyen solo las de ordenes donde TODAS las lineas son de ese
    // subcliente, que es donde la atribucion es inequivoca; las de ordenes
    // mezcladas quedan fuera y se informan aparte, en vez de atribuirlas de
    // mas en silencio.
    const opsDelSubcliente = f.idSubcliente
      ? await this.ordenesDeUnSoloSubcliente(idEmpresa, f.idSubcliente)
      : null;

    const [consumos, reposiciones] = await Promise.all([
      this.prisma.consumoPapel.findMany({
        where: {
          anuladoEn: null,
          fecha: rangoFecha,
          ordenProduccion: ordenDeLaEmpresa,
          ...(f.idImpresora ? { idImpresora: f.idImpresora } : {}),
          ...(f.idSubcliente
            ? { producto: { idSubcliente: f.idSubcliente } }
            : {}),
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
          producto: {
            select: {
              codigo: true,
              subcliente: { select: { nombre: true } },
            },
          },
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
          ...(opsDelSubcliente
            ? { idOrdenProduccion: { in: opsDelSubcliente.inequivocas } }
            : {}),
        },
        include: {
          ordenProduccion: { select: { codigo: true } },
          departamento: { select: { nombre: true } },
          defecto: { select: { nombre: true } },
          impresora: { select: { codigo: true } },
          tipoPapel: { select: { nombre: true } },
          insumoTela: { select: { codigo: true, descripcion: true } },
          // Una reposicion de MATERIALES no lleva papel ni tela: lo que
          // entrego son estas lineas. Sin ellas su fila del detalle sale
          // practicamente vacia y lo requisado no aparece en ningun lado.
          reposicionInsumos: {
            include: {
              insumo: {
                select: {
                  codigo: true,
                  descripcion: true,
                  unidad: { select: { nombre: true } },
                },
              },
            },
            orderBy: { idReposicionInsumo: 'asc' },
          },
        },
        orderBy: [{ fecha: 'asc' }, { idReposicion: 'asc' }],
      }),
    ]);

    // ── Opciones de filtro, del rango completo ──────────────────────
    const [ordenesDelRango, impresorasDelRango, subclientesDelRango] =
      await Promise.all([
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
          select: {
            idImpresora: true,
            impresora: { select: { codigo: true } },
          },
          distinct: ['idImpresora'],
        }),
        // Igual que clientes e impresoras: salen del rango y ANTES de
        // aplicar los filtros, para que elegir uno no borre los demas.
        this.prisma.producto.findMany({
          where: {
            idSubcliente: { not: null },
            consumosPapelCosteo: {
              some: {
                anuladoEn: null,
                fecha: rangoFecha,
                ordenProduccion: { idEmpresa },
              },
            },
          },
          select: {
            idSubcliente: true,
            subcliente: { select: { nombre: true } },
          },
          distinct: ['idSubcliente'],
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
      subclientes: subclientesDelRango
        .map((p) => ({
          idSubcliente: p.idSubcliente!,
          nombre: p.subcliente?.nombre ?? '',
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };

    // ── Resumen por OP ──────────────────────────────────────────────────
    const porOrden = new Map<string, ResumenOrden>();
    const vacia = (codigo: string, cliente: string | null): ResumenOrden => ({
      codigo,
      cliente,
      of: null,
      fechaOf: null,
      numeroFactura: null,
      fechaFactura: null,
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
      // El papel de las reposiciones NO se cuenta acá: se cuenta abajo, desde
      // la reposición misma. Ver la nota del bucle siguiente.
      if (c.origen === 'REPOSICION') continue;
      r.impresionYd += Number(c.consumoYd);
      r.enguiamientoYd += Number(c.enguiamientoYd);
      r.enBlancoYd += Number(c.enBlancoYd);
    }
    /**
     * Las yardas de la reposición —papel y tela— salen de `costeo.reposicion`,
     * que es la misma fuente del detalle de abajo.
     *
     * ⚠️ El papel se contaba antes desde `consumo_papel`, y eso hacía que el
     * reporte **se contradijera consigo mismo**: `crear()` solo escribe esa fila
     * cuando la reposición resolvió un rollo (`idMontajeRollo != null`), así que
     * las que no lo resolvieron aparecían en el detalle con sus yardas pero
     * sumaban 0 en el resumen. Con el histórico migrado —que entra sin montaje a
     * propósito— el resumen mostraba **0.0000 yd contra 3,900.82 del detalle**,
     * en 3,612 registros. La tela nunca tuvo el problema porque siempre se leyó
     * de acá, y es justamente lo que delató la asimetría: dos columnas de la
     * misma fila leyendo de fuentes distintas.
     */
    for (const rp of reposiciones) {
      const cod = rp.ordenProduccion.codigo;
      if (!porOrden.has(cod)) porOrden.set(cod, vacia(cod, null));
      const r = porOrden.get(cod)!;
      r.reposicionYd += Number(rp.yardasPapel);
      r.telaYd += Number(rp.yardasTela);
    }

    // La OF vigente de cada OP, resuelta EN LOTE (no una consulta por fila
    // del resumen) — mismo criterio que `nombresDeUsuarios` en otros módulos.
    const ofPorCodigoOp = new Map<
      string,
      {
        codigo: string;
        fecha: Date;
        numeroFactura: string | null;
        fechaFactura: Date | null;
      }
    >();
    if (porOrden.size > 0) {
      const asignaciones = await this.prisma.ofOp.findMany({
        where: {
          idEmpresa,
          anuladoEn: null,
          ordenProduccion: { codigo: { in: [...porOrden.keys()] } },
        },
        select: {
          ordenProduccion: { select: { codigo: true } },
          ordenFacturacion: {
            select: {
              codigo: true,
              fecha: true,
              numeroFactura: true,
              fechaFactura: true,
            },
          },
        },
      });
      for (const a of asignaciones)
        ofPorCodigoOp.set(a.ordenProduccion.codigo, a.ordenFacturacion);
    }

    const resumen = [...porOrden.values()]
      .map((r) => {
        const of = ofPorCodigoOp.get(r.codigo);
        return {
          ...r,
          of: of?.codigo ?? null,
          fechaOf: of ? diaISO(of.fecha) : null,
          numeroFactura: of?.numeroFactura ?? null,
          fechaFactura: of?.fechaFactura ? diaISO(of.fechaFactura) : null,
          impresionYd: F4(r.impresionYd),
          enguiamientoYd: F4(r.enguiamientoYd),
          enBlancoYd: F4(r.enBlancoYd),
          reposicionYd: F4(r.reposicionYd),
          totalPapelYd: F4(
            r.impresionYd + r.enguiamientoYd + r.enBlancoYd + r.reposicionYd,
          ),
          telaYd: F4(r.telaYd),
        };
      })
      .sort((a, b) => b.codigo.localeCompare(a.codigo));

    // ── Resumen por OF ───────────────────────────────────────────────────
    // Agrupa las filas del resumen (ya calculadas) por su OF vigente. "Sin
    // OF" junta las que todavía no tienen una asignada — no se descartan.
    const SIN_OF = 'Sin OF asignada';
    const porOf = new Map<string, ResumenPorOf>();
    for (const r of resumen) {
      const clave = r.of ?? SIN_OF;
      const existente = porOf.get(clave);
      if (existente) {
        existente.cantidadOps += 1;
        existente.totalPapelYd = F4(existente.totalPapelYd + r.totalPapelYd);
        existente.telaYd = F4(existente.telaYd + r.telaYd);
      } else {
        porOf.set(clave, {
          of: clave,
          fechaOf: r.fechaOf,
          cliente: r.cliente,
          numeroFactura: r.numeroFactura,
          fechaFactura: r.fechaFactura,
          cantidadOps: 1,
          totalPapelYd: r.totalPapelYd,
          telaYd: r.telaYd,
        });
      }
    }
    const resumenPorOf = [...porOf.values()].sort((a, b) =>
      a.of === SIN_OF ? 1 : b.of === SIN_OF ? -1 : b.of.localeCompare(a.of),
    );

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
        // Inequivoco a este nivel: la fila ES de un producto. En el
        // resumen no va, porque una OP puede mezclar subclientes.
        subcliente: c.producto?.subcliente?.nombre ?? null,
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
      tipo: rp.tipo,
      departamento: rp.departamento.nombre,
      defecto: rp.defecto.nombre,
      impresora: rp.impresora?.codigo ?? null,
      tipoPapel: rp.tipoPapel?.nombre ?? null,
      yardasPapel: Number(rp.yardasPapel),
      tela: rp.insumoTela?.descripcion ?? null,
      yardasTela: Number(rp.yardasTela),
      /**
       * Los materiales requisados, cada uno en la unidad de su catalogo.
       *
       * ⚠️ NO entran en ningun total de yardas del reporte, y no es un olvido:
       * no salen del rollo y mezclan unidades (de los 443 materiales, 248
       * estan en UNIDAD y 195 en YARDAS), asi que sumarlos daria un numero sin
       * significado fisico. Lo que hace falta para costearlos es el precio del
       * insumo, que es trabajo de F5.
       */
      materiales: rp.reposicionInsumos.map((m) => ({
        codigo: m.insumo.codigo,
        descripcion: m.insumo.descripcion,
        unidad: m.insumo.unidad.nombre,
        cantidad: Number(m.cantidad),
      })),
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
        desde: f.desdeTexto ?? null,
        hasta: f.hastaTexto ?? null,
        idCliente: f.idCliente ?? null,
        idImpresora: f.idImpresora ?? null,
        idSubcliente: f.idSubcliente ?? null,
        ofs: f.ofs ?? null,
        numeroFactura: f.numeroFactura ?? null,
      },
      // Lo que el filtro de subcliente NO pudo atribuir. Se informa en vez
      // de callarlo: con el filtro puesto, el total de reposiciones queda
      // corto en exactamente esto, y sin el numero pareceria completo.
      reposicionesNoAtribuibles: await this.reposicionesAmbiguas(
        opsDelSubcliente,
        rangoFecha,
        f.idImpresora,
      ),
      resumen,
      resumenPorOf,
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
      f.desdeTexto && f.hastaTexto
        ? `Del ${diaLegible(f.desdeTexto)} al ${diaLegible(f.hastaTexto)}`
        : `Filtrado por OF${f.ofs?.length ? `: ${f.ofs.join(', ')}` : ''} — sin límite de fecha de impresión`,
    ]);
    resumen.addRow([]);
    const encR = resumen.addRow([
      'OP',
      'Cliente',
      'OF',
      'Factura',
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
        r.of ?? '',
        r.numeroFactura ?? '',
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
      '',
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

    // Hoja "Resumen por OF": las mismas filas de arriba, agrupadas. "Sin OF
    // asignada" junta las OP que todavía no se cargaron a ninguna OF.
    const porOfWs = wb.addWorksheet('Resumen por OF');
    porOfWs.addRow(['Resumen por Orden de Facturación']).font = {
      bold: true,
      size: 14,
    };
    porOfWs.addRow([]);
    const encOf = porOfWs.addRow([
      'OF',
      'Fecha OF',
      'Cliente',
      'Factura',
      'Fecha factura',
      'OP',
      'Total papel (yd)',
      'Tela (yd)',
    ]);
    encOf.eachCell((c) => Object.assign(c, negrita));
    for (const r of d.resumenPorOf)
      porOfWs.addRow([
        r.of,
        r.fechaOf ? diaLegible(r.fechaOf) : '',
        r.cliente ?? '',
        r.numeroFactura ?? '',
        r.fechaFactura ? diaLegible(r.fechaFactura) : '',
        r.cantidadOps,
        r.totalPapelYd,
        r.telaYd,
      ]);
    porOfWs.columns.forEach((c, i) => (c.width = i < 3 ? 20 : 14));

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
      'Subcliente',
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
      // El material va en SUS columnas y nunca en las de papel o tela: es otro
      // material, con su propia unidad, y meterlo en una columna de yardas
      // corromperia cualquier tabla dinamica que sume papel.
      'Material',
      'Cantidad material',
      'Unidad',
      // Al final, para no correr ninguna columna de un archivo ya armado con
      // la hoja anterior (misma regla que ya se aplicó con "En blanco" en la
      // plantilla de Órdenes).
      'OF',
      'Factura',
    ]);
    encC.eachCell((c) => Object.assign(c, negrita));

    // El cliente, la OF y la factura viven en el resumen (son de la orden, no
    // de cada fila), así que se resuelven por código de OP en vez de repetir
    // la consulta.
    const clientePorOp = new Map(
      d.resumen.map((r) => [r.codigo, r.cliente ?? '']),
    );
    const ofPorOp = new Map(d.resumen.map((r) => [r.codigo, r.of ?? '']));
    const facturaPorOp = new Map(
      d.resumen.map((r) => [r.codigo, r.numeroFactura ?? '']),
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
          x.subcliente ?? '',
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
          '', // Tela
          '', // Tela (yd)
          // ⚠️ Faltaban estos 3 vacíos (Material, Cantidad material, Unidad):
          // sin ellos, OF y Factura caían exactamente en esas dos primeras
          // columnas en vez de en las suyas — bug real que el usuario
          // encontró probando (una fila de Impresión mostraba el código de
          // OF en "Material" y el número de factura en "Cantidad material").
          // Antes no hacía falta: sin columnas después de "Tela (yd)", un
          // array más corto simplemente dejaba el resto en blanco.
          '', // Material
          '', // Cantidad material
          '', // Unidad
          ofPorOp.get(x.orden) ?? '',
          facturaPorOp.get(x.orden) ?? '',
        ],
      });

    for (const x of d.detalleReposiciones) {
      // ⚠️ Los cinco vacíos son LINE, Producto, Subcliente, Talla y Cantidad.
      // Faltaba el último, así que desde "Cantidad" en adelante TODA fila de
      // reposición salía corrida una columna: el número de repo caía bajo
      // "Cantidad", las yardas de papel bajo "Tipo de papel" y la descripción
      // de la tela bajo "Total papel (yd)". Medido sobre el libro real: 3,623
      // filas mal rotuladas, y cualquier tabla dinámica sumaba 0 de papel.
      const comunes = [
        fecha(x.fecha),
        x.tipo === 'MATERIALES' ? 'Materiales' : 'Reposición',
        x.orden,
        clientePorOp.get(x.orden) ?? '',
        '',
        '',
        '',
        '',
        '',
        x.codigoRepo ?? '',
        x.departamento,
        x.defecto,
      ];
      if (x.tipo === 'MATERIALES') {
        // Una fila por material: es lo que permite agrupar por insumo. Las
        // columnas de papel y tela quedan vacías, no en 0 — un 0 se lee como
        // "se entregaron cero yardas" y acá no se entregó papel en absoluto.
        for (const m of x.materiales)
          filas.push({
            fecha: x.fecha,
            celdas: [
              ...comunes,
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              `${m.codigo} ${m.descripcion}`,
              m.cantidad,
              m.unidad,
              ofPorOp.get(x.orden) ?? '',
              facturaPorOp.get(x.orden) ?? '',
            ],
          });
        continue;
      }
      filas.push({
        fecha: x.fecha,
        celdas: [
          ...comunes,
          x.impresora ?? '',
          x.tipoPapel ?? '',
          x.yardasPapel,
          0,
          x.yardasPapel,
          x.tela ?? '',
          // La tela va en su columna y NO suma al papel: es otro material y no
          // sale del rollo. Sumarla daría un número sin significado físico.
          x.yardasTela,
          '',
          '',
          '',
          ofPorOp.get(x.orden) ?? '',
          facturaPorOp.get(x.orden) ?? '',
        ],
      });
    }

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
    // Hasta la última columna de verdad: estaba fijo en 18 cuando ya eran 19,
    // así que "Tela (yd)" quedaba fuera del filtro.
    cons.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: encC.cellCount },
    };

    const imp = wb.addWorksheet('Detalle impresión');
    const encI = imp.addRow([
      'Fecha',
      'OP',
      'LINE',
      'Producto',
      'Subcliente',
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
        x.subcliente ?? '',
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
      'Tipo',
      'Departamento',
      'Defecto',
      'Impresora',
      'Tipo de papel',
      'Yardas papel',
      'Tela',
      'Yardas tela',
      'Materiales',
    ]);
    encRep.eachCell((c) => Object.assign(c, negrita));
    for (const x of d.detalleReposiciones)
      rep.addRow([
        fecha(x.fecha),
        x.orden,
        x.codigoRepo ?? '',
        x.tipo === 'MATERIALES' ? 'Materiales' : 'Reimpresión',
        x.departamento,
        x.defecto,
        x.impresora ?? '',
        x.tipoPapel ?? '',
        x.yardasPapel,
        x.tela ?? '',
        x.yardasTela,
        // Esta hoja es una fila por reposición, así que los materiales van
        // resumidos en una celda. Uno por fila está en "Consolidado", que es
        // la hoja pensada para agrupar.
        resumirMateriales(x.materiales),
      ]);
    rep.columns.forEach(
      (c, i) => (c.width = i === 5 || i === 9 || i === 11 ? 26 : 14),
    );

    return wb.xlsx.writeBuffer();
  }
}
