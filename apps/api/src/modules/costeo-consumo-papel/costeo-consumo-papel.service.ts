import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  formatearFechaSheets,
  GoogleSheetsService,
} from '../../common/google-sheets/google-sheets.service';
import { parsearCodigoOp } from '../../common/op-codigo';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
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
  enBlancoYd: number;
  /** Ya se envió a producción (índice único parcial de `consumo_papel`). */
  yaEnviada: boolean;
  idConsumoPapel: number | null;
}

@Injectable()
export class CosteoConsumoPapelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly googleSheets: GoogleSheetsService,
  ) {}

  private async resolverOrden(codigoOp: string) {
    const parsed = parsearCodigoOp(codigoOp);
    if (!parsed)
      throw new BadRequestException(
        'Código de OP inválido (formato esperado: 26OP014154)',
      );
    const orden = await this.prisma.ordenProduccion.findUnique({
      where: {
        anio_correlativo: {
          anio: parsed.anio,
          correlativo: parsed.correlativo,
        },
      },
      include: { cliente: true, lineaProducto: true },
    });
    if (!orden) throw new NotFoundException(`No existe la OP "${codigoOp}"`);
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
  async obtenerOrden(codigoOp: string) {
    const orden = await this.resolverOrden(codigoOp);

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
          enBlancoYd: l.consumoEnBlanco
            ? +(t.cantidad * Number(l.factorEnBlanco)).toFixed(4)
            : 0,
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
        consumoEnBlanco: l.consumoEnBlanco,
        factorEnBlanco: Number(l.factorEnBlanco),
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
        totalEnBlancoYd: +tallas
          .reduce((a, t) => a + t.enBlancoYd, 0)
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
  async pendientes(idImpresora?: number, limite = 200) {
    const lineas = await this.prisma.lineaProduccion.findMany({
      where: {
        ...(idImpresora ? { idImpresora } : {}),
        // Sin ningún consumo vigente todavía. `procesadaEn` no sirve como
        // filtro: se marca en el primer envío, aunque queden tallas sueltas.
        consumosPapel: {
          none: { origen: 'PRODUCCION', anuladoEn: null },
        },
      },
      include: {
        ordenProduccion: { include: { cliente: true } },
        producto: { select: { codigo: true } },
        impresora: { select: { idImpresora: true, codigo: true } },
        tallas: { select: { cantidad: true } },
      },
      orderBy: [{ impresora: { orden: 'asc' } }, { codigoLine: 'asc' }],
      take: limite,
    });

    return {
      lineas: lineas.map((l) => ({
        idLineaProduccion: l.idLineaProduccion,
        codigoLine: l.codigoLine,
        codigoOp: l.ordenProduccion.codigo,
        cliente: l.ordenProduccion.cliente?.nombre ?? null,
        producto: l.producto.codigo,
        impresora: l.impresora,
        totalPiezas: l.tallas.reduce((a, t) => a + t.cantidad, 0),
      })),
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
  async capturarLote(dto: CapturarConsumoDto, idUsuarioActor: number) {
    const resultado = {
      enviadas: [] as { codigoLine: string; tallas: number }[],
      yaEstaban: [] as { codigoLine: string; tallas: string[] }[],
      fallidas: [] as {
        idLineaProduccion: number;
        codigoLine?: string;
        motivo: string;
        /** Marca el caso de "impresora sin rollo montado", que tiene arreglo propio. */
        sinRollo?: boolean;
      }[],
    };
    // Se juntan las filas de TODO el lote para mandarlas en una sola llamada a
    // Google: un envío de 50 líneas de 6 tallas son 300 filas, y de a una
    // serían 300 llamadas contra la cuota.
    const filasSheets: (string | number)[][] = [];

    for (const id of dto.idsLineaProduccion) {
      try {
        const r = await this.capturarUna(id, dto, idUsuarioActor);
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
            ? (respuesta as { message?: string; motivo?: string })
            : null;
        resultado.fallidas.push({
          idLineaProduccion: id,
          motivo:
            typeof respuesta === 'string'
              ? respuesta
              : (cuerpo?.message ??
                (e instanceof HttpException ? e.message : 'Error inesperado')),
          sinRollo: cuerpo?.motivo === 'SIN_ROLLO_MONTADO' || undefined,
        });
      }
    }

    // Después de que Postgres confirmó todo, y sin `await`: el espejo nunca
    // bloquea ni revierte el guardado real (misma regla que Reposiciones,
    // confirmada con el usuario). GoogleSheetsService no lanza; si falla,
    // queda en el log del servidor.
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
  ) {
    const fecha = dto.fecha ? new Date(dto.fecha) : new Date();
    if (Number.isNaN(fecha.getTime()))
      throw new BadRequestException('Fecha inválida');

    const linea = await this.prisma.lineaProduccion.findUnique({
      where: { idLineaProduccion },
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
            enBlancoYd: linea.consumoEnBlanco
              ? +(t.cantidad * Number(linea.factorEnBlanco)).toFixed(4)
              : 0,
            observacion: dto.observacion ?? null,
            creadoPor: idUsuarioActor,
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
          // El legacy deja la celda VACÍA cuando la línea no lleva papel en
          // blanco, no un 0. Se respeta para no cambiarle el tipo de dato a
          // la columna que ya leen los Dashboards.
          linea.consumoEnBlanco
            ? +(t.cantidad * Number(linea.factorEnBlanco)).toFixed(4)
            : '', // L - Consumo en blanco
          consumoYd, // M - CONSUMO YDS
          // El legacy mandaba "" acá, pero la columna se llama OBSERVACION en
          // la hoja real y el ERP sí tiene ese dato por captura: se aprovecha.
          dto.observacion ?? '', // N - OBSERVACION
          nrolloTexto, // O - NRollo
        ]);
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
  ) {
    const actual = await this.prisma.consumoPapel.findUnique({
      where: { idConsumoPapel },
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
