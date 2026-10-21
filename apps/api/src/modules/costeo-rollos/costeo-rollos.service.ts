import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { rangoDeDiasGT } from '../../common/dia-guatemala';
import { fechaCelda, textoCelda } from '../../common/excel-celda';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { FilaPreviewIngresoRollo } from './costeo-rollos.types';
import { FilaAplicarIngresoRolloDto } from './dto/aplicar-importar-ingresos.dto';
import { DesmontarMontajeDto } from './dto/desmontar-montaje.dto';
import { EditarIngresoDto } from './dto/editar-ingreso.dto';
import { IngresoFacturaPapelDto } from './dto/ingreso-factura-papel.dto';
import { ListarIngresosDto } from './dto/listar-ingresos.dto';
import { AsignarUbicacionDto } from './dto/asignar-ubicacion.dto';
import { ListarRollosDto } from './dto/listar-rollos.dto';
import { MarcarConsumidoFueraDto } from './dto/marcar-consumido-fuera.dto';
import { MontarRolloDto } from './dto/montar-rollo.dto';

const INCLUDE_ROLLO = { tipoPapel: true, facturaPapel: true } as const;

const AZUL_DIGITEXSA = 'FF203080';

// La plantilla lleva 4 filas de preámbulo (título, instrucciones, blanco,
// encabezado) antes de los datos. Arrancar en la 2 leería las instrucciones
// como si fueran una fila — bug real que ya apareció en los otros imports del
// proyecto y por eso todos comparten esta constante.
const FILA_INICIO_DATOS = 5;

/**
 * Un montaje abierto más de esto es una señal para revisar, no un error: o el
 * rollo se terminó y nadie lo desmontó, o el registro quedó colgado. Lo segundo
 * es lo que importa, porque un montaje abierto sigue recibiendo consumo.
 */
const DIAS_MONTAJE_LARGO = 15;

/** Cortes de antigüedad del stock, en días desde la fecha de la factura. */
const CORTES_ANTIGUEDAD = [30, 60, 90] as const;

/**
 * Las yardas son `Decimal(12,4)`, así que un saldo de milésimas es ruido de
 * redondeo y no un hallazgo. Por debajo de esto no se reporta nada.
 */
const TOLERANCIA_YD = 0.01;

function estiloEncabezado(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: AZUL_DIGITEXSA },
  };
}

/** Número de celda: null si está vacía, NaN si tiene algo que no es número. */
function numeroCelda(valor: unknown): number | null {
  const texto = textoCelda(valor as never).trim();
  if (!texto) return null;
  return Number(texto.replace(/,/g, ''));
}

@Injectable()
export class CosteoRollosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  listarImpresoras() {
    return this.prisma.impresora.findMany({
      where: { activo: true },
      include: { tipoPapelDefault: true },
      orderBy: { orden: 'asc' },
    });
  }

  listarTiposPapel() {
    return this.prisma.tipoPapel.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  listarUbicaciones() {
    return this.prisma.ubicacion.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  listarRollos(filtro: ListarRollosDto) {
    return this.prisma.rolloPapel.findMany({
      where: {
        estado: filtro.estado,
        idTipoPapel: filtro.idTipoPapel,
        idFacturaPapel: filtro.idFacturaPapel,
      },
      include: INCLUDE_ROLLO,
      orderBy: [{ idFacturaPapel: 'desc' }, { secuencia: 'asc' }],
    });
  }

  async obtenerRollo(idRolloPapel: number) {
    const rollo = await this.prisma.rolloPapel.findUnique({
      where: { idRolloPapel },
      include: {
        ...INCLUDE_ROLLO,
        montajes: {
          include: { impresora: true },
          orderBy: { montadoEn: 'desc' },
        },
      },
    });
    if (!rollo) throw new NotFoundException('Rollo no encontrado');
    return rollo;
  }

  // Cualquier rollo EN_BODEGA es seleccionable — solo se ordena primero el
  // tipo de papel default de la impresora elegida, no se restringe la lista.
  async listarDisponiblesParaMontar(idImpresora?: number) {
    const rollos = await this.prisma.rolloPapel.findMany({
      where: { estado: 'EN_BODEGA' },
      include: INCLUDE_ROLLO,
      orderBy: [{ idFacturaPapel: 'asc' }, { secuencia: 'asc' }],
    });
    if (!idImpresora) return rollos;

    const impresora = await this.prisma.impresora.findUnique({
      where: { idImpresora },
    });
    const idTipoPapelDefault = impresora?.idTipoPapelDefault ?? null;
    if (!idTipoPapelDefault) return rollos;

    return [...rollos].sort((a, b) => {
      const aCoincide = a.idTipoPapel === idTipoPapelDefault ? 0 : 1;
      const bCoincide = b.idTipoPapel === idTipoPapelDefault ? 0 : 1;
      return aCoincide - bCoincide;
    });
  }

  async ingreso(dto: IngresoFacturaPapelDto, idUsuarioActor: number) {
    const [tipoPapel, ubicacion] = await Promise.all([
      this.prisma.tipoPapel.findUnique({
        where: { idTipoPapel: dto.idTipoPapel },
      }),
      this.prisma.ubicacion.findUnique({
        where: { idUbicacion: dto.idUbicacion },
      }),
    ]);
    if (!tipoPapel) throw new NotFoundException('Tipo de papel no encontrado');
    if (!ubicacion) throw new NotFoundException('Ubicación no encontrada');

    // El mismo número de factura SÍ se puede volver a cargar, siempre que sea
    // con otro tipo de papel: una factura del proveedor trae varios artículos
    // y cada uno llega con sus rollos etiquetados desde el 1. Lo que no se
    // puede es cargar dos veces el mismo artículo.
    const existente = await this.prisma.facturaPapel.findUnique({
      where: {
        numeroFactura_idTipoPapel: {
          numeroFactura: dto.numeroFactura,
          idTipoPapel: dto.idTipoPapel,
        },
      },
    });
    if (existente) {
      throw new ConflictException(
        `La factura ${dto.numeroFactura} ya está cargada con ${tipoPapel.nombre} (${existente.totalRollos} rollo(s)). Si la factura trae otro artículo, cargalo eligiendo su propio tipo de papel; si lo que hay que arreglar es este, usá "Corregir ingreso".`,
      );
    }

    const factura = await this.prisma.$transaction(async (tx) => {
      const factura = await tx.facturaPapel.create({
        data: {
          numeroFactura: dto.numeroFactura,
          idTipoPapel: dto.idTipoPapel,
          fecha: new Date(dto.fecha),
          totalRollos: dto.totalRollos,
          creadoPor: idUsuarioActor,
        },
      });

      await tx.rolloPapel.createMany({
        data: Array.from({ length: dto.totalRollos }, (_, i) => ({
          idFacturaPapel: factura.idFacturaPapel,
          secuencia: i + 1,
          idTipoPapel: dto.idTipoPapel,
          idUbicacion: dto.idUbicacion,
          yardasIniciales: dto.yardasPorRollo ?? null,
          costoUnitario: dto.costoUnitario ?? null,
        })),
      });

      return factura;
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.factura_papel',
      idEntidad: String(factura.idFacturaPapel),
      accion: 'CREATE',
      datosNuevos: {
        numeroFactura: factura.numeroFactura,
        totalRollos: dto.totalRollos,
        // El NOMBRE y no el id: la bitácora narra para quien lee, y además un
        // nombre es una foto del momento que sobrevive a que lo renombren.
        tipoPapel: tipoPapel.nombre,
        ubicacion: ubicacion.nombre,
      },
    });

    return this.obtenerFactura(factura.idFacturaPapel);
  }

  async obtenerFactura(idFacturaPapel: number) {
    const factura = await this.prisma.facturaPapel.findUnique({
      where: { idFacturaPapel },
      include: {
        tipoPapel: true,
        rollos: { include: { tipoPapel: true }, orderBy: { secuencia: 'asc' } },
      },
    });
    if (!factura) throw new NotFoundException('Factura de papel no encontrada');
    return {
      ...factura,
      editable: await this.facturaEsEditable(
        factura.rollos.map((r) => r.idRolloPapel),
      ),
    };
  }

  /**
   * Un mismo número de factura puede tener VARIOS artículos (uno por tipo de
   * papel), así que devuelve todos los que coincidan y es la pantalla la que
   * hace elegir cuál corregir. Devolver solo el primero sería peor que pedir
   * que se elija: se editaría un artículo creyendo estar editando el otro.
   */
  async buscarFacturasPorNumero(numeroFactura: string) {
    const encontradas = await this.prisma.facturaPapel.findMany({
      where: { numeroFactura },
      select: { idFacturaPapel: true },
      orderBy: { idFacturaPapel: 'asc' },
    });
    if (encontradas.length === 0)
      throw new NotFoundException(
        'No existe ninguna factura de papel con ese número',
      );
    return {
      facturas: await Promise.all(
        encontradas.map((f) => this.obtenerFactura(f.idFacturaPapel)),
      ),
    };
  }

  // Corrección de un ingreso mal capturado (número de factura, fecha, tipo de
  // papel, yardas, costo) — solo mientras NINGÚN rollo de esa factura se haya
  // montado alguna vez, ni ahora ni en el pasado. Una vez montado, el dato
  // pudo haber generado consumo real, así que ya no se reescribe en silencio
  // — el caso (raro, confirmado con el usuario) se corrige directo en la
  // base de datos, no hay pantalla para eso.
  private async facturaEsEditable(idsRollo: number[]): Promise<boolean> {
    if (idsRollo.length === 0) return true;
    const montajesPrevios = await this.prisma.montajeRollo.count({
      where: { idRolloPapel: { in: idsRollo } },
    });
    return montajesPrevios === 0;
  }

  async editarIngreso(
    idFacturaPapel: number,
    dto: EditarIngresoDto,
    idUsuarioActor: number,
  ) {
    const factura = await this.prisma.facturaPapel.findUnique({
      where: { idFacturaPapel },
      include: { rollos: true },
    });
    if (!factura) throw new NotFoundException('Factura de papel no encontrada');

    const idsRollo = factura.rollos.map((r) => r.idRolloPapel);
    if (!(await this.facturaEsEditable(idsRollo))) {
      throw new ConflictException(
        'Esta factura ya tiene (o tuvo) rollos montados — no se puede editar. Es un caso excepcional: corregí el dato directamente en la base de datos.',
      );
    }

    const idsValidos = new Set(idsRollo);
    for (const r of dto.rollos) {
      if (!idsValidos.has(r.idRolloPapel)) {
        throw new BadRequestException(
          `El rollo ${r.idRolloPapel} no pertenece a esta factura`,
        );
      }
    }

    // El tipo de papel es del ARTÍCULO, no de cada rollo: una fila de
    // `factura_papel` es "este papel de esta factura", así que todos sus
    // rollos lo comparten por definición (lo garantiza la FK compuesta de la
    // base). Cambiarlo acá los re-tipa a todos en el mismo UPDATE, por el
    // ON UPDATE CASCADE.
    let tipoPapelNombre: string | undefined;
    if (dto.idTipoPapel != null) {
      const tipoPapel = await this.prisma.tipoPapel.findUnique({
        where: { idTipoPapel: dto.idTipoPapel },
      });
      if (!tipoPapel)
        throw new BadRequestException('El tipo de papel indicado no existe');
      tipoPapelNombre = tipoPapel.nombre;
    }

    const numeroFinal = dto.numeroFactura ?? factura.numeroFactura;
    const tipoFinal = dto.idTipoPapel ?? factura.idTipoPapel;
    if (
      numeroFinal !== factura.numeroFactura ||
      tipoFinal !== factura.idTipoPapel
    ) {
      const choque = await this.prisma.facturaPapel.findUnique({
        where: {
          numeroFactura_idTipoPapel: {
            numeroFactura: numeroFinal,
            idTipoPapel: tipoFinal,
          },
        },
        include: { tipoPapel: true },
      });
      if (choque && choque.idFacturaPapel !== idFacturaPapel) {
        throw new ConflictException(
          `Ya hay otro ingreso de la factura ${numeroFinal} con ${choque.tipoPapel.nombre} (${choque.totalRollos} rollo(s)). Dos artículos de la misma factura no pueden compartir el tipo de papel.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (
        dto.numeroFactura != null ||
        dto.fecha != null ||
        dto.idTipoPapel != null
      ) {
        await tx.facturaPapel.update({
          where: { idFacturaPapel },
          data: {
            numeroFactura: dto.numeroFactura,
            idTipoPapel: dto.idTipoPapel,
            fecha: dto.fecha ? new Date(dto.fecha) : undefined,
          },
        });
      }
      for (const r of dto.rollos) {
        await tx.rolloPapel.update({
          where: { idRolloPapel: r.idRolloPapel },
          data: {
            yardasIniciales: r.yardasIniciales ?? null,
            costoUnitario: r.costoUnitario ?? null,
          },
        });
      }
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.factura_papel',
      idEntidad: String(idFacturaPapel),
      accion: 'UPDATE',
      datosNuevos: {
        numeroFactura: dto.numeroFactura,
        tipoPapel: tipoPapelNombre,
        fecha: dto.fecha,
        rollos: dto.rollos,
      },
    });

    return this.obtenerFactura(idFacturaPapel);
  }

  /**
   * Saca de circulación un rango de rollos de una factura, o lo revierte.
   *
   * El caso que lo motiva: una factura de 40 rollos cuyos primeros 20 se
   * gastaron en el WebApp legacy antes de que existiera Costeo. Se registran
   * los 40 —la factura es por 40 y ese es el costo real— y se marcan los 20
   * que ya no existen físicamente, para que nadie los monte por error.
   *
   * No usa AGOTADO a propósito: ver el comentario del estado en el schema.
   */
  async marcarConsumidoFuera(
    dto: MarcarConsumidoFueraDto,
    idUsuarioActor: number,
  ) {
    const marcar = dto.marcar !== false;
    if (dto.desde > dto.hasta)
      throw new BadRequestException(
        'El rango está invertido: "desde" tiene que ser menor o igual que "hasta"',
      );
    if (marcar && !dto.motivo?.trim())
      throw new BadRequestException(
        'El motivo es obligatorio al sacar rollos de circulación: es lo que explica, dentro de un año, por qué no están disponibles',
      );

    const factura = await this.prisma.facturaPapel.findUnique({
      where: { idFacturaPapel: dto.idFacturaPapel },
    });
    if (!factura) throw new NotFoundException('Factura de papel no encontrada');

    const rollos = await this.prisma.rolloPapel.findMany({
      where: {
        idFacturaPapel: dto.idFacturaPapel,
        secuencia: { gte: dto.desde, lte: dto.hasta },
      },
      // Un rollo que se montó ACÁ sí se usó acá: marcarlo como consumido fuera
      // sería mentira, y además dejaría su consumo colgando de un rollo que el
      // sistema declara no haber visto nunca.
      include: { _count: { select: { montajes: true } } },
      orderBy: { secuencia: 'asc' },
    });
    if (rollos.length === 0)
      throw new NotFoundException(
        `La factura ${factura.numeroFactura} no tiene rollos entre el ${dto.desde} y el ${dto.hasta}`,
      );

    if (marcar) {
      const montados = rollos.filter((r) => r.estado === 'MONTADO');
      if (montados.length > 0)
        throw new ConflictException(
          `Hay ${montados.length} rollo(s) montados ahora mismo en el rango (secuencia ${montados
            .map((r) => r.secuencia)
            .join(', ')}). Desmontalos primero.`,
        );
      const conHistorial = rollos.filter((r) => r._count.montajes > 0);
      if (conHistorial.length > 0)
        throw new ConflictException(
          `Hay ${conHistorial.length} rollo(s) que YA se montaron en este ERP (secuencia ${conHistorial
            .map((r) => r.secuencia)
            .join(
              ', ',
            )}), así que su consumo sí está registrado acá. No se pueden marcar como consumidos fuera.`,
        );
    } else {
      const noMarcados = rollos.filter((r) => r.estado !== 'CONSUMIDO_FUERA');
      if (noMarcados.length === rollos.length)
        throw new ConflictException(
          'Ninguno de los rollos del rango está marcado como consumido fuera del ERP',
        );
    }

    const afectados = marcar
      ? rollos.filter((r) => r.estado !== 'CONSUMIDO_FUERA')
      : rollos.filter((r) => r.estado === 'CONSUMIDO_FUERA');

    await this.prisma.rolloPapel.updateMany({
      where: { idRolloPapel: { in: afectados.map((r) => r.idRolloPapel) } },
      data: marcar
        ? {
            estado: 'CONSUMIDO_FUERA',
            consumidoFueraMotivo: dto.motivo!.trim(),
            consumidoFueraPor: idUsuarioActor,
            consumidoFueraEn: new Date(),
          }
        : {
            // Vuelven a bodega: es el único estado desde el que se puede
            // montar, y revertir esto significa justamente "sí estaba".
            estado: 'EN_BODEGA',
            consumidoFueraMotivo: null,
            consumidoFueraPor: null,
            consumidoFueraEn: null,
          },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.rollo_papel',
      idEntidad: String(dto.idFacturaPapel),
      accion: 'UPDATE',
      datosNuevos: {
        accion: marcar ? 'CONSUMIDO_FUERA' : 'REVERTIDO_A_EN_BODEGA',
        numeroFactura: factura.numeroFactura,
        desde: dto.desde,
        hasta: dto.hasta,
        secuencias: afectados.map((r) => r.secuencia),
        motivo: marcar ? dto.motivo!.trim() : null,
      },
    });

    return {
      afectados: afectados.length,
      secuencias: afectados.map((r) => r.secuencia),
      // Los que ya estaban como se pedía: no es un error, pero decirlo evita
      // que alguien crea que marcó 20 cuando 5 ya lo estaban.
      sinCambio: rollos.length - afectados.length,
    };
  }

  /**
   * Asigna la ubicación física a un RANGO de rollos de una factura. Es el
   * único camino (además de elegirla al ingresar) para que un rollo tenga
   * ubicación: sirve tanto para clasificar retroactivamente los que ya
   * existen (NULL) como para corregir una mal puesta.
   *
   * Sin restricciones de estado a propósito, al revés de
   * `marcarConsumidoFuera()`: la ubicación es un hecho físico presente, no
   * una corrección de una captura pasada, así que se puede reasignar aunque
   * el rollo ya esté montado o agotado.
   */
  async asignarUbicacion(dto: AsignarUbicacionDto, idUsuarioActor: number) {
    if (dto.desde > dto.hasta)
      throw new BadRequestException(
        'El rango está invertido: "desde" tiene que ser menor o igual que "hasta"',
      );

    const [factura, ubicacion] = await Promise.all([
      this.prisma.facturaPapel.findUnique({
        where: { idFacturaPapel: dto.idFacturaPapel },
      }),
      this.prisma.ubicacion.findUnique({
        where: { idUbicacion: dto.idUbicacion },
      }),
    ]);
    if (!factura) throw new NotFoundException('Factura de papel no encontrada');
    if (!ubicacion) throw new NotFoundException('Ubicación no encontrada');

    const rollos = await this.prisma.rolloPapel.findMany({
      where: {
        idFacturaPapel: dto.idFacturaPapel,
        secuencia: { gte: dto.desde, lte: dto.hasta },
      },
      orderBy: { secuencia: 'asc' },
    });
    if (rollos.length === 0)
      throw new NotFoundException(
        `La factura ${factura.numeroFactura} no tiene rollos entre el ${dto.desde} y el ${dto.hasta}`,
      );

    const porReasignar = rollos.filter(
      (r) => r.idUbicacion !== dto.idUbicacion,
    );

    if (porReasignar.length > 0) {
      await this.prisma.rolloPapel.updateMany({
        where: {
          idRolloPapel: { in: porReasignar.map((r) => r.idRolloPapel) },
        },
        data: { idUbicacion: dto.idUbicacion },
      });

      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'costeo.rollo_papel',
        idEntidad: String(dto.idFacturaPapel),
        accion: 'UPDATE',
        datosNuevos: {
          accion: 'ASIGNAR_UBICACION',
          numeroFactura: factura.numeroFactura,
          ubicacion: ubicacion.nombre,
          desde: dto.desde,
          hasta: dto.hasta,
          secuencias: porReasignar.map((r) => r.secuencia),
        },
      });
    }

    return {
      afectados: porReasignar.length,
      secuencias: porReasignar.map((r) => r.secuencia),
      // Los que ya estaban en esa ubicación: no es un error, pero decirlo
      // evita confundir "no hizo falta tocarlos" con "no se encontraron".
      sinCambio: rollos.length - porReasignar.length,
    };
  }

  async montar(
    idRolloPapel: number,
    dto: MontarRolloDto,
    idUsuarioActor: number,
  ) {
    const rollo = await this.prisma.rolloPapel.findUnique({
      where: { idRolloPapel },
    });
    if (!rollo) throw new NotFoundException('Rollo no encontrado');
    if (rollo.estado !== 'EN_BODEGA') {
      throw new ConflictException(
        `El rollo está en estado ${rollo.estado}, no se puede montar`,
      );
    }

    const impresora = await this.prisma.impresora.findUnique({
      where: { idImpresora: dto.idImpresora },
    });
    if (!impresora || !impresora.activo) {
      throw new NotFoundException('Impresora no encontrada o inactiva');
    }

    // La impresora tiene que estar libre: hay que desmontar explícitamente.
    //
    // Hasta el 2026-10-09 esto cerraba SOLO el montaje anterior
    // (PROMPT_CLAUDE_CODE.md §6.0). El usuario encontró que eso ocurría en
    // silencio, y los datos le dieron la razón: 2 de 12 montajes quedaron
    // cerrados con `desmontado_por` y `yardas_finales` en NULL, o sea sin que
    // nadie dijera si el rollo se agotó, se descartó o le quedaba papel — que
    // es justamente lo que el desmontaje registra.
    //
    // El auto-cierre no estaba ahí por una regla de negocio: existía para no
    // chocar contra el EXCLUDE USING gist de `montaje_rollo`, que ya impedía
    // dos montajes solapados en la misma impresora. Rechazar es más simple y
    // deja el registro completo.
    const ocupada = await this.prisma.montajeRollo.findFirst({
      where: { idImpresora: dto.idImpresora, desmontadoEn: null },
      include: { rolloPapel: { include: { facturaPapel: true } } },
    });
    if (ocupada) {
      const r = ocupada.rolloPapel;
      const codigo = `${r.facturaPapel.numeroFactura}-${r.facturaPapel.totalRollos}-${r.secuencia}`;
      throw new ConflictException({
        message: `${impresora.codigo} ya tiene montado el rollo ${codigo}. Desmontalo primero desde el Panel de estado, diciendo en qué estado queda.`,
        // Estructurado y no por el texto del mensaje: comparar el texto en el
        // frontend se rompe en cuanto alguien lo reescribe (mismo criterio que
        // SIN_ROLLO_MONTADO y OP_EN_OTRA_EMPRESA).
        motivo: 'IMPRESORA_CON_ROLLO',
        idImpresora: dto.idImpresora,
        impresora: impresora.codigo,
        rollo: codigo,
        idMontajeRollo: ocupada.idMontajeRollo,
      });
    }

    const montaje = await this.prisma.$transaction(async (tx) => {
      const ahora = new Date();

      const nuevo = await tx.montajeRollo.create({
        data: {
          idRolloPapel,
          idImpresora: dto.idImpresora,
          montadoEn: ahora,
          creadoPor: idUsuarioActor,
        },
      });

      await tx.rolloPapel.update({
        where: { idRolloPapel },
        data: { estado: 'MONTADO' },
      });

      return nuevo;
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.montaje_rollo',
      idEntidad: String(montaje.idMontajeRollo),
      accion: 'CREATE',
      datosNuevos: { idRolloPapel, idImpresora: dto.idImpresora },
    });

    return this.detalleMontaje(montaje.idMontajeRollo);
  }

  async desmontar(
    idMontajeRollo: number,
    dto: DesmontarMontajeDto,
    idUsuarioActor: number,
  ) {
    const montaje = await this.prisma.montajeRollo.findUnique({
      where: { idMontajeRollo },
    });
    if (!montaje) throw new NotFoundException('Montaje no encontrado');
    if (montaje.desmontadoEn) {
      throw new ConflictException('Este montaje ya fue desmontado');
    }

    const ahora = new Date();

    // Las yardas finales las calcula el SERVIDOR, no se reciben del cliente.
    //
    // Antes eran la lectura física que tecleaba quien desmontaba, pero el
    // usuario confirmó (2026-10-06) que en planta el rollo **se estima a ojo
    // por el diámetro**: no hay instrumento. Pedir un número de cuatro
    // decimales sobre eso era falsa precisión, y la merma que salía de su
    // diferencia medía en buena parte el pulso de quien estimaba.
    //
    // Se GUARDA aunque sea derivable: congela cuánto quedaba en ESE momento. Si
    // después se cargan consumos con fecha retroactiva contra este montaje,
    // recalcularlo daría otro número y el hecho histórico se perdería.
    //
    // Queda en null si el rollo no trae `yardas_iniciales`: sin ese dato no hay
    // de dónde restar, y null dice "no se sabe" mejor que un 0 inventado.
    const { consumoTotalHistorico } = await this.historialConsumoRollo(
      montaje.idRolloPapel,
    );
    const rollo = await this.prisma.rolloPapel.findUniqueOrThrow({
      where: { idRolloPapel: montaje.idRolloPapel },
      select: { yardasIniciales: true },
    });
    const yardasFinales =
      rollo.yardasIniciales != null
        ? // Lo que quedaba al iniciar este montaje, menos lo consumido en él.
          // Equivale a `yardas_iniciales - consumo de TODOS los montajes`, que
          // es el mismo "Restante" que muestra el panel.
          +(Number(rollo.yardasIniciales) - consumoTotalHistorico).toFixed(4)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.montajeRollo.update({
        where: { idMontajeRollo },
        data: {
          desmontadoEn: ahora,
          yardasFinales,
          desmontadoPor: idUsuarioActor,
        },
      });
      await tx.rolloPapel.update({
        where: { idRolloPapel: montaje.idRolloPapel },
        data: { estado: dto.estado },
      });
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.montaje_rollo',
      idEntidad: String(idMontajeRollo),
      accion: 'UPDATE',
      datosNuevos: {
        desmontadoEn: ahora,
        yardasFinales,
        estadoRollo: dto.estado,
      },
    });

    return this.detalleMontaje(idMontajeRollo);
  }

  // Consumo + merma en vivo (§6.0 punto 3). Un rollo físico puede pasar por
  // varios montajes a lo largo de su vida (se desmonta parcialmente usado,
  // vuelve a bodega, se monta de nuevo después) — por eso "restante" y
  // "merma" no pueden mirar solo el montaje actual: hay que sumar el
  // consumo de TODOS los montajes de ese rollo (historialConsumoRollo).
  // merma = yardas físicamente usadas EN ESTE MONTAJE (lo que tenía el
  // rollo al iniciar este montaje, menos lo que quedó al desmontar) menos
  // lo que sí quedó registrado como consumo real de este montaje — la
  // diferencia es la merma invisible que el modelo legacy no podía
  // calcular (ver CLAUDE.md, ANEXO_A).
  async detalleMontaje(idMontajeRollo: number) {
    const montaje = await this.prisma.montajeRollo.findUnique({
      where: { idMontajeRollo },
      include: {
        rolloPapel: { include: INCLUDE_ROLLO },
        impresora: true,
      },
    });
    if (!montaje) throw new NotFoundException('Montaje no encontrado');

    const { consumoPorMontaje, consumoTotalHistorico } =
      await this.historialConsumoRollo(montaje.idRolloPapel);
    const consumoEsteMontaje = consumoPorMontaje.get(idMontajeRollo) ?? 0;
    const consumoMontajesAnteriores =
      consumoTotalHistorico - consumoEsteMontaje;

    const yardasIniciales = montaje.rolloPapel.yardasIniciales
      ? Number(montaje.rolloPapel.yardasIniciales)
      : null;
    // Lo que quedaba en el rollo al iniciar ESTE montaje — para el primer
    // montaje de un rollo, es igual a yardas_iniciales.
    const yardasAlIniciarEsteMontaje =
      yardasIniciales != null
        ? yardasIniciales - consumoMontajesAnteriores
        : null;
    const yardasRestantesRollo =
      yardasIniciales != null ? yardasIniciales - consumoTotalHistorico : null;

    // `merma` y `yardasUsadasFisicas` SE QUITARON de esta respuesta el
    // 2026-10-06. Desde que `yardas_finales` la calcula el servidor como
    // `iniciales - consumo`, la merma da CERO por construcción —los términos se
    // cancelan—, así que no medía nada y un campo que siempre vale 0 termina
    // en un reporte creyendo que significa algo.
    //
    // La columna `yardas_finales` sigue guardándose, así que si algún día hay
    // un instrumento de medición real en planta, basta volver a recibirla del
    // cliente y estas dos líneas se recuperan tal cual.

    // `creadoPor`/`desmontadoPor` son enteros sin @relation (decisión de F1:
    // evitar ~12 arrays inversos en core.Usuario), así que los nombres se
    // resuelven con una consulta aparte en vez de un include.
    const actores = await this.prisma.usuario.findMany({
      where: {
        idUsuario: {
          in: [montaje.creadoPor, montaje.desmontadoPor].filter(
            (x): x is number => x != null,
          ),
        },
      },
      select: { idUsuario: true, username: true, nombreCompleto: true },
    });
    const porId = new Map(actores.map((u) => [u.idUsuario, u]));

    return {
      ...montaje,
      consumoEsteMontaje,
      consumoTotalHistoricoRollo: consumoTotalHistorico,
      yardasAlIniciarEsteMontaje,
      yardasRestantesRollo,
      montadoPorUsuario: porId.get(montaje.creadoPor) ?? null,
      desmontadoPorUsuario:
        montaje.desmontadoPor != null
          ? (porId.get(montaje.desmontadoPor) ?? null)
          : null,
    };
  }

  /**
   * Historial de montajes: quién montó, quién desmontó y cuánto se consumió en
   * cada sesión. Sin esto el dato existía pero no había dónde verlo — el panel
   * solo muestra el montaje VIGENTE de cada impresora, así que al desmontar el
   * registro desaparecía de la vista.
   *
   * Es también la base del reporte de transacciones que pidió el usuario.
   */
  async historialMontajes(filtro: {
    idImpresora?: number;
    soloAbiertos?: boolean;
    limite?: number;
  }) {
    const montajes = await this.prisma.montajeRollo.findMany({
      where: {
        idImpresora: filtro.idImpresora,
        ...(filtro.soloAbiertos ? { desmontadoEn: null } : {}),
      },
      include: {
        impresora: true,
        rolloPapel: { include: INCLUDE_ROLLO },
      },
      orderBy: { montadoEn: 'desc' },
      take: Math.min(filtro.limite ?? 100, 500),
    });
    if (montajes.length === 0) return { montajes: [] };

    const consumoPor = await this.consumoPorMontajeIds(
      montajes.map((m) => m.idMontajeRollo),
    );

    // Los nombres se resuelven en un solo lote: `creadoPor`/`desmontadoPor` son
    // enteros sin @relation (decisión de F1), así que no se pueden `include`.
    const ids = [
      ...new Set(
        montajes.flatMap((m) =>
          [m.creadoPor, m.desmontadoPor].filter((x): x is number => x != null),
        ),
      ),
    ];
    const usuarios = await this.prisma.usuario.findMany({
      where: { idUsuario: { in: ids } },
      select: { idUsuario: true, username: true, nombreCompleto: true },
    });
    const porId = new Map(usuarios.map((u) => [u.idUsuario, u]));

    return {
      montajes: montajes.map((m) => ({
        idMontajeRollo: m.idMontajeRollo,
        impresora: { idImpresora: m.idImpresora, codigo: m.impresora.codigo },
        rollo: {
          idRolloPapel: m.idRolloPapel,
          codigo: `${m.rolloPapel.facturaPapel.numeroFactura}-${m.rolloPapel.facturaPapel.totalRollos}-${m.rolloPapel.secuencia}`,
          tipoPapel: m.rolloPapel.tipoPapel.nombre,
        },
        montadoEn: m.montadoEn,
        montadoPor: porId.get(m.creadoPor) ?? null,
        desmontadoEn: m.desmontadoEn,
        desmontadoPor:
          m.desmontadoPor != null ? (porId.get(m.desmontadoPor) ?? null) : null,
        yardasFinales: m.yardasFinales ? Number(m.yardasFinales) : null,
        consumoEsteMontaje: consumoPor.get(m.idMontajeRollo) ?? 0,
        /** Lo cerró alguien distinto de quien lo montó. */
        cambioDeTurno:
          m.desmontadoPor != null && m.desmontadoPor !== m.creadoPor,
      })),
    };
  }

  /**
   * Estado del rollo montado en cada una de estas impresoras: qué papel es y
   * cuántas yardas le quedan.
   *
   * Vive acá y lo consume también Impresión de OPs (vía inyección del módulo)
   * en vez de que esa pantalla llame al endpoint `panel()`: de los 7 roles que
   * ven Impresión de OPs, ANALISTA_COSTOS **no** tiene `costeo.rollo.ver`, así
   * que pedirlo desde el navegador le daría 403 y un encabezado vacío. Es la
   * misma lección del reporte de consumo — los datos que una pantalla necesita
   * los devuelve su propio endpoint, no el catálogo de otro módulo.
   *
   * Y es un método compartido, no una copia: el "restante" sale de
   * `consumoPorMontajeIds()`, que suma los tres conceptos y ya es la fuente del
   * panel, del historial y de la merma. Recalcularlo aparte es justo el patrón
   * que hace que dos pantallas muestren números distintos del mismo rollo.
   */
  async estadoDeRollosPorImpresora(idsImpresora: number[]): Promise<
    Map<
      number,
      {
        idMontajeRollo: number;
        tipoPapel: string;
        codigoRollo: string;
        yardasIniciales: number | null;
        /** Puede ser NEGATIVO: el rollo rindió menos de lo que decía el fabricante. */
        yardasRestantesEstimadas: number | null;
        porcentajeRestante: number | null;
      }
    >
  > {
    const ids = [...new Set(idsImpresora)];
    if (ids.length === 0) return new Map();

    const activos = await this.prisma.montajeRollo.findMany({
      where: { idImpresora: { in: ids }, desmontadoEn: null },
      include: { rolloPapel: { include: INCLUDE_ROLLO } },
    });
    if (activos.length === 0) return new Map();

    // TODOS los montajes de esos rollos, no solo el vigente: un rollo puede
    // haberse montado, desmontado a medio usar y vuelto a montar, incluso en
    // otra impresora, así que el consumo histórico es lo que da el restante real.
    const todos = await this.prisma.montajeRollo.findMany({
      where: { idRolloPapel: { in: activos.map((m) => m.idRolloPapel) } },
      select: { idMontajeRollo: true, idRolloPapel: true },
    });
    const consumoPorMontaje = await this.consumoPorMontajeIds(
      todos.map((m) => m.idMontajeRollo),
    );
    const consumoPorRollo = new Map<number, number>();
    for (const m of todos)
      consumoPorRollo.set(
        m.idRolloPapel,
        (consumoPorRollo.get(m.idRolloPapel) ?? 0) +
          (consumoPorMontaje.get(m.idMontajeRollo) ?? 0),
      );

    return new Map(
      activos.map((m) => {
        const iniciales = m.rolloPapel.yardasIniciales
          ? Number(m.rolloPapel.yardasIniciales)
          : null;
        const restante =
          iniciales != null
            ? iniciales - (consumoPorRollo.get(m.idRolloPapel) ?? 0)
            : null;
        return [
          m.idImpresora,
          {
            idMontajeRollo: m.idMontajeRollo,
            tipoPapel: m.rolloPapel.tipoPapel.nombre,
            // Mismo formato que costeo.v_rollo_codigo.
            codigoRollo: `${m.rolloPapel.facturaPapel.numeroFactura}-${m.rolloPapel.facturaPapel.totalRollos}-${m.rolloPapel.secuencia}`,
            yardasIniciales: iniciales,
            yardasRestantesEstimadas: restante,
            porcentajeRestante:
              iniciales != null && iniciales > 0 && restante != null
                ? (restante / iniciales) * 100
                : null,
          },
        ];
      }),
    );
  }

  private async consumoPorMontajeIds(
    idsMontaje: number[],
  ): Promise<Map<number, number>> {
    if (idsMontaje.length === 0) return new Map();
    // anuladoEn: null — una reposición/consumo anulado no debe seguir
    // restando papel del rollo (encontrado al construir la anulación de
    // reposiciones en F3, faltaba este filtro desde F2).
    const filas = await this.prisma.consumoPapel.groupBy({
      by: ['idMontajeRollo'],
      where: { idMontajeRollo: { in: idsMontaje }, anuladoEn: null },
      // Los TRES conceptos salen del rollo montado, confirmado por el usuario
      // (2026-09-30). Antes se restaba solo `consumoYd`, así que el enguiamiento
      // y el papel en blanco —que sí se gastan físicamente— quedaban registrados
      // pero nunca descontados, y terminaban cayendo en la MERMA del desmontaje
      // como si fueran pérdida inexplicada. Con esto la merma vuelve a medir solo
      // lo que de verdad no se puede explicar.
      //
      // Las reposiciones ya se descontaban y siguen igual: escriben su papel en
      // `consumoYd` y esta consulta nunca filtró por `origen`. Sus filas traen
      // enguiamiento y en blanco en 0 (default de la columna), así que sumar los
      // tres campos no las altera.
      _sum: { consumoYd: true, enguiamientoYd: true, enBlancoYd: true },
    });
    return new Map(
      filas.map((f) => [
        f.idMontajeRollo as number,
        Number(f._sum.consumoYd ?? 0) +
          Number(f._sum.enguiamientoYd ?? 0) +
          Number(f._sum.enBlancoYd ?? 0),
      ]),
    );
  }

  // Consumo de un rollo físico a través de TODOS sus montajes (no solo el
  // activo) — un mismo rollo puede montarse, desmontarse parcialmente usado
  // y volver a montarse más tarde, incluso en otra impresora.
  private async historialConsumoRollo(idRolloPapel: number) {
    const montajes = await this.prisma.montajeRollo.findMany({
      where: { idRolloPapel },
      select: { idMontajeRollo: true },
    });
    const consumoPorMontaje = await this.consumoPorMontajeIds(
      montajes.map((m) => m.idMontajeRollo),
    );
    let consumoTotalHistorico = 0;
    for (const c of consumoPorMontaje.values()) consumoTotalHistorico += c;
    return { consumoPorMontaje, consumoTotalHistorico };
  }

  // Panel de estado (§6.0 punto 4): qué rollo está en cada impresora ahora,
  // consumo histórico del rollo y yardas restantes estimadas. El umbral de
  // "alerta de poco papel" no se calcula aquí — no hay una regla de negocio
  // confirmada para eso (ver DesmontarMontajeDto); se expone
  // `porcentajeRestante` para que la UI decida el estilo visual.
  async panel() {
    const impresoras = await this.prisma.impresora.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' },
    });

    const montajesActivos = await this.prisma.montajeRollo.findMany({
      where: { desmontadoEn: null },
      include: { rolloPapel: { include: INCLUDE_ROLLO } },
    });

    if (montajesActivos.length === 0) {
      return impresoras.map((impresora) => ({ impresora, montaje: null }));
    }

    // Todos los montajes (históricos, no solo el activo) de los rollos hoy
    // montados, para que "restante" sea correcto en rollos re-montados.
    const idsRollo = montajesActivos.map((m) => m.idRolloPapel);
    const todosLosMontajes = await this.prisma.montajeRollo.findMany({
      where: { idRolloPapel: { in: idsRollo } },
      select: { idMontajeRollo: true, idRolloPapel: true },
    });
    const consumoPorMontaje = await this.consumoPorMontajeIds(
      todosLosMontajes.map((m) => m.idMontajeRollo),
    );
    const consumoTotalPorRollo = new Map<number, number>();
    for (const m of todosLosMontajes) {
      const consumo = consumoPorMontaje.get(m.idMontajeRollo) ?? 0;
      consumoTotalPorRollo.set(
        m.idRolloPapel,
        (consumoTotalPorRollo.get(m.idRolloPapel) ?? 0) + consumo,
      );
    }

    return impresoras.map((impresora) => {
      const montaje = montajesActivos.find(
        (m) => m.idImpresora === impresora.idImpresora,
      );
      if (!montaje) return { impresora, montaje: null };

      const consumoEsteMontaje =
        consumoPorMontaje.get(montaje.idMontajeRollo) ?? 0;
      const consumoTotalHistoricoRollo =
        consumoTotalPorRollo.get(montaje.idRolloPapel) ?? 0;
      const yardasIniciales = montaje.rolloPapel.yardasIniciales
        ? Number(montaje.rolloPapel.yardasIniciales)
        : null;
      const yardasRestantesEstimadas =
        yardasIniciales != null
          ? yardasIniciales - consumoTotalHistoricoRollo
          : null;
      const porcentajeRestante =
        yardasIniciales != null &&
        yardasIniciales > 0 &&
        yardasRestantesEstimadas != null
          ? (yardasRestantesEstimadas / yardasIniciales) * 100
          : null;

      return {
        impresora,
        montaje: {
          ...montaje,
          consumoEsteMontaje,
          consumoTotalHistoricoRollo,
          yardasRestantesEstimadas,
          porcentajeRestante,
        },
      };
    });
  }

  /**
   * Lo que se ha cargado a bodega, agrupado por NÚMERO de factura.
   *
   * El agrupado no es decorativo: desde que una fila de `factura_papel` es el
   * artículo (número + tipo de papel), una misma factura del proveedor puede
   * tener varios, y verlos juntos es lo que permite contrastarla contra el
   * papel físico que llegó con ella.
   *
   * Cada artículo trae el desglose de estados de SUS rollos, que es la otra
   * mitad de la pregunta: no solo "qué cargué" sino "qué queda de lo que
   * cargué".
   */
  async historialIngresos(filtro: ListarIngresosDto) {
    const limite = filtro.limite ?? 100;
    const texto = filtro.texto?.trim();
    const rango = rangoDeDiasGT(filtro.desde, filtro.hasta);

    const where = {
      ...(texto
        ? { numeroFactura: { contains: texto, mode: 'insensitive' as const } }
        : {}),
      // Por `creadoEn` y no por `fecha`: la pregunta es "qué cargué", no "qué
      // fecha tiene la factura". Una factura de hace un mes cargada hoy tiene
      // que aparecer hoy.
      ...(rango ? { creadoEn: rango } : {}),
    };

    // limite + 1 para saber si quedó algo afuera sin tener que contar aparte.
    const articulos = await this.prisma.facturaPapel.findMany({
      where,
      include: {
        tipoPapel: true,
        rollos: {
          select: {
            idRolloPapel: true,
            estado: true,
            yardasIniciales: true,
            costoUnitario: true,
          },
        },
      },
      orderBy: [{ creadoEn: 'desc' }, { idFacturaPapel: 'desc' }],
      take: limite + 1,
    });
    const truncado = articulos.length > limite;
    const pagina = truncado ? articulos.slice(0, limite) : articulos;

    const nombres = await this.nombresDeUsuarios(
      pagina.map((a) => a.creadoPor),
    );

    // Un solo conteo de montajes para TODOS los rollos de la página: saber si
    // cada factura es editable, de a una, serían N consultas.
    const idsRollo = pagina.flatMap((a) => a.rollos.map((r) => r.idRolloPapel));
    const conMontaje = new Set(
      (
        await this.prisma.montajeRollo.findMany({
          where: { idRolloPapel: { in: idsRollo } },
          select: { idRolloPapel: true },
          distinct: ['idRolloPapel'],
        })
      ).map((m) => m.idRolloPapel),
    );

    const grupos = new Map<
      string,
      {
        numeroFactura: string;
        fecha: Date;
        totalRollos: number;
        articulos: unknown[];
      }
    >();

    for (const a of pagina) {
      const estados: Record<string, number> = {};
      for (const r of a.rollos)
        estados[r.estado] = (estados[r.estado] ?? 0) + 1;

      // Las yardas y el costo se capturan por rollo y `editarIngreso` los deja
      // distintos entre sí, así que un valor único solo se muestra cuando de
      // verdad todos coinciden; si no, null y queda el total.
      const yardas = [
        ...new Set(
          a.rollos.map((r) =>
            r.yardasIniciales == null ? null : Number(r.yardasIniciales),
          ),
        ),
      ];
      const costos = [
        ...new Set(
          a.rollos.map((r) =>
            r.costoUnitario == null ? null : Number(r.costoUnitario),
          ),
        ),
      ];

      const articulo = {
        idFacturaPapel: a.idFacturaPapel,
        tipoPapel: { codigo: a.tipoPapel.codigo, nombre: a.tipoPapel.nombre },
        totalRollos: a.totalRollos,
        yardasPorRollo: yardas.length === 1 ? yardas[0] : null,
        yardasTotales: a.rollos.reduce(
          (t, r) =>
            t + (r.yardasIniciales == null ? 0 : Number(r.yardasIniciales)),
          0,
        ),
        costoUnitario: costos.length === 1 ? costos[0] : null,
        creadoEn: a.creadoEn,
        creadoPor: nombres.get(a.creadoPor) ?? null,
        estados,
        // Misma regla que "Corregir ingreso": en cuanto un rollo se montó
        // alguna vez, la factura queda congelada. Se expone acá para que la
        // pantalla ofrezca corregir solo lo que de verdad se puede.
        editable: a.rollos.every((r) => !conMontaje.has(r.idRolloPapel)),
      };

      const grupo = grupos.get(a.numeroFactura);
      if (grupo) {
        grupo.totalRollos += a.totalRollos;
        grupo.articulos.push(articulo);
      } else {
        grupos.set(a.numeroFactura, {
          numeroFactura: a.numeroFactura,
          fecha: a.fecha,
          totalRollos: a.totalRollos,
          articulos: [articulo],
        });
      }
    }

    return {
      facturas: [...grupos.values()],
      articulos: pagina.length,
      truncado,
      limite,
    };
  }

  /**
   * Inventario de rollos: el estado de TODO el papel, con lo necesario para
   * hacer el conteo físico y para auditar que lo registrado cuadre con lo real.
   *
   * ⚠️ `incluyeCostos` NO es cosmético: la valorización es una divulgación
   * nueva para los roles de planta, que hoy no ven dinero en ninguna pantalla.
   * Se resuelve en el controlador desde `costeo.dashboard.ver_financiero` —
   * permiso OPCIONAL, así que no puede ir en `@RequirePermissions`, que exige
   * TODOS los que lista.
   */
  async inventario(incluyeCostos: boolean) {
    const [rollos, montajes] = await Promise.all([
      this.prisma.rolloPapel.findMany({
        include: { tipoPapel: true, facturaPapel: true, ubicacion: true },
        orderBy: [{ idFacturaPapel: 'asc' }, { secuencia: 'asc' }],
      }),
      this.prisma.montajeRollo.findMany({
        include: { impresora: { select: { codigo: true } } },
        orderBy: { montadoEn: 'asc' },
      }),
    ]);

    // Misma fuente que el panel, el historial y el estimado de Impresión de
    // OPs: `consumoPorMontajeIds`. Recalcular el consumo acá con otra consulta
    // sería una segunda fuente de verdad, y la primera divergencia aparecería
    // justo en el reporte que se usa para auditar.
    const consumoPorMontaje = await this.consumoPorMontajeIds(
      montajes.map((m) => m.idMontajeRollo),
    );
    const consumoPorRollo = new Map<number, number>();
    for (const m of montajes) {
      consumoPorRollo.set(
        m.idRolloPapel,
        (consumoPorRollo.get(m.idRolloPapel) ?? 0) +
          (consumoPorMontaje.get(m.idMontajeRollo) ?? 0),
      );
    }

    const ahora = Date.now();
    const dias = (d: Date) => Math.floor((ahora - d.getTime()) / 86_400_000);

    const detalle = rollos.map((r) => {
      const yardasIniciales =
        r.yardasIniciales == null ? null : Number(r.yardasIniciales);
      const consumidas = consumoPorRollo.get(r.idRolloPapel) ?? 0;
      const costoUnitario =
        r.costoUnitario == null ? null : Number(r.costoUnitario);
      const restante =
        yardasIniciales == null ? null : yardasIniciales - consumidas;
      return {
        idRolloPapel: r.idRolloPapel,
        // Mismo formato que la vista `v_rollo_codigo`, que es lo que viaja a
        // los Google Sheets como NRollo y lo que dice la etiqueta física.
        codigo: `${r.facturaPapel.numeroFactura}-${r.facturaPapel.totalRollos}-${r.secuencia}`,
        numeroFactura: r.facturaPapel.numeroFactura,
        secuencia: r.secuencia,
        tipoPapel: r.tipoPapel.nombre,
        tipoPapelCodigo: r.tipoPapel.codigo,
        // null = todavía sin clasificar — los rollos que ya existían cuando
        // se agregó esta columna arrancan así, y se asignan aparte por rango.
        ubicacion: r.ubicacion?.nombre ?? null,
        estado: r.estado,
        yardasIniciales,
        consumidas,
        restante,
        costoUnitario: incluyeCostos ? costoUnitario : null,
        valor:
          incluyeCostos && restante != null && costoUnitario != null
            ? restante * costoUnitario
            : null,
        // Desde la FECHA DE LA FACTURA y no desde `creadoEn`: lo que interesa
        // es hace cuánto llegó el papel, no hace cuánto se tecleó. Una carga
        // histórica tecleada hoy tiene que mostrar su antigüedad real.
        diasDesdeFactura: dias(r.facturaPapel.fecha),
        consumidoFueraMotivo: r.consumidoFueraMotivo,
      };
    });

    const deEstado = (estado: string) =>
      detalle.filter((d) => d.estado === estado);
    const sumar = (xs: { restante: number | null }[]) =>
      xs.reduce((t, x) => t + (x.restante ?? 0), 0);

    const porEstado = [
      'EN_BODEGA',
      'MONTADO',
      'AGOTADO',
      'DESCARTADO',
      'CONSUMIDO_FUERA',
    ].map((estado) => {
      const xs = deEstado(estado);
      return { estado, rollos: xs.length, yardasRestantes: sumar(xs) };
    });

    const enBodega = deEstado('EN_BODEGA');
    const montados = deEstado('MONTADO');

    // Por tipo de papel: es la respuesta a "¿de qué papel me estoy quedando?",
    // que es para lo que sirve un inventario antes de comprar.
    const tipos = new Map<
      string,
      {
        codigo: string;
        nombre: string;
        rollosEnBodega: number;
        yardasEnBodega: number;
        rollosMontados: number;
        yardasMontadas: number;
        valorEnBodega: number | null;
      }
    >();
    for (const d of [...enBodega, ...montados]) {
      const t = tipos.get(d.tipoPapelCodigo) ?? {
        codigo: d.tipoPapelCodigo,
        nombre: d.tipoPapel,
        rollosEnBodega: 0,
        yardasEnBodega: 0,
        rollosMontados: 0,
        yardasMontadas: 0,
        valorEnBodega: incluyeCostos ? 0 : null,
      };
      if (d.estado === 'EN_BODEGA') {
        t.rollosEnBodega += 1;
        t.yardasEnBodega += d.restante ?? 0;
        if (t.valorEnBodega != null) t.valorEnBodega += d.valor ?? 0;
      } else {
        t.rollosMontados += 1;
        t.yardasMontadas += d.restante ?? 0;
      }
      tipos.set(d.tipoPapelCodigo, t);
    }

    // Por ubicación: sobre TODOS los rollos (no solo bodega), porque la
    // pregunta es "dónde está parado cada uno", y un rollo montado también
    // está en algún lado. `SIN_CLASIFICAR` agrupa los que no tienen ubicación
    // todavía — nunca se reparten entre las conocidas por adivinanza.
    const SIN_CLASIFICAR = 'Sin clasificar';
    const ubicaciones = new Map<
      string,
      { nombre: string; rollos: number; yardas: number }
    >();
    for (const d of detalle) {
      const nombre = d.ubicacion ?? SIN_CLASIFICAR;
      const u = ubicaciones.get(nombre) ?? { nombre, rollos: 0, yardas: 0 };
      u.rollos += 1;
      u.yardas += d.restante ?? 0;
      ubicaciones.set(nombre, u);
    }

    // Antigüedad del stock en bodega: papel parado es dinero parado, y el papel
    // se maltrata con el tiempo.
    const ultimo = CORTES_ANTIGUEDAD[CORTES_ANTIGUEDAD.length - 1];
    const antiguedad = [
      ...CORTES_ANTIGUEDAD.map((corte, i) => ({
        etiqueta:
          i === 0
            ? `Hasta ${corte} días`
            : `${CORTES_ANTIGUEDAD[i - 1] + 1} a ${corte} días`,
        rollos: enBodega.filter(
          (d) =>
            d.diasDesdeFactura <= corte &&
            (i === 0 || d.diasDesdeFactura > CORTES_ANTIGUEDAD[i - 1]),
        ).length,
      })),
      {
        etiqueta: `Más de ${ultimo} días`,
        rollos: enBodega.filter((d) => d.diasDesdeFactura > ultimo).length,
      },
    ];

    const montajesAbiertos = montajes.filter((m) => m.desmontadoEn == null);
    const nombres = await this.nombresDeUsuarios(
      montajesAbiertos.map((m) => m.creadoPor),
    );
    const porRollo = new Map(detalle.map((d) => [d.idRolloPapel, d]));
    const enImpresoras = montajesAbiertos.map((m) => {
      const d = porRollo.get(m.idRolloPapel);
      return {
        impresora: m.impresora.codigo,
        codigo: d?.codigo ?? String(m.idRolloPapel),
        tipoPapel: d?.tipoPapel ?? null,
        montadoEn: m.montadoEn,
        diasMontado: dias(m.montadoEn),
        montadoPor: nombres.get(m.creadoPor) ?? null,
        consumidoEsteMontaje: consumoPorMontaje.get(m.idMontajeRollo) ?? 0,
        restante: d?.restante ?? null,
      };
    });

    return {
      generadoEn: new Date(),
      incluyeCostos,
      resumen: {
        rollosTotales: detalle.length,
        porEstado,
        // "Comprado" sale de las yardas declaradas al ingresar, así que los
        // rollos sin yardas NO suman: por eso se informa cuántos son, para que
        // nadie lea el total como si estuviera completo.
        yardasCompradas: detalle.reduce(
          (t, d) => t + (d.yardasIniciales ?? 0),
          0,
        ),
        yardasConsumidas: detalle.reduce((t, d) => t + d.consumidas, 0),
        yardasEnBodega: sumar(enBodega),
        yardasEnImpresoras: sumar(montados),
        rollosSinYardas: detalle.filter((d) => d.yardasIniciales == null)
          .length,
        valorEnBodega: incluyeCostos
          ? enBodega.reduce((t, d) => t + (d.valor ?? 0), 0)
          : null,
        rollosSinCosto: incluyeCostos
          ? enBodega.filter((d) => d.costoUnitario == null).length
          : null,
      },
      porTipoPapel: [...tipos.values()].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, 'es'),
      ),
      // Sin clasificar siempre al final: es la llamada a la acción, no una
      // ubicación más — mezclada alfabéticamente se perdería de vista.
      porUbicacion: [...ubicaciones.values()].sort((a, b) =>
        a.nombre === SIN_CLASIFICAR
          ? 1
          : b.nombre === SIN_CLASIFICAR
            ? -1
            : a.nombre.localeCompare(b.nombre, 'es'),
      ),
      enBodega,
      enImpresoras,
      senales: {
        antiguedad,
        // Rollos en bodega que ya se usaron en parte. Son los que hay que
        // gastar primero y los más fáciles de perder de vista en el conteo,
        // porque físicamente no parecen un rollo nuevo.
        parciales: enBodega.filter((d) => d.consumidas > TOLERANCIA_YD),
        // Montajes abiertos hace demasiado: ver `DIAS_MONTAJE_LARGO`.
        montajesLargos: enImpresoras.filter(
          (m) => m.diasMontado >= DIAS_MONTAJE_LARGO,
        ),
        // Declarados AGOTADO pero con yardas todavía en libros. NO es merma
        // —esa medición se retiró el 2026-10-06, cuando las yardas finales
        // pasaron a derivarse del propio cálculo—: es consumo que nadie
        // registró, casi siempre órdenes impresas que no se enviaron desde
        // Impresión de OPs.
        agotadosConSaldo: deEstado('AGOTADO').filter(
          (d) => d.restante != null && d.restante > TOLERANCIA_YD,
        ),
        // Papel que se gastó FUERA del ERP. Va aparte de todo lo demás a
        // propósito: su consumo no está registrado acá, así que mezclarlo con
        // los agotados lo haría ver como papel perdido.
        consumidoFuera: {
          rollos: deEstado('CONSUMIDO_FUERA').length,
          yardas: deEstado('CONSUMIDO_FUERA').reduce(
            (t, d) => t + (d.yardasIniciales ?? 0),
            0,
          ),
        },
      },
    };
  }

  /**
   * Nombres de usuario en UN lote.
   *
   * `creadoPor` es un `Int` plano sin `@relation` desde F1 —para no ensuciar
   * `core.Usuario` con ~12 arrays inversos—, así que Prisma no lo resuelve con
   * un `include` y hay que traerlos aparte. En lote y no por fila: el
   * inventario y el historial listan cientos de registros.
   */
  private async nombresDeUsuarios(ids: number[]): Promise<Map<number, string>> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const usuarios = await this.prisma.usuario.findMany({
      where: { idUsuario: { in: unicos } },
      select: { idUsuario: true, username: true, nombreCompleto: true },
    });
    return new Map(
      usuarios.map((u) => [u.idUsuario, u.nombreCompleto || u.username]),
    );
  }

  // ---------------------------------------------------------------------
  // Carga masiva de ingresos a bodega
  //
  // Una fila = una factura + un tipo de papel + una cantidad de rollos, o sea
  // un ARTÍCULO. Se permite repetir la misma factura en varias filas porque una
  // factura real del proveedor puede traer más de un tipo de papel, y cada una
  // crea su propia fila de `factura_papel` con sus rollos numerados DESDE 1 —
  // así el código del rollo coincide con la etiqueta física. (Hasta el
  // 2026-10-11 se agrupaban en una sola factura con las secuencias corridas
  // entre tipos, que es justamente el defecto que eso corrigió.)
  // ---------------------------------------------------------------------

  async plantillaImportarIngresos(): Promise<ExcelJS.Buffer> {
    const tipos = await this.prisma.tipoPapel.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Ingresos');
    ws.mergeCells(1, 1, 1, 6);
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Ingreso de rollos de papel a bodega';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells(2, 1, 2, 6);
    ws.getCell('A2').value =
      'Una fila por factura + tipo de papel. Si una misma factura trae varios tipos de papel, repetí el número de factura en una fila por cada tipo (con la misma fecha) — se cargan como una sola factura. ' +
      'El código de tipo de papel debe existir en el catálogo (ver la hoja "Tipos de papel"); si no existe, la fila queda pendiente y no se crea nada automáticamente. ' +
      'Una factura cuyo número ya esté cargado se rechaza: para corregirla, usá la pestaña "Corregir ingreso". ' +
      '"Yardas por rollo" y "Costo unitario" son opcionales — en blanco quedan sin dato y se pueden completar después.';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };

    const headerRow = ws.getRow(4);
    headerRow.values = [
      'Número de factura',
      'Fecha',
      'Tipo de papel (código)',
      'Cantidad de rollos',
      'Yardas por rollo (opcional)',
      'Costo unitario (opcional)',
    ];
    headerRow.eachCell(estiloEncabezado);
    [22, 14, 24, 18, 22, 22].forEach((w, i) => (ws.getColumn(i + 1).width = w));

    // Hoja de referencia: sin esto hay que adivinar los códigos, que es justo
    // lo que deja filas pendientes.
    const wsRef = wb.addWorksheet('Tipos de papel');
    const refHeader = wsRef.getRow(1);
    refHeader.values = ['Código', 'Nombre', 'Gramaje', 'Ancho (pulgadas)'];
    refHeader.eachCell(estiloEncabezado);
    [24, 40, 12, 16].forEach((w, i) => (wsRef.getColumn(i + 1).width = w));
    tipos.forEach((t) =>
      wsRef.addRow([
        t.codigo,
        t.nombre,
        t.gramaje ? Number(t.gramaje) : null,
        t.anchoPulgadas ? Number(t.anchoPulgadas) : null,
      ]),
    );

    return wb.xlsx.writeBuffer();
  }

  async previewImportarIngresos(
    buffer: Buffer,
  ): Promise<{ filas: FilaPreviewIngresoRollo[] }> {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');

    const crudo: {
      fila: number;
      numeroFactura: string;
      fecha: Date | null;
      // El texto crudo distingue "celda vacía" de "tenía algo que no se pudo
      // interpretar como fecha": fechaCelda() devuelve null en ambos casos y
      // un typo pasaría por campo faltante en vez de por dato mal escrito.
      fechaTexto: string;
      tipoPapelCodigo: string;
      cantidad: number | null;
      yardas: number | null;
      costo: number | null;
    }[] = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber < FILA_INICIO_DATOS) return;
      const numeroFactura = textoCelda(row.getCell(1).value).trim();
      if (!numeroFactura) return;
      const celdaFecha = row.getCell(2).value;
      crudo.push({
        fila: rowNumber,
        numeroFactura,
        fecha: fechaCelda(celdaFecha),
        fechaTexto: textoCelda(celdaFecha).trim(),
        tipoPapelCodigo: textoCelda(row.getCell(3).value).trim(),
        cantidad: numeroCelda(row.getCell(4).value),
        yardas: numeroCelda(row.getCell(5).value),
        costo: numeroCelda(row.getCell(6).value),
      });
    });

    const [tipos, facturasExistentes] = await Promise.all([
      this.prisma.tipoPapel.findMany({
        where: { activo: true },
        select: { idTipoPapel: true, codigo: true, nombre: true },
      }),
      this.prisma.facturaPapel.findMany({
        select: { numeroFactura: true, idTipoPapel: true },
      }),
    ]);
    const tipoPorCodigo = new Map(
      tipos.map((t) => [t.codigo.toLowerCase(), t]),
    );
    // La clave es (número, tipo de papel), no el número solo: el mismo número
    // puede estar cargado con otro artículo y eso no lo convierte en duplicado.
    const facturasEnBase = new Set(
      facturasExistentes.map(
        (f) => `${f.numeroFactura.toLowerCase()}|${f.idTipoPapel}`,
      ),
    );

    // Fecha por factura dentro del archivo: dos filas de la misma factura con
    // fechas distintas son un error de tecleo, no dos facturas.
    const fechaPorFactura = new Map<string, string>();
    // El mismo (factura, tipo de papel) dos veces en el archivo: cada par es
    // UN artículo, así que dos filas son el mismo artículo cargado dos veces
    // —aunque traigan cantidades distintas—. Antes se agrupaban y los rollos
    // salían numerados de corrido entre los dos, con códigos que no coincidían
    // con la etiqueta física. Repetir la factura con OTRO tipo de papel sí es
    // válido y no se marca: es justamente el caso que esto viene a permitir.
    const vistas = new Set<string>();

    const filas: FilaPreviewIngresoRollo[] = crudo.map((c) => {
      const tipo = tipoPorCodigo.get(c.tipoPapelCodigo.toLowerCase());
      const claveFactura = c.numeroFactura.toLowerCase();
      let error: string | null = null;

      if (c.numeroFactura.length > 30)
        error = 'El número de factura no puede pasar de 30 caracteres';
      else if (!c.fecha)
        error = c.fechaTexto
          ? `"Fecha" no se pudo interpretar como fecha: "${c.fechaTexto}"`
          : 'Falta la fecha';
      else if (!c.tipoPapelCodigo) error = 'Falta el código de tipo de papel';
      else if (!tipo)
        error = `El tipo de papel "${c.tipoPapelCodigo}" no existe o está inactivo`;
      else if (c.cantidad === null) error = 'Falta la cantidad de rollos';
      else if (!Number.isInteger(c.cantidad) || c.cantidad <= 0)
        error = 'La cantidad de rollos debe ser un entero mayor que cero';
      else if (c.yardas !== null && (Number.isNaN(c.yardas) || c.yardas <= 0))
        error = 'Las yardas por rollo deben ser un número mayor que cero';
      else if (c.costo !== null && (Number.isNaN(c.costo) || c.costo < 0))
        error = 'El costo unitario no puede ser negativo';
      else if (facturasEnBase.has(`${claveFactura}|${tipo.idTipoPapel}`))
        error = `La factura "${c.numeroFactura}" ya está cargada con ${tipo.nombre} — corregila desde "Corregir ingreso"`;

      const fechaIso = c.fecha ? c.fecha.toISOString().slice(0, 10) : '';

      if (!error) {
        const fechaPrevia = fechaPorFactura.get(claveFactura);
        if (fechaPrevia && fechaPrevia !== fechaIso)
          error = `La factura "${c.numeroFactura}" aparece con dos fechas distintas en el archivo`;
        else fechaPorFactura.set(claveFactura, fechaIso);
      }

      if (!error) {
        const huella = `${claveFactura}|${c.tipoPapelCodigo.toLowerCase()}`;
        if (vistas.has(huella))
          error = `La factura "${c.numeroFactura}" aparece dos veces con el mismo tipo de papel — juntá las cantidades en una sola fila`;
        else vistas.add(huella);
      }

      return {
        fila: c.fila,
        numeroFactura: c.numeroFactura,
        fecha: fechaIso,
        fechaTexto: c.fechaTexto,
        tipoPapelCodigo: c.tipoPapelCodigo,
        tipoPapelNombre: tipo?.nombre ?? null,
        cantidadRollos: c.cantidad,
        yardasPorRollo: c.yardas,
        costoUnitario: c.costo,
        error,
      };
    });

    return { filas };
  }

  async aplicarImportarIngresos(
    filas: FilaAplicarIngresoRolloDto[],
    idUsuarioActor: number,
  ) {
    if (filas.length === 0)
      throw new BadRequestException('No hay filas para aplicar');

    // Todo se re-resuelve acá: el preview corre en el servidor pero su salida
    // pasa por el navegador, así que ni el tipo de papel ni la inexistencia de
    // la factura pueden darse por buenos.
    const tipos = await this.prisma.tipoPapel.findMany({
      where: { activo: true },
      select: { idTipoPapel: true, codigo: true, nombre: true },
    });
    const tipoPorCodigo = new Map(
      tipos.map((t) => [t.codigo.toLowerCase(), t]),
    );
    const tipoPorId = new Map(tipos.map((t) => [t.idTipoPapel, t]));

    // Una fila del archivo = un ARTÍCULO = una fila de `factura_papel`, con sus
    // rollos numerados desde 1. Antes se agrupaba por número de factura y los
    // dos tipos de papel caían en una sola factura con las secuencias corridas
    // entre ambos (1..68 para 48 + 20), así que el código del rollo no
    // coincidía con la etiqueta física del segundo artículo.
    const porArticulo = new Map<
      string,
      {
        numeroFactura: string;
        idTipoPapel: number;
        fecha: Date;
        fila: FilaAplicarIngresoRolloDto;
      }
    >();
    // La fecha sí es de la FACTURA, no del artículo: dos artículos del mismo
    // número con fechas distintas son un error de tecleo.
    const fechaPorNumero = new Map<string, Date>();

    for (const f of filas) {
      const tipo = tipoPorCodigo.get(f.tipoPapelCodigo.toLowerCase());
      if (!tipo)
        throw new BadRequestException(
          `El tipo de papel "${f.tipoPapelCodigo}" no existe o está inactivo`,
        );
      const fecha = new Date(f.fecha);
      if (Number.isNaN(fecha.getTime()))
        throw new BadRequestException(
          `Fecha inválida en la factura "${f.numeroFactura}"`,
        );
      const numero = f.numeroFactura.toLowerCase();
      const fechaPrevia = fechaPorNumero.get(numero);
      if (fechaPrevia && fechaPrevia.getTime() !== fecha.getTime())
        throw new BadRequestException(
          `La factura "${f.numeroFactura}" viene con dos fechas distintas`,
        );
      fechaPorNumero.set(numero, fecha);

      const clave = `${numero}|${tipo.idTipoPapel}`;
      if (porArticulo.has(clave))
        throw new BadRequestException(
          `La factura "${f.numeroFactura}" viene dos veces con el mismo tipo de papel (${tipo.nombre}): juntá las cantidades en una sola fila`,
        );
      porArticulo.set(clave, {
        numeroFactura: f.numeroFactura,
        idTipoPapel: tipo.idTipoPapel,
        fecha,
        fila: f,
      });
    }

    const articulos = [...porArticulo.values()];

    const yaExisten = await this.prisma.facturaPapel.findMany({
      where: {
        OR: articulos.map((a) => ({
          numeroFactura: a.numeroFactura,
          idTipoPapel: a.idTipoPapel,
        })),
      },
      select: { numeroFactura: true, idTipoPapel: true },
    });
    if (yaExisten.length > 0)
      throw new ConflictException(
        `Ya están cargados estos ingresos: ${yaExisten
          .map(
            (f) =>
              `${f.numeroFactura} con ${tipoPorId.get(f.idTipoPapel)?.nombre ?? `tipo ${f.idTipoPapel}`}`,
          )
          .join(', ')}`,
      );

    const creadas = await this.prisma.$transaction(async (tx) => {
      const ids: {
        idFacturaPapel: number;
        numeroFactura: string;
        idTipoPapel: number;
      }[] = [];
      for (const a of articulos) {
        const factura = await tx.facturaPapel.create({
          data: {
            numeroFactura: a.numeroFactura,
            idTipoPapel: a.idTipoPapel,
            fecha: a.fecha,
            totalRollos: a.fila.cantidadRollos,
            creadoPor: idUsuarioActor,
          },
        });
        await tx.rolloPapel.createMany({
          data: Array.from({ length: a.fila.cantidadRollos }, (_, i) => ({
            idFacturaPapel: factura.idFacturaPapel,
            secuencia: i + 1,
            idTipoPapel: a.idTipoPapel,
            yardasIniciales: a.fila.yardasPorRollo ?? null,
            costoUnitario: a.fila.costoUnitario ?? null,
          })),
        });
        ids.push({
          idFacturaPapel: factura.idFacturaPapel,
          numeroFactura: factura.numeroFactura,
          idTipoPapel: factura.idTipoPapel,
        });
      }
      return ids;
    });

    for (const c of creadas) {
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'costeo.factura_papel',
        idEntidad: String(c.idFacturaPapel),
        accion: 'CREATE',
        datosNuevos: {
          numeroFactura: c.numeroFactura,
          tipoPapel: tipoPorId.get(c.idTipoPapel)?.nombre,
          origen: 'import',
        },
      });
    }

    return {
      facturas: creadas.length,
      rollos: filas.reduce((a, f) => a + f.cantidadRollos, 0),
    };
  }
}
