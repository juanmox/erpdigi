import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  formatearFechaSheets,
  GoogleSheetsService,
} from '../../common/google-sheets/google-sheets.service';
import { parsearCodigoOp } from '../../common/op-codigo';
import { mensajeOpNoEncontrada } from '../../common/op-otra-empresa';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ETIQUETA_EN_BLANCO } from '../costeo-reportes/costeo-reportes.service';
import { CosteoRollosService } from '../costeo-rollos/costeo-rollos.service';
import { CapturarConsumoDto } from './dto/capturar-consumo.dto';

/**
 * Factor de enguiamiento del legacy (columna K de la hoja "Datos":
 * `cantidad * 0.084375`). Es el DEFAULT: cada línea puede traer el suyo en
 * `factorEnguiamiento`, como pide la corrección #2 de §6.2 — el valor no debe
 * quedar incrustado en el código.
 *
 * Medido contra las 1,128 líneas reales de DataDisev3: el `ENGUIAMIENTO` que
 * Diseño teclea por línea es esta misma fórmula redondeada a un decimal (81.5%
 * techo, 16.5% redondeo, desviación media +0.0209 yd). Por eso se calcula y no
 * se lee: el valor capturado sirve como contraste, no como fuente.
 */
const FACTOR_ENGUIAMIENTO_DEFAULT = 0.084375;

/**
 * Una fila de la hoja "Datos" del libro ConsumosFinal, que alimenta los
 * Dashboards de Data Studio. 15 columnas, una fila POR TALLA — réplica exacta
 * de lo que armaba copiarDatos() en el Código.gs de la Forma 2 legacy.
 */
type FilaDatosSheets = (string | number)[];

export interface TallaCalculada {
  idTalla: number;
  talla: string;
  cantidad: number;
  /** Versión del estándar aplicada; null si no hay ninguna vigente. */
  idConsumoEstandar: number | null;
  yardasEstandar: number | null;
  consumoYd: number | null;
  enguiamientoYd: number;
  /** Ya se envió a producción (índice único parcial de `consumo_papel`). */
  yaEnviada: boolean;
  idConsumoPapel: number | null;
}

/**
 * Ventana para decidir si una impresora "la está usando otro": un TURNO.
 *
 * El usuario pidió que un operario no envíe consumo a la máquina de otro
 * ("regularmente se le asigna a un solo operario de impresión una sola
 * impresora"), eligiendo un tope y no un muro. Esta ventana solo decide cuándo
 * MOSTRAR el aviso, y 8 horas es el turno corriente: un montaje de ayer sin
 * envíos ya no dice quién está en esa máquina hoy.
 *
 * El equilibrio importa en los dos sentidos. Demasiado corta y el aviso calla
 * a mitad de un turno que sí es de otro; demasiado larga y el aviso se vuelve
 * rutina y se confirma sin leerlo, que es el peor resultado posible para un
 * tope. El mensaje siempre lleva el "desde cuándo" exacto, así que la decisión
 * final la toma quien está frente a la máquina, con el dato a la vista.
 */
const VENTANA_OCUPACION_MS = 8 * 60 * 60 * 1000;

/** Quién viene trabajando en una impresora, si no es el que está mirando. */
export interface OcupacionImpresora {
  idUsuario: number;
  usuario: string;
  /** Desde cuándo: su último envío, o el momento en que montó el rollo. */
  desde: Date;
  /**
   * Qué lo delata. Un envío de consumo es la señal fuerte ("está trabajando
   * ahí ahora"); el montaje es la de respaldo, para el operario que recién
   * montó y todavía no envió nada.
   */
  via: 'CONSUMO' | 'MONTAJE';
}

export interface OrdenPendiente {
  idOrdenProduccion: number;
  codigo: string;
  cliente: string | null;
  ordenCompra: string | null;
  fechaCompromiso: Date | null;
  consumoEnBlanco: boolean;
  enBlancoYd: number;
  lineas: number;
  totalPiezas: number;
  /** Lo que se envía al marcar la orden: sus líneas pendientes EN ESA impresora. */
  idsLineaProduccion: number[];
  /**
   * Yardas que esta orden le va a sacar al rollo: estándar + enguiamiento + el
   * papel en blanco que todavía no se cobró. Se calcula en el servidor
   * (convención #1) con el estándar vigente HOY, el mismo que va a usar la
   * captura.
   */
  estimadoYd: number;
  /**
   * El estimado está INCOMPLETO porque faltan estándares. Sin esto el número
   * engañaría al que suma el rollo: una orden a la que le falta el estándar de
   * la mitad de sus tallas mostraría un consumo mucho menor del real. Trae las
   * tallas afectadas, que además son las que impiden enviarla.
   */
  tallasSinEstandar: string[];
  /**
   * Por LÍNEA, para que la pantalla pueda seleccionar algunas y seguir
   * estimando bien. Sin esto, con 6 de 8 ítems marcados el contraste contra el
   * rollo tendría que prorratear, y las líneas no pesan parejo: en una OP real
   * conviven una de 4.13 yd y otra de 38.39.
   *
   * `estimadoYd` acá es estándar + enguiamiento; el papel en blanco NO se
   * prorratea (es por orden) y viaja en `enBlancoPendienteYd`.
   */
  lineasDetalle: {
    idLineaProduccion: number;
    estimadoYd: number;
    /** Le falta el estándar de alguna talla: no se puede enviar ni estimar. */
    bloqueada: boolean;
  }[];
  /**
   * Papel en blanco que esta orden TODAVÍA no cobró. Va aparte del estimado
   * por línea porque es de la orden: se suma una vez si se manda cualquiera de
   * sus líneas, no una vez por línea.
   */
  enBlancoPendienteYd: number;
}

/** El rollo que está montado en una impresora, para el encabezado del grupo. */
export interface RolloDelGrupo {
  idMontajeRollo: number;
  tipoPapel: string;
  codigoRollo: string;
  yardasIniciales: number | null;
  /**
   * Puede ser NEGATIVO y eso NO es un error: significa que el rollo rindió
   * menos de lo que declaraba el fabricante. El usuario lo pidió explícito —
   * "el valor negativo en rojo" — porque es justamente la medición que querían
   * sacar. No se arrastra al rollo siguiente.
   */
  yardasRestantesEstimadas: number | null;
  porcentajeRestante: number | null;
}

export interface GrupoImpresoraPendiente {
  idImpresora: number | null;
  impresora: string;
  ordenes: OrdenPendiente[];
  /** Otro operario viene usando esta impresora; null si está libre o es la propia. */
  ocupadaPor: OcupacionImpresora | null;
  /** El rollo montado ahora, o null si no hay ninguno (no se puede enviar). */
  rollo: RolloDelGrupo | null;
}

@Injectable()
export class CosteoConsumoPapelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly googleSheets: GoogleSheetsService,
    /**
     * Para el estado del rollo del encabezado. Se inyecta el servicio en vez de
     * que la pantalla llame al endpoint `panel()`: ANALISTA_COSTOS ve Impresión
     * de OPs pero no tiene `costeo.rollo.ver`, y recalcular el restante acá
     * sería una segunda fuente de verdad del mismo número.
     */
    private readonly rollos: CosteoRollosService,
  ) {}

  private async resolverOrden(
    codigoOp: string,
    idEmpresa: number,
    idUsuario: number,
  ) {
    const parsed = parsearCodigoOp(codigoOp);
    if (!parsed)
      throw new BadRequestException(
        'Código de OP inválido (formato esperado: 26OP014154)',
      );
    const orden = await this.prisma.ordenProduccion.findUnique({
      where: {
        idEmpresa_anio_correlativo: {
          idEmpresa,
          anio: parsed.anio,
          correlativo: parsed.correlativo,
        },
      },
      include: { cliente: true, lineaProducto: true },
    });
    if (!orden)
      throw new NotFoundException(
        await mensajeOpNoEncontrada(this.prisma, {
          codigo: codigoOp,
          anio: parsed.anio,
          correlativo: parsed.correlativo,
          idUsuario,
          idEmpresaActual: idEmpresa,
        }),
      );
    return orden;
  }

  /**
   * La OP con todo lo que la pantalla necesita para decidir: por cada línea, sus
   * tallas con cantidad, el estándar vigente resuelto y el consumo ya calculado.
   *
   * El cálculo se hace acá y no en el cliente (convención #1). Las tres fórmulas
   * son las del legacy, verificadas contra `Código.gs`:
   *   consumo      = estándar(yardas) * cantidad     (columna M)
   *   enguiamiento = cantidad * factor               (columna K)
   *   en blanco    = cantidad * 0.6, si la línea lo marca   (columna L)
   * Ojo con la última: es sobre la CANTIDAD, no sobre el consumo.
   */
  async obtenerOrden(codigoOp: string, idEmpresa: number, idUsuario: number) {
    const orden = await this.resolverOrden(codigoOp, idEmpresa, idUsuario);

    const lineas = await this.prisma.lineaProduccion.findMany({
      where: { idOrdenProduccion: orden.idOrdenProduccion },
      include: {
        producto: {
          select: {
            idProducto: true,
            codigo: true,
            descripcion: true,
            desarrollo: true,
          },
        },
        impresora: {
          select: { idImpresora: true, codigo: true, descripcion: true },
        },
        tipoPapel: { select: { idTipoPapel: true, nombre: true } },
        tallas: {
          include: { talla: true },
          orderBy: { talla: { orden: 'asc' } },
        },
      },
      orderBy: { codigoLine: 'asc' },
    });

    const hoy = new Date();
    const idsProducto = [...new Set(lineas.map((l) => l.idProducto))];
    const idsTalla = [
      ...new Set(lineas.flatMap((l) => l.tallas.map((t) => t.idTalla))),
    ];

    // Estándar vigente HOY, en una sola consulta para toda la OP.
    const estandares = idsProducto.length
      ? await this.prisma.consumoEstandar.findMany({
          where: {
            idProducto: { in: idsProducto },
            idTalla: { in: idsTalla },
            vigenteDesde: { lte: hoy },
            OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: hoy } }],
          },
          select: {
            idConsumoEstandar: true,
            idProducto: true,
            idTalla: true,
            yardas: true,
          },
        })
      : [];
    const estandarPor = new Map(
      estandares.map((e) => [`${e.idProducto}|${e.idTalla}`, e]),
    );

    // Lo ya enviado, para no ofrecer dos veces la misma línea+talla.
    const yaEnviados = await this.prisma.consumoPapel.findMany({
      where: {
        idOrdenProduccion: orden.idOrdenProduccion,
        origen: 'PRODUCCION',
        anuladoEn: null,
      },
      select: { idConsumoPapel: true, idLineaProduccion: true, idTalla: true },
    });
    const enviadoPor = new Map(
      yaEnviados.map((c) => [
        `${c.idLineaProduccion}|${c.idTalla}`,
        c.idConsumoPapel,
      ]),
    );

    const lineasCalculadas = lineas.map((l) => {
      const factorEng =
        Number(l.factorEnguiamiento ?? 0) || FACTOR_ENGUIAMIENTO_DEFAULT;
      const tallas: TallaCalculada[] = l.tallas.map((t) => {
        const est = estandarPor.get(`${l.idProducto}|${t.idTalla}`);
        const yardas = est ? Number(est.yardas) : null;
        return {
          idTalla: t.idTalla,
          talla: t.talla.nombre,
          cantidad: t.cantidad,
          idConsumoEstandar: est?.idConsumoEstandar ?? null,
          yardasEstandar: yardas,
          consumoYd: yardas === null ? null : +(yardas * t.cantidad).toFixed(4),
          enguiamientoYd: +(t.cantidad * factorEng).toFixed(4),
          yaEnviada: enviadoPor.has(`${l.idLineaProduccion}|${t.idTalla}`),
          idConsumoPapel:
            enviadoPor.get(`${l.idLineaProduccion}|${t.idTalla}`) ?? null,
        };
      });

      const sinEstandar = tallas.filter((t) => t.consumoYd === null);
      const pendientes = tallas.filter((t) => !t.yaEnviada);
      return {
        idLineaProduccion: l.idLineaProduccion,
        codigoLine: l.codigoLine,
        producto: l.producto,
        impresora: l.impresora,
        tipoPapel: l.tipoPapel,
        factorEnguiamiento: factorEng,
        /** El que Diseño tecleó; se usa solo como contraste del calculado. */
        enguiamientoCapturadoYd: Number(l.enguiamientoYd),
        estatus: l.estatus,
        tallas,
        totalPiezas: tallas.reduce((a, t) => a + t.cantidad, 0),
        totalConsumoYd: +tallas
          .reduce((a, t) => a + (t.consumoYd ?? 0), 0)
          .toFixed(4),
        totalEnguiamientoYd: +tallas
          .reduce((a, t) => a + t.enguiamientoYd, 0)
          .toFixed(4),
        // Estados que la pantalla necesita para decidir qué ofrecer.
        completa: pendientes.length === 0,
        sinEstandar: sinEstandar.map((t) => t.talla),
        enviable: pendientes.length > 0 && sinEstandar.length === 0,
      };
    });

    return {
      orden: {
        idOrdenProduccion: orden.idOrdenProduccion,
        codigo: orden.codigo,
        ordenCompra: orden.ordenCompra,
        cliente: orden.cliente,
        lineaProducto: orden.lineaProducto,
        // El papel en blanco se gestiona SOLO desde esta pantalla desde
        // 2026-10-07 (antes el checkbox vivía en Órdenes de Producción). Hace
        // falta acá y no solo en la cola de pendientes: una orden ya impresa
        // por completo desaparece de esa cola, y sin esto no quedaría ninguna
        // forma de corregirle el papel en blanco.
        consumoEnBlanco: orden.consumoEnBlanco,
        enBlancoYd: Number(orden.enBlancoYd),
      },
      lineas: lineasCalculadas,
    };
  }

  /**
   * Trabajo pendiente, opcionalmente filtrado por impresora.
   *
   * Existe porque sin esto había que saber de memoria qué OP existen: la
   * pantalla obligaba a teclear un código a ciegas. El operario piensa desde la
   * máquina que tiene enfrente ("¿qué me toca en la MS 2?"), no desde el número
   * de orden.
   *
   * Devuelve una fila por LÍNEA pendiente, no por OP: una misma orden puede
   * repartirse entre varias impresoras, así que agrupar por OP mostraría trabajo
   * que no es de esa máquina.
   */
  /**
   * El trabajo pendiente, agrupado por IMPRESORA y dentro de ella por ORDEN.
   *
   * La consulta sigue yendo por LÍNEA y no por orden —una misma OP puede
   * repartirse entre dos impresoras, y agrupar por orden mostraría trabajo de
   * otra máquina— pero el resultado se agrupa acá: la pantalla trabaja por
   * orden, así que armar esa jerarquía en el navegador sería repetir en cada
   * cliente una decisión que es del servidor.
   *
   * ⚠️ El tope es por LÍNEA, no por orden. Con ~3.8 líneas por OP, 500 órdenes
   * en una impresora son ~1,900 líneas: un tope de 200 truncaba la mitad de la
   * cola sin ninguna señal. El default alcanza para el volumen que describió el
   * usuario; si se supera, la pantalla lo dice en vez de mentir.
   */
  /**
   * Quién viene usando cada una de estas impresoras, si no es el propio actor.
   *
   * Dos fuentes, en orden de fuerza: el último consumo vigente capturado en esa
   * impresora (alguien está trabajando ahí AHORA) y, si no hay ninguno en la
   * ventana, quién montó el rollo que sigue puesto (recién montó y todavía no
   * envió nada).
   *
   * ⚠️ No se usa la impresora "asignada" a un operario, porque no existe tal
   * cosa en el modelo: la asignación es una costumbre de planta, no un dato. Lo
   * que sí hay es actividad real, que además refleja los cambios de turno solos.
   *
   * Dos consultas con DISTINCT ON en vez de una por impresora: son hasta 14
   * máquinas y esto corre en cada carga de la pantalla.
   */
  private async ocupacionDeImpresoras(
    idsImpresora: number[],
    idUsuarioActor: number,
  ): Promise<Map<number, OcupacionImpresora>> {
    const ids = [...new Set(idsImpresora)].filter((x) => x != null);
    if (ids.length === 0) return new Map();
    const desde = new Date(Date.now() - VENTANA_OCUPACION_MS);

    const ultimosConsumos = await this.prisma.$queryRaw<
      { id_impresora: number; creado_por: number; creado_en: Date }[]
    >`
      SELECT DISTINCT ON (id_impresora) id_impresora, creado_por, creado_en
      FROM costeo.consumo_papel
      WHERE id_impresora = ANY(${ids}::int[])
        AND anulado_en IS NULL
        AND creado_en >= ${desde}::timestamptz
      ORDER BY id_impresora, creado_en DESC
    `;

    const montajes = await this.prisma.montajeRollo.findMany({
      where: {
        idImpresora: { in: ids },
        desmontadoEn: null,
        montadoEn: { gte: desde },
      },
      select: { idImpresora: true, creadoPor: true, montadoEn: true },
    });

    // El consumo pisa al montaje: si las dos fuentes apuntan a la misma
    // impresora, la actividad reciente describe mejor quién está ahí.
    const crudo = new Map<
      number,
      { idUsuario: number; desde: Date; via: 'CONSUMO' | 'MONTAJE' }
    >();
    for (const m of montajes)
      crudo.set(m.idImpresora, {
        idUsuario: m.creadoPor,
        desde: m.montadoEn,
        via: 'MONTAJE',
      });
    for (const c of ultimosConsumos)
      crudo.set(c.id_impresora, {
        idUsuario: c.creado_por,
        desde: c.creado_en,
        via: 'CONSUMO',
      });

    // La propia actividad no ocupa nada: avisarle a alguien que él mismo está
    // usando la máquina sería ruido puro, y confirmarlo lo entrenaría a
    // confirmar sin leer.
    for (const [idImp, o] of [...crudo])
      if (o.idUsuario === idUsuarioActor) crudo.delete(idImp);
    if (crudo.size === 0) return new Map();

    const usuarios = await this.prisma.usuario.findMany({
      where: {
        idUsuario: {
          in: [...new Set([...crudo.values()].map((o) => o.idUsuario))],
        },
      },
      select: { idUsuario: true, username: true, nombreCompleto: true },
    });
    const nombrePor = new Map(
      usuarios.map((u) => [u.idUsuario, u.nombreCompleto || u.username]),
    );

    return new Map(
      [...crudo].map(([idImp, o]) => [
        idImp,
        {
          ...o,
          usuario: nombrePor.get(o.idUsuario) ?? `Usuario ${o.idUsuario}`,
        },
      ]),
    );
  }

  async pendientes(
    idEmpresa: number,
    idUsuarioActor: number,
    idImpresora?: number,
    limite = 2500,
  ) {
    const lineas = await this.prisma.lineaProduccion.findMany({
      where: {
        // Sin esto el panel ofrecía trabajo pendiente de la otra empresa.
        idEmpresa,
        ...(idImpresora ? { idImpresora } : {}),
        // Sin ningún consumo vigente todavía. `procesadaEn` no sirve como
        // filtro: se marca en el primer envío, aunque queden tallas sueltas.
        consumosPapel: {
          none: { origen: 'PRODUCCION', anuladoEn: null },
        },
      },
      include: {
        ordenProduccion: { include: { cliente: true } },
        producto: { select: { codigo: true, descripcion: true } },
        impresora: { select: { idImpresora: true, codigo: true } },
        // idTalla y nombre, no solo la cantidad: hacen falta para resolver el
        // estándar vigente y para nombrar las tallas que no lo tienen.
        tallas: {
          select: {
            cantidad: true,
            idTalla: true,
            talla: { select: { nombre: true } },
          },
        },
      },
      orderBy: [
        { impresora: { orden: 'asc' } },
        { ordenProduccion: { correlativo: 'desc' } },
        { codigoLine: 'asc' },
      ],
      take: limite,
    });

    // Estándar vigente HOY para TODA la cola en una sola consulta, igual que en
    // `buscarPorCodigo`. Con ~2,500 líneas, una consulta por línea sería
    // inviable; con un `in` sobre productos y tallas es una sola ida a la base.
    const hoy = new Date();
    const idsProducto = [...new Set(lineas.map((l) => l.idProducto))];
    const idsTalla = [
      ...new Set(lineas.flatMap((l) => l.tallas.map((t) => t.idTalla))),
    ];
    const estandares =
      idsProducto.length && idsTalla.length
        ? await this.prisma.consumoEstandar.findMany({
            where: {
              idProducto: { in: idsProducto },
              idTalla: { in: idsTalla },
              vigenteDesde: { lte: hoy },
              OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: hoy } }],
            },
            select: { idProducto: true, idTalla: true, yardas: true },
          })
        : [];
    const estandarPor = new Map(
      estandares.map((e) => [`${e.idProducto}|${e.idTalla}`, Number(e.yardas)]),
    );

    // Una línea sin impresora asignada no puede agruparse bajo ninguna: se
    // junta aparte para que no desaparezca de la vista sin explicación.
    const SIN_IMPRESORA = 0;
    const grupos = new Map<number, GrupoImpresoraPendiente>();

    for (const l of lineas) {
      const idImp = l.impresora?.idImpresora ?? SIN_IMPRESORA;
      let grupo = grupos.get(idImp);
      if (!grupo) {
        grupo = {
          idImpresora: idImp === SIN_IMPRESORA ? null : idImp,
          impresora: l.impresora?.codigo ?? 'Sin impresora asignada',
          ordenes: [],
          ocupadaPor: null,
          rollo: null,
        };
        grupos.set(idImp, grupo);
      }

      let orden = grupo.ordenes.find(
        (o) => o.idOrdenProduccion === l.idOrdenProduccion,
      );
      if (!orden) {
        orden = {
          idOrdenProduccion: l.idOrdenProduccion,
          codigo: l.ordenProduccion.codigo,
          cliente: l.ordenProduccion.cliente?.nombre ?? null,
          ordenCompra: l.ordenProduccion.ordenCompra,
          fechaCompromiso: l.ordenProduccion.fechaCompromiso,
          consumoEnBlanco: l.ordenProduccion.consumoEnBlanco,
          enBlancoYd: Number(l.ordenProduccion.enBlancoYd),
          lineas: 0,
          totalPiezas: 0,
          idsLineaProduccion: [],
          estimadoYd: 0,
          tallasSinEstandar: [],
          lineasDetalle: [],
          enBlancoPendienteYd: 0,
        };
        grupo.ordenes.push(orden);
      }

      orden.lineas++;
      orden.totalPiezas += l.tallas.reduce((a, t) => a + t.cantidad, 0);
      orden.idsLineaProduccion.push(l.idLineaProduccion);

      // Mismas fórmulas que la captura, que salieron del Código.gs legacy:
      // consumo = estándar × cantidad, enguiamiento = cantidad × factor. Si no
      // se repitieran acá, el estimado y lo que de verdad se descuenta podrían
      // discrepar sin que nada lo delate.
      const factorEng =
        Number(l.factorEnguiamiento ?? 0) || FACTOR_ENGUIAMIENTO_DEFAULT;
      let estimadoLinea = 0;
      let lineaBloqueada = false;
      for (const t of l.tallas) {
        const yd = estandarPor.get(`${l.idProducto}|${t.idTalla}`);
        if (yd == null) {
          // Sin estándar no se puede estimar NI enviar: se nombra la talla en
          // vez de sumar cero en silencio.
          if (!orden.tallasSinEstandar.includes(t.talla.nombre))
            orden.tallasSinEstandar.push(t.talla.nombre);
          lineaBloqueada = true;
          continue;
        }
        estimadoLinea += yd * t.cantidad + t.cantidad * factorEng;
      }
      orden.estimadoYd += estimadoLinea;
      orden.lineasDetalle.push({
        idLineaProduccion: l.idLineaProduccion,
        estimadoYd: +estimadoLinea.toFixed(4),
        bloqueada: lineaBloqueada,
      });
    }

    const resultado = [...grupos.values()];
    const idsImpresoraPresentes = resultado
      .map((g) => g.idImpresora)
      .filter((x): x is number => x != null);

    // El papel en blanco se suma al estimado SOLO si todavía no se cobró: ya
    // cargado, el índice único impide una segunda fila, así que sumarlo otra vez
    // haría creer que el rollo va a rendir menos de lo que rinde.
    const idsOrden = resultado.flatMap((g) =>
      g.ordenes
        .filter((o) => o.consumoEnBlanco)
        .map((o) => o.idOrdenProduccion),
    );
    const enBlancoYaCobrado = new Set(
      idsOrden.length
        ? (
            await this.prisma.consumoPapel.findMany({
              where: {
                idOrdenProduccion: { in: idsOrden },
                origen: 'EN_BLANCO',
                anuladoEn: null,
              },
              select: { idOrdenProduccion: true },
            })
          ).map((c) => c.idOrdenProduccion)
        : [],
    );

    // Ocupación y estado del rollo en UNA pasada para todos los grupos, no una
    // consulta por impresora. El grupo "Sin impresora asignada" no puede estar
    // ocupado por nadie ni tener rollo: no hay máquina.
    const ocupacion = await this.ocupacionDeImpresoras(
      idsImpresoraPresentes,
      idUsuarioActor,
    );
    const rollos = await this.rollos.estadoDeRollosPorImpresora(
      idsImpresoraPresentes,
    );

    for (const g of resultado) {
      if (g.idImpresora != null) {
        g.ocupadaPor = ocupacion.get(g.idImpresora) ?? null;
        g.rollo = rollos.get(g.idImpresora) ?? null;
      }
      for (const o of g.ordenes) {
        if (o.consumoEnBlanco && !enBlancoYaCobrado.has(o.idOrdenProduccion)) {
          o.enBlancoPendienteYd = o.enBlancoYd;
          o.estimadoYd += o.enBlancoYd;
        }
        o.estimadoYd = +o.estimadoYd.toFixed(4);
      }
    }

    return {
      grupos: resultado,
      /** Para avisar si el tope recortó la cola en vez de callarlo. */
      lineasDevueltas: lineas.length,
      truncado: lineas.length === limite,
    };
  }

  /**
   * Registra el consumo de UNA línea (todas sus tallas pendientes).
   *
   * Como en Reposiciones, el rollo NUNCA se teclea: se resuelve con
   * `fn_rollo_en(impresora, fecha)` y de ahí sale el tipo de papel. Si la
   * impresora no tiene rollo montado en ese instante se rechaza, en vez de
   * guardar un dato indeterminado.
   */
  /**
   * Envía varias líneas. Cada una va en SU PROPIA transacción a propósito: si
   * se seleccionan 50 y 3 fallan (por ejemplo porque su impresora no tenía
   * rollo montado en ese momento), no tiene sentido perder las 47 buenas. Se
   * devuelve un resumen de qué entró, qué ya estaba y qué falló con su motivo.
   */
  async capturarLote(
    dto: CapturarConsumoDto,
    idUsuarioActor: number,
    idEmpresa: number,
    puedeFechaManual: boolean,
  ) {
    // El caso normal es descontar contra el rollo montado AHORA: `dto.fecha`
    // llega vacía y `capturarUna` usa `new Date()`. Mandar una fecha es la
    // excepción —registrar algo impreso antes, contra un rollo ya desmontado—
    // y desde 2026-09-28 exige `costeo.consumo.fecha_manual`. Se valida acá y
    // no solo ocultando el campo en la pantalla: el cuerpo lo arma el cliente.
    if (dto.fecha && !puedeFechaManual)
      throw new ForbiddenException(
        'No tenés permiso para registrar con una fecha distinta a la actual',
      );
    const resultado = {
      enviadas: [] as { codigoLine: string; tallas: number }[],
      yaEstaban: [] as { codigoLine: string; tallas: string[] }[],
      fallidas: [] as {
        idLineaProduccion: number;
        codigoLine?: string;
        motivo: string;
        /** Marca el caso de "impresora sin rollo montado", que tiene arreglo propio. */
        sinRollo?: boolean;
        /** Impresora que otro operario está usando: se confirma, no se arregla. */
        impresoraOcupada?: {
          idImpresora: number;
          impresora: string;
          usuario: string;
        };
      }[],
    };
    // Se juntan las filas de TODO el lote para mandarlas en una sola llamada a
    // Google: un envío de 50 líneas de 6 tallas son 300 filas, y de a una
    // serían 300 llamadas contra la cuota.
    const filasSheets: (string | number)[][] = [];

    // El tope por impresora se resuelve UNA vez para el lote entero y no dentro
    // de cada línea: un envío de 300 líneas de la misma máquina haría 300 veces
    // la misma consulta. Las impresoras del lote salen de las líneas (o del
    // override), así que hay que leerlas antes del loop.
    const impresorasDelLote = await this.prisma.lineaProduccion.findMany({
      where: { idLineaProduccion: { in: dto.idsLineaProduccion }, idEmpresa },
      select: { idImpresora: true },
    });
    const ocupacion = await this.ocupacionDeImpresoras(
      [
        ...impresorasDelLote.map((l) => l.idImpresora),
        dto.idImpresora ?? null,
      ].filter((x): x is number => x != null),
      idUsuarioActor,
    );
    const confirmadas = new Set(dto.idsImpresoraAjenaConfirmadas ?? []);

    for (const id of dto.idsLineaProduccion) {
      try {
        const r = await this.capturarUna(
          id,
          dto,
          idUsuarioActor,
          idEmpresa,
          ocupacion,
          confirmadas,
        );
        filasSheets.push(...r.filasSheets);
        if (r.creadas > 0)
          resultado.enviadas.push({
            codigoLine: r.codigoLine,
            tallas: r.creadas,
          });
        if (r.yaEstaban.length > 0)
          resultado.yaEstaban.push({
            codigoLine: r.codigoLine,
            tallas: r.yaEstaban,
          });
      } catch (e) {
        const respuesta = e instanceof HttpException ? e.getResponse() : null;
        const cuerpo =
          respuesta && typeof respuesta === 'object'
            ? (respuesta as {
                message?: string;
                motivo?: string;
                idImpresora?: number;
                impresora?: string;
                usuario?: string;
              })
            : null;
        resultado.fallidas.push({
          idLineaProduccion: id,
          motivo:
            typeof respuesta === 'string'
              ? respuesta
              : (cuerpo?.message ??
                (e instanceof HttpException ? e.message : 'Error inesperado')),
          sinRollo: cuerpo?.motivo === 'SIN_ROLLO_MONTADO' || undefined,
          // La pantalla necesita distinguir este caso para ofrecer confirmar en
          // vez de un arreglo, y agruparlo por impresora. Se mira el `motivo`
          // estructurado y no el texto, que se rompe al reescribirlo.
          impresoraOcupada:
            cuerpo?.motivo === 'IMPRESORA_OCUPADA'
              ? {
                  idImpresora: cuerpo.idImpresora!,
                  impresora: cuerpo.impresora!,
                  usuario: cuerpo.usuario!,
                }
              : undefined,
        });
      }
    }

    // Después de que Postgres confirmó todo, y sin `await`: el espejo nunca
    // bloquea ni revierte el guardado real (misma regla que Reposiciones,
    // confirmada con el usuario). GoogleSheetsService no lanza; si falla,
    // queda en el log del servidor.
    //
    // Y solo si ESTA empresa espeja: los libros son de Digitexsa, así que el
    // consumo de Digitalpro se guarda únicamente en PostgreSQL (decisión del
    // usuario, 2026-09-30). Se consulta acá y no dentro del método para que la
    // condición quede a la vista junto a la llamada.
    if (filasSheets.length && (await this.empresaEspejaSheets(idEmpresa)))
      void this.espejarEnGoogleSheets(filasSheets);

    return resultado;
  }

  /**
   * Espejo hacia la hoja "Datos" del libro ConsumosFinal, que alimenta los
   * Dashboards de Data Studio. Es el equivalente de lo que hacía copiarDatos()
   * en la Forma 2 legacy, con dos diferencias deliberadas:
   *
   * - El NRollo va resuelto de verdad, no con la heurística del legacy.
   * - No se borra nada del origen. El legacy borraba las filas de DatosOrigen
   *   ya procesadas; acá el origen es la base y la línea solo se marca con
   *   `procesada_en` (corrección #3 de §6.2).
   *
   * Las ANULACIONES no se reflejan, igual que en Reposiciones: el legacy solo
   * hace append y nunca borra ni marca filas. Una anulación en el ERP deja su
   * fila ya escrita tal cual, para limpiarla a mano si hiciera falta.
   */
  /**
   * Si la empresa replica en los Google Sheets legacy. El default de la columna
   * es `false`, así que una empresa nueva no escribe en libros ajenos hasta que
   * alguien lo habilite — el error caro es contaminar los Dashboards, no
   * quedarse sin una fila.
   */
  private async empresaEspejaSheets(idEmpresa: number) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { idEmpresa },
      select: { espejaSheets: true },
    });
    return empresa?.espejaSheets ?? false;
  }

  /**
   * Crea la fila de papel en blanco de una orden, si todavía no la tiene.
   *
   * El monto es FIJO POR ORDEN: una orden de 500 piezas gasta lo mismo que una
   * de 1. Antes se calculaba `cantidad * 0.6` por talla, que sobre los datos
   * reales daba 237 yd donde van 4.
   *
   * Va en `en_blanco_yd` con `consumo_yd` en 0 —y no al revés— para que
   * `consumoPorMontajeIds()` la sume sin cambiar: ese método ya suma los tres
   * conceptos, así que el panel, el historial y la merma la recogen solos.
   */
  private async asegurarFilaEnBlanco(
    tx: Pick<PrismaService, 'consumoPapel'>,
    d: {
      idOrdenProduccion: number;
      enBlancoYd: number;
      fecha: Date;
      idImpresora: number;
      idMontajeRollo: number;
      idTipoPapel: number;
      idUsuarioActor: number;
      /**
       * Marca del tope por impresora, si el envío que la crea va sobre la
       * máquina de otro. El papel en blanco sale del MISMO rollo ajeno, así que
       * sin esto un reporte que sume yardas enviadas sobre impresora de otro
       * perdería estas 2-10 yd. Opcional: el marcado manual no pasa por el tope.
       */
      impresoraOcupadaPor?: number | null;
    },
  ) {
    const ya = await tx.consumoPapel.findFirst({
      where: {
        idOrdenProduccion: d.idOrdenProduccion,
        origen: 'EN_BLANCO',
        anuladoEn: null,
      },
      select: { idConsumoPapel: true },
    });
    if (ya) return null;

    const creada = await tx.consumoPapel.create({
      data: {
        fecha: d.fecha,
        origen: 'EN_BLANCO',
        idOrdenProduccion: d.idOrdenProduccion,
        idImpresora: d.idImpresora,
        idMontajeRollo: d.idMontajeRollo,
        idTipoPapel: d.idTipoPapel,
        consumoYd: 0,
        enBlancoYd: d.enBlancoYd,
        creadoPor: d.idUsuarioActor,
        impresoraOcupadaPor: d.impresoraOcupadaPor ?? null,
      },
      select: { idConsumoPapel: true },
    });
    // El id y no un booleano: quien la creó tiene que poder espejarla, y la
    // fila se arma leyéndola de vuelta con sus relaciones (ver más abajo).
    return creada.idConsumoPapel;
  }

  /**
   * Arma la fila de papel en blanco para la hoja "Datos".
   *
   * Vive acá y no incrustada en sus dos llamadores porque la forma de la hoja
   * es una sola: el monto va en CONSUMO YDS y la columna EN BLANCO queda
   * vacía, igual que en el reporte (pedido explícito del usuario), y el ITEM
   * lleva la etiqueta que identifica la fila. Duplicar eso sería duplicar el
   * contrato con un libro que leen los Dashboards.
   */
  private filaSheetsEnBlanco(d: {
    fecha: Date;
    codigoOp: string;
    cliente: string;
    impresora: string;
    tipoPapel: string;
    yardas: number;
    nrollo: string;
  }): FilaDatosSheets {
    return [
      formatearFechaSheets(d.fecha), // A - Fecha
      '', // B - LINE (no tiene: el papel en blanco es de la ORDEN)
      d.codigoOp, // C - Orden de Producción
      '', // D - repo
      d.cliente, // E - Cliente
      d.impresora, // F - IMPRESORA
      ETIQUETA_EN_BLANCO, // G - Item
      d.tipoPapel, // H - TIPO DE PAPEL
      '', // I - Talla
      '', // J - Cantidad
      '', // K - Enguiamiento
      '', // L - En blanco (el monto va en Consumo, como en el reporte)
      d.yardas, // M - CONSUMO YDS
      '', // N - OBSERVACION
      d.nrollo, // O - NRollo
    ];
  }

  /**
   * Espeja UNA fila de papel en blanco a la hoja "Datos".
   *
   * Va en su propia fila y no pegada a una talla porque es consumo de la
   * ORDEN. Se arma releyendo la fila con sus relaciones en vez de recibir 15
   * parámetros: los dos caminos que la crean —la captura y el marcado manual—
   * tienen datos distintos a mano, y duplicar el armado sería duplicar la
   * forma de la hoja.
   *
   * Formato: el monto va en CONSUMO YDS y la columna EN BLANCO queda vacía,
   * igual que en el reporte (pedido explícito del usuario: en la hoja se ve
   * tal cual aparece ahí). El ITEM lleva la etiqueta que lo identifica.
   */
  private async espejarEnBlanco(idConsumoPapel: number) {
    const fila = await this.prisma.consumoPapel.findUnique({
      where: { idConsumoPapel },
      include: {
        ordenProduccion: { include: { cliente: true } },
        impresora: true,
        tipoPapel: true,
        montajeRollo: {
          include: { rolloPapel: { include: { facturaPapel: true } } },
        },
      },
    });
    if (!fila) return;

    const r = fila.montajeRollo?.rolloPapel;
    const nrollo = r
      ? `${r.facturaPapel.numeroFactura}-${r.facturaPapel.totalRollos}-${r.secuencia}`
      : '';

    await this.googleSheets.agregarFilas(
      process.env.GOOGLE_SHEETS_ID_CONSUMOS,
      'Datos',
      [
        this.filaSheetsEnBlanco({
          fecha: fila.fecha,
          codigoOp: fila.ordenProduccion.codigo,
          cliente: fila.ordenProduccion.cliente?.nombre ?? '',
          impresora: fila.impresora.codigo,
          tipoPapel: fila.tipoPapel.nombre,
          yardas: Number(fila.enBlancoYd),
          nrollo,
        }),
      ],
    );
  }

  /**
   * Marca o desmarca el papel en blanco de una orden.
   *
   * Es el reemplazo del flag por línea, que estaba en el lugar equivocado y
   * quedaba congelado al capturar (bug del 2026-09-29: prenderlo después no
   * hacía nada y reenviar tampoco lo corregía). Ahora:
   *
   * - Si la orden todavía no se imprimió, solo se guarda la intención; la fila
   *   se crea sola en el primer envío, contra el rollo que la imprima.
   * - Si ya se imprimió, se carga en el acto **al rollo que la imprimió** —el
   *   del último consumo de producción de esa orden—, no al que esté montado
   *   ahora. Así se puede corregir un olvido sin atribuirle el papel a un rollo
   *   que nunca tocó esa orden.
   * - Desmarcar ANULA la fila con autor y motivo; nunca la borra.
   */
  async editarEnBlanco(
    codigoOp: string,
    consumoEnBlanco: boolean,
    idUsuarioActor: number,
    idEmpresa: number,
    puedeAnular: boolean,
    enBlancoYd?: number,
  ) {
    const orden = await this.resolverOrden(codigoOp, idEmpresa, idUsuarioActor);
    // Sin cantidad explícita se conserva la que la orden ya tenía: desmarcar no
    // manda ninguna, y volver a marcar no debería resetear lo que se eligió.
    const yardas = enBlancoYd ?? Number(orden.enBlancoYd);

    const filaVigente = await this.prisma.consumoPapel.findFirst({
      where: {
        idOrdenProduccion: orden.idOrdenProduccion,
        origen: 'EN_BLANCO',
        anuladoEn: null,
      },
      select: { idConsumoPapel: true, enBlancoYd: true },
    });

    // Quitarlo retira papel ya cargado a un rollo, así que es una anulación de
    // consumo y se pide el permiso que gobierna eso — no el de editar la orden.
    if (!consumoEnBlanco && filaVigente && !puedeAnular)
      throw new ForbiddenException(
        'Quitar el papel en blanco de una orden ya cargada anula un consumo, y para eso hace falta el permiso costeo.consumo.anular.',
      );

    let idCreada: number | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.ordenProduccion.update({
        where: { idOrdenProduccion: orden.idOrdenProduccion },
        data: { consumoEnBlanco, enBlancoYd: yardas },
      });

      if (!consumoEnBlanco) {
        if (filaVigente)
          await tx.consumoPapel.update({
            where: { idConsumoPapel: filaVigente.idConsumoPapel },
            data: {
              anuladoEn: new Date(),
              anuladoPor: idUsuarioActor,
              motivoAnulacion: 'Se desmarcó el papel en blanco de la orden',
            },
          });
        return;
      }
      const cambioLaCantidad =
        filaVigente !== null && Number(filaVigente.enBlancoYd) !== yardas;

      // Corregir la cantidad de una fila YA cargada se hace anulando y
      // recreando, no editando en el lugar. Una fila de `consumo_papel` es
      // inmutable salvo por su anulación (misma regla que Reposiciones), y
      // pisarle las yardas dejaría el histórico diciendo que siempre fueron
      // las nuevas. Así quedan las dos, con autor y motivo.
      if (cambioLaCantidad) {
        await tx.consumoPapel.update({
          where: { idConsumoPapel: filaVigente.idConsumoPapel },
          data: {
            anuladoEn: new Date(),
            anuladoPor: idUsuarioActor,
            motivoAnulacion: `Se corrigió el papel en blanco de ${Number(filaVigente.enBlancoYd)} a ${yardas} yd`,
          },
        });
      } else if (filaVigente) return;

      // Solo si la orden YA tiene producción: de ahí sale el rollo al que
      // corresponde cargarlo. Si todavía no se imprimió, no hay rollo legítimo
      // al cual atribuirlo y la fila se creará sola en el primer envío.
      const ultimo = await tx.consumoPapel.findFirst({
        where: {
          idOrdenProduccion: orden.idOrdenProduccion,
          origen: 'PRODUCCION',
          anuladoEn: null,
        },
        orderBy: { fecha: 'desc' },
        select: {
          fecha: true,
          idImpresora: true,
          idMontajeRollo: true,
          idTipoPapel: true,
        },
      });
      if (!ultimo?.idMontajeRollo) return;

      idCreada = await this.asegurarFilaEnBlanco(tx, {
        idOrdenProduccion: orden.idOrdenProduccion,
        enBlancoYd: yardas,
        fecha: ultimo.fecha,
        idImpresora: ultimo.idImpresora,
        idMontajeRollo: ultimo.idMontajeRollo,
        idTipoPapel: ultimo.idTipoPapel,
        idUsuarioActor,
      });
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.orden_produccion',
      idEntidad: String(orden.idOrdenProduccion),
      accion: 'UPDATE',
      datosNuevos: { consumoEnBlanco, enBlancoYd: yardas },
    });

    // Después de que Postgres confirmó y sin `await`: el espejo nunca bloquea
    // ni revierte el guardado. Solo si ESTA empresa espeja — los libros son de
    // Digitexsa.
    //
    // ⚠️ Desmarcar o corregir ANULA la fila en Postgres, pero las anulaciones
    // no se espejan (el legacy solo hace `append`), así que la fila ya escrita
    // se queda en la hoja. Es la misma convención que Reposiciones; con el
    // papel en blanco siendo corregible a propósito va a pasar más seguido.
    if (idCreada !== null && (await this.empresaEspejaSheets(idEmpresa)))
      void this.espejarEnBlanco(idCreada);

    return this.estadoEnBlanco(orden.idOrdenProduccion);
  }

  /** Lo que la pantalla necesita para dibujar el checkbox y su leyenda. */
  private async estadoEnBlanco(idOrdenProduccion: number) {
    const [orden, fila] = await Promise.all([
      this.prisma.ordenProduccion.findUniqueOrThrow({
        where: { idOrdenProduccion },
        select: { codigo: true, consumoEnBlanco: true, enBlancoYd: true },
      }),
      this.prisma.consumoPapel.findFirst({
        where: { idOrdenProduccion, origen: 'EN_BLANCO', anuladoEn: null },
        select: { enBlancoYd: true, idMontajeRollo: true },
      }),
    ]);
    return {
      codigo: orden.codigo,
      consumoEnBlanco: orden.consumoEnBlanco,
      enBlancoYd: Number(orden.enBlancoYd),
      /** Ya descontado de un rollo. Si es false, se descontará al imprimir. */
      cargado: fila !== null,
      idMontajeRollo: fila?.idMontajeRollo ?? null,
    };
  }

  private async espejarEnGoogleSheets(filas: (string | number)[][]) {
    await this.googleSheets.agregarFilas(
      process.env.GOOGLE_SHEETS_ID_CONSUMOS,
      'Datos',
      filas,
    );
  }

  private async capturarUna(
    idLineaProduccion: number,
    dto: CapturarConsumoDto,
    idUsuarioActor: number,
    idEmpresa: number,
    ocupacion: Map<number, OcupacionImpresora> = new Map(),
    confirmadas: Set<number> = new Set(),
  ) {
    const fecha = dto.fecha ? new Date(dto.fecha) : new Date();
    if (Number.isNaN(fecha.getTime()))
      throw new BadRequestException('Fecha inválida');

    // findFirst con la empresa: los ids llegan del cliente, así que sin este
    // filtro un POST armado a mano podría descontar papel contra una línea de
    // la otra empresa.
    const linea = await this.prisma.lineaProduccion.findFirst({
      where: { idLineaProduccion, idEmpresa },
      include: {
        tallas: { include: { talla: true } },
        producto: true,
        // Solo para el espejo a Google Sheets: la hoja "Datos" lleva el
        // cliente y el código de OP en cada fila.
        ordenProduccion: { include: { cliente: true } },
      },
    });
    if (!linea)
      throw new NotFoundException('Línea de producción no encontrada');
    if (linea.tallas.length === 0)
      throw new BadRequestException(
        'La línea no tiene cantidades por talla: no hay nada que descontar',
      );

    const idImpresora = dto.idImpresora ?? linea.idImpresora;
    if (idImpresora == null)
      throw new BadRequestException(
        'La línea no tiene impresora asignada: indicá cuál se usó',
      );

    // Tope por impresora: si otro operario viene trabajando en esta máquina,
    // se exige confirmarlo explícitamente. La validación va en el servidor y no
    // solo en la pantalla, porque el cuerpo lo arma el cliente.
    //
    // ⚠️ Es un TOPE, no un muro: con la impresora en
    // `idsImpresoraAjenaConfirmadas` el envío procede y queda registrado. Nunca
    // puede bloquear, porque el cambio de turno es operación normal — el
    // usuario confirmó que alguien monta en la tarde y otro cierra en la noche.
    const ocupada = ocupacion.get(idImpresora);
    const ocupadaSinConfirmar = ocupada && !confirmadas.has(idImpresora);
    if (ocupadaSinConfirmar) {
      const impresora = await this.prisma.impresora.findUnique({
        where: { idImpresora },
        select: { codigo: true },
      });
      const codigo = impresora?.codigo ?? String(idImpresora);
      // La hora va en zona de Guatemala y no como ISO crudo: este mensaje lo
      // lee un operario en planta, y "2026-10-06T05:19:21.316Z" no le dice nada
      // (son además las 23:19 del día anterior para él). `desde` viaja también
      // estructurado para que la pantalla pueda decir "hace 12 minutos".
      const hora = ocupada.desde.toLocaleString('es-GT', {
        timeZone: 'America/Guatemala',
        dateStyle: 'short',
        timeStyle: 'short',
      });
      throw new ConflictException({
        message:
          `${ocupada.usuario} viene usando la ${codigo} ` +
          `(${ocupada.via === 'CONSUMO' ? 'último envío' : 'montó el rollo'} ` +
          `el ${hora}). Si de todos modos te corresponde —por ejemplo un cambio ` +
          `de turno—, confirmalo: queda registrado a tu nombre.`,
        motivo: 'IMPRESORA_OCUPADA',
        idImpresora,
        impresora: codigo,
        usuario: ocupada.usuario,
        desde: ocupada.desde,
      });
    }
    // Solo cuando de verdad era de otro: si la venía usando el mismo que envía,
    // `ocupacionDeImpresoras` ya la descartó y esto queda en null. El CHECK de
    // la base rechaza la fila si llegaran a coincidir.
    const impresoraOcupadaPor = ocupada?.idUsuario ?? null;

    const hoy = new Date();
    const estandares = await this.prisma.consumoEstandar.findMany({
      where: {
        idProducto: linea.idProducto,
        idTalla: { in: linea.tallas.map((t) => t.idTalla) },
        vigenteDesde: { lte: hoy },
        OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: hoy } }],
      },
      select: { idConsumoEstandar: true, idTalla: true, yardas: true },
    });
    const estandarPor = new Map(estandares.map((e) => [e.idTalla, e]));

    const faltantes = linea.tallas.filter((t) => !estandarPor.has(t.idTalla));
    if (faltantes.length > 0)
      throw new BadRequestException(
        `Sin consumo estándar para ${faltantes.map((t) => `"${t.talla.nombre}"`).join(', ')} de "${linea.producto.codigo}": cargalo en Consumo Estándar antes de enviar esta línea`,
      );

    const factorEng =
      Number(linea.factorEnguiamiento ?? 0) || FACTOR_ENGUIAMIENTO_DEFAULT;

    return this.prisma.$transaction(async (tx) => {
      const rollo = await tx.$queryRaw<{ id_montaje: number | null }[]>`
        SELECT costeo.fn_rollo_en(${idImpresora}, ${fecha}::timestamptz) AS id_montaje
      `;
      const idMontajeRollo = rollo[0]?.id_montaje ?? null;
      if (idMontajeRollo == null) {
        const impresora = await tx.impresora.findUnique({
          where: { idImpresora },
          select: { codigo: true },
        });
        // Respuesta estructurada, no solo texto: la pantalla necesita
        // distinguir ESTE fallo de los demás para ofrecer el atajo a Montaje,
        // y hacerlo comparando el mensaje se rompería al reescribirlo.
        throw new ConflictException({
          message: `La impresora ${impresora?.codigo ?? idImpresora} no tiene ningún rollo montado: montá uno en Gestión de Rollos → Montaje. Si la orden se imprimió antes y ese rollo ya se desmontó, ajustá la fecha de impresión.`,
          motivo: 'SIN_ROLLO_MONTADO',
          idImpresora,
        });
      }
      const montaje = await tx.montajeRollo.findUniqueOrThrow({
        where: { idMontajeRollo },
        include: {
          // facturaPapel y tipoPapel: para el NRollo y el tipo de papel que
          // van en la hoja "Datos". impresora: puede no ser la de la línea,
          // si el envío vino con `idImpresora` de override.
          rolloPapel: { include: { facturaPapel: true, tipoPapel: true } },
          impresora: true,
        },
      });

      // Idempotencia (corrección #5 de §6.2): se consulta qué tallas ya están
      // enviadas y no se intenta insertarlas. El índice único parcial
      // (linea, talla) WHERE origen='PRODUCCION' AND anulado_en IS NULL sigue
      // siendo la garantía real ante concurrencia — esto solo evita el caso
      // común de reenviar una línea ya procesada, que NO es un error.
      //
      // Ojo: no se puede atrapar el P2002 y seguir dentro de la transacción.
      // En Postgres una sentencia fallida aborta la transacción entera
      // (25P02: "current transaction is aborted"), así que el catch-y-continuar
      // rompe todo lo que venga después. Habría que usar SAVEPOINT; consultar
      // antes es más simple y además permite informar qué se salteó.
      const previos = await tx.consumoPapel.findMany({
        where: {
          idLineaProduccion: linea.idLineaProduccion,
          origen: 'PRODUCCION',
          anuladoEn: null,
        },
        select: { idTalla: true },
      });
      const yaEnviadas = new Set(previos.map((c) => c.idTalla));

      let creadas = 0;
      const yaEstaban: string[] = [];
      const filasSheets: FilaDatosSheets[] = [];

      // Mismo formato que costeo.v_rollo_codigo, igual que en Reposiciones: el
      // NRollo que el ERP ya resolvió, no la búsqueda heurística del legacy
      // (que en los datos reales se queda en "Buscando..." muy seguido).
      const nrolloTexto = `${montaje.rolloPapel.facturaPapel.numeroFactura}-${montaje.rolloPapel.facturaPapel.totalRollos}-${montaje.rolloPapel.secuencia}`;
      const fechaTexto = formatearFechaSheets(fecha);
      const clienteNombre = linea.ordenProduccion.cliente?.nombre ?? '';
      const impresoraCodigo = montaje.impresora.codigo;
      const tipoPapelNombre = montaje.rolloPapel.tipoPapel.nombre;

      for (const t of linea.tallas) {
        if (yaEnviadas.has(t.idTalla)) {
          yaEstaban.push(t.talla.nombre);
          continue;
        }
        const est = estandarPor.get(t.idTalla)!;
        const consumoYd = +(Number(est.yardas) * t.cantidad).toFixed(4);
        await tx.consumoPapel.create({
          data: {
            fecha,
            origen: 'PRODUCCION',
            idOrdenProduccion: linea.idOrdenProduccion,
            idLineaProduccion: linea.idLineaProduccion,
            idProducto: linea.idProducto,
            idTalla: t.idTalla,
            idImpresora,
            idMontajeRollo,
            idTipoPapel: montaje.rolloPapel.idTipoPapel,
            cantidad: t.cantidad,
            // Corrección #4 de §6.2: se guarda QUÉ versión del estándar se
            // aplicó, para que el recosteo sea reproducible más adelante.
            idConsumoEstandar: est.idConsumoEstandar,
            consumoYd,
            enguiamientoYd: +(t.cantidad * factorEng).toFixed(4),
            // `enBlancoYd` NO se calcula acá: el papel en blanco es un monto
            // fijo por ORDEN y vive en su propia fila (`origen = EN_BLANCO`).
            // Calcularlo por talla era lo que daba 237 yd donde van 4.
            observacion: dto.observacion ?? null,
            creadoPor: idUsuarioActor,
            // Registro del tope: null en el caso normal. Va por FILA y no una
            // marca aparte por envío, para que el reporte futuro pueda contar
            // yardas —no solo eventos— enviadas sobre la máquina de otro.
            impresoraOcupadaPor,
          },
        });
        creadas++;

        // Solo lo que DE VERDAD se creó: las tallas ya enviadas se saltearon
        // arriba, y mandarlas igual duplicaría filas en la hoja (el legacy
        // tampoco las reenvía, las descarta como duplicado).
        filasSheets.push([
          fechaTexto, // A - Fecha
          linea.codigoLine, // B - LINE
          linea.ordenProduccion.codigo, // C - Orden de Producción
          '', // D - repo (vacío: esto es producción, no reposición)
          clienteNombre, // E - Cliente
          impresoraCodigo, // F - IMPRESORA
          linea.producto.codigo, // G - Item
          tipoPapelNombre, // H - TIPO DE PAPEL
          t.talla.nombre, // I - Talla
          t.cantidad, // J - Cantidad
          +(t.cantidad * factorEng).toFixed(4), // K - Yardas (enguiamiento)
          // Columna L siempre vacía desde que el papel en blanco es por ORDEN:
          // ya no hay un monto atribuible a esta talla. El legacy también la
          // dejaba vacía (no 0) cuando no aplicaba, así que no se le cambia el
          // tipo de dato a una columna que los Dashboards ya leen.
          // ⚠️ Consecuencia: los Dashboards dejan de ver el papel en blanco
          // (4 yd por orden). Es muchísimo menos error que lo que recibían
          // antes, pero queda anotado como decisión pendiente del usuario.
          '', // L - Consumo en blanco
          consumoYd, // M - CONSUMO YDS
          // El legacy mandaba "" acá, pero la columna se llama OBSERVACION en
          // la hoja real y el ERP sí tiene ese dato por captura: se aprovecha.
          dto.observacion ?? '', // N - OBSERVACION
          nrolloTexto, // O - NRollo
        ]);
      }

      // El papel en blanco de la ORDEN, una sola vez. Se crea acá —dentro de
      // la misma transacción que la captura— para que nadie tenga que
      // acordarse de marcarlo después: si la orden lo lleva, se carga al rollo
      // que de verdad la imprimió. El índice único parcial lo vuelve
      // idempotente, así que reenviar otra línea de la misma orden no lo
      // duplica; por eso basta con intentarlo y no hace falta coordinar nada.
      if (creadas > 0 && linea.ordenProduccion.consumoEnBlanco) {
        const yardasEnBlanco = Number(linea.ordenProduccion.enBlancoYd);
        const creada = await this.asegurarFilaEnBlanco(tx, {
          idOrdenProduccion: linea.idOrdenProduccion,
          enBlancoYd: yardasEnBlanco,
          fecha,
          idImpresora,
          idMontajeRollo,
          idTipoPapel: montaje.rolloPapel.idTipoPapel,
          idUsuarioActor,
          // El papel en blanco sale del mismo rollo, así que hereda la marca.
          impresoraOcupadaPor,
        });
        // Solo si de verdad se creó: el índice único la vuelve idempotente, y
        // espejar igual duplicaría la fila en una hoja que solo hace append.
        // Viaja en `filasSheets` con las tallas para que el lote mande todo en
        // UNA llamada, en vez de gastar una request aparte por orden.
        if (creada !== null)
          filasSheets.push(
            this.filaSheetsEnBlanco({
              fecha,
              codigoOp: linea.ordenProduccion.codigo,
              cliente: clienteNombre,
              impresora: impresoraCodigo,
              tipoPapel: tipoPapelNombre,
              yardas: yardasEnBlanco,
              nrollo: nrolloTexto,
            }),
          );
      }

      // Corrección #3: el origen NO se borra, se marca como procesado.
      if (creadas > 0)
        await tx.lineaProduccion.update({
          where: { idLineaProduccion: linea.idLineaProduccion },
          data: { procesadaEn: new Date() },
        });

      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'costeo.consumo_papel',
        idEntidad: String(linea.idLineaProduccion),
        accion: 'CREATE',
        datosNuevos: { codigoLine: linea.codigoLine, creadas, yaEstaban },
      });

      return { creadas, yaEstaban, codigoLine: linea.codigoLine, filasSheets };
    });
  }

  async anular(
    idConsumoPapel: number,
    motivo: string | undefined,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const actual = await this.prisma.consumoPapel.findFirst({
      where: { idConsumoPapel, ordenProduccion: { idEmpresa } },
    });
    if (!actual) throw new NotFoundException('Consumo no encontrado');
    if (actual.anuladoEn)
      throw new ConflictException('Ese consumo ya estaba anulado');

    await this.prisma.consumoPapel.update({
      where: { idConsumoPapel },
      data: {
        anuladoEn: new Date(),
        anuladoPor: idUsuarioActor,
        motivoAnulacion: motivo ?? null,
      },
    });
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.consumo_papel',
      idEntidad: String(idConsumoPapel),
      accion: 'UPDATE',
      datosAnteriores: actual,
      datosNuevos: { anulado: true, motivo },
    });
    return { anulado: true };
  }
}
