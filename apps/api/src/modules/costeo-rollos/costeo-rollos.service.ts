import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { fechaCelda, textoCelda } from '../../common/excel-celda';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { FilaPreviewIngresoRollo } from './costeo-rollos.types';
import { FilaAplicarIngresoRolloDto } from './dto/aplicar-importar-ingresos.dto';
import { DesmontarMontajeDto } from './dto/desmontar-montaje.dto';
import { EditarIngresoDto } from './dto/editar-ingreso.dto';
import { IngresoFacturaPapelDto } from './dto/ingreso-factura-papel.dto';
import { ListarRollosDto } from './dto/listar-rollos.dto';
import { MontarRolloDto } from './dto/montar-rollo.dto';

const INCLUDE_ROLLO = { tipoPapel: true, facturaPapel: true } as const;

const AZUL_DIGITEXSA = 'FF203080';

// La plantilla lleva 4 filas de preámbulo (título, instrucciones, blanco,
// encabezado) antes de los datos. Arrancar en la 2 leería las instrucciones
// como si fueran una fila — bug real que ya apareció en los otros imports del
// proyecto y por eso todos comparten esta constante.
const FILA_INICIO_DATOS = 5;

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
    const tipoPapel = await this.prisma.tipoPapel.findUnique({
      where: { idTipoPapel: dto.idTipoPapel },
    });
    if (!tipoPapel) throw new NotFoundException('Tipo de papel no encontrado');

    const existente = await this.prisma.facturaPapel.findUnique({
      where: { numeroFactura: dto.numeroFactura },
    });
    if (existente) {
      throw new ConflictException(
        'Ya existe una factura de papel con ese número',
      );
    }

    const factura = await this.prisma.$transaction(async (tx) => {
      const factura = await tx.facturaPapel.create({
        data: {
          numeroFactura: dto.numeroFactura,
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
        idTipoPapel: dto.idTipoPapel,
      },
    });

    return this.obtenerFactura(factura.idFacturaPapel);
  }

  async obtenerFactura(idFacturaPapel: number) {
    const factura = await this.prisma.facturaPapel.findUnique({
      where: { idFacturaPapel },
      include: {
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

  async buscarFacturaPorNumero(numeroFactura: string) {
    const factura = await this.prisma.facturaPapel.findUnique({
      where: { numeroFactura },
    });
    if (!factura)
      throw new NotFoundException(
        'No existe ninguna factura de papel con ese número',
      );
    return this.obtenerFactura(factura.idFacturaPapel);
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

    const idsTipoPapel = [...new Set(dto.rollos.map((r) => r.idTipoPapel))];
    const tiposPapelValidos = await this.prisma.tipoPapel.count({
      where: { idTipoPapel: { in: idsTipoPapel } },
    });
    if (tiposPapelValidos !== idsTipoPapel.length) {
      throw new BadRequestException(
        'Uno de los tipos de papel indicados no existe',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.numeroFactura != null || dto.fecha != null) {
        await tx.facturaPapel.update({
          where: { idFacturaPapel },
          data: {
            numeroFactura: dto.numeroFactura,
            fecha: dto.fecha ? new Date(dto.fecha) : undefined,
          },
        });
      }
      for (const r of dto.rollos) {
        await tx.rolloPapel.update({
          where: { idRolloPapel: r.idRolloPapel },
          data: {
            idTipoPapel: r.idTipoPapel,
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
        fecha: dto.fecha,
        rollos: dto.rollos,
      },
    });

    return this.obtenerFactura(idFacturaPapel);
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

    const montaje = await this.prisma.$transaction(async (tx) => {
      const ahora = new Date();

      // Cierra automáticamente el montaje anterior de esa impresora, si lo
      // había (PROMPT_CLAUDE_CODE.md §6.0) — sin esto, el EXCLUDE USING gist
      // de montaje_rollo rechazaría este INSERT. yardas_finales queda NULL
      // (no se inventa una lectura) y el rollo anterior vuelve a EN_BODEGA,
      // no AGOTADO — no hay evidencia de que se haya terminado, solo de que
      // se cambió sin pasar por el flujo formal de desmontaje.
      const montajeActivo = await tx.montajeRollo.findFirst({
        where: { idImpresora: dto.idImpresora, desmontadoEn: null },
      });
      if (montajeActivo) {
        await tx.montajeRollo.update({
          where: { idMontajeRollo: montajeActivo.idMontajeRollo },
          data: { desmontadoEn: ahora },
        });
        await tx.rolloPapel.update({
          where: { idRolloPapel: montajeActivo.idRolloPapel },
          data: { estado: 'EN_BODEGA' },
        });
      }

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

    await this.prisma.$transaction(async (tx) => {
      await tx.montajeRollo.update({
        where: { idMontajeRollo },
        data: {
          desmontadoEn: ahora,
          yardasFinales: dto.yardasFinales,
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
        yardasFinales: dto.yardasFinales,
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

    const yardasFinales = montaje.yardasFinales
      ? Number(montaje.yardasFinales)
      : null;
    const yardasUsadasFisicas =
      yardasAlIniciarEsteMontaje != null && yardasFinales != null
        ? yardasAlIniciarEsteMontaje - yardasFinales
        : null;
    const merma =
      yardasUsadasFisicas != null
        ? yardasUsadasFisicas - consumoEsteMontaje
        : null;

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
      yardasUsadasFisicas,
      merma,
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
      _sum: { consumoYd: true },
    });
    return new Map(
      filas.map((f) => [
        f.idMontajeRollo as number,
        Number(f._sum.consumoYd ?? 0),
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

  // ---------------------------------------------------------------------
  // Carga masiva de ingresos a bodega
  //
  // Una fila = una factura + un tipo de papel + una cantidad de rollos. Se
  // permite repetir la misma factura en varias filas porque una factura real
  // del proveedor puede traer más de un tipo de papel; al aplicar, las filas
  // de una misma factura se agrupan en un solo `factura_papel` y sus rollos
  // se numeran corridos.
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
      this.prisma.facturaPapel.findMany({ select: { numeroFactura: true } }),
    ]);
    const tipoPorCodigo = new Map(
      tipos.map((t) => [t.codigo.toLowerCase(), t]),
    );
    const facturasEnBase = new Set(
      facturasExistentes.map((f) => f.numeroFactura.toLowerCase()),
    );

    // Fecha por factura dentro del archivo: dos filas de la misma factura con
    // fechas distintas son un error de tecleo, no dos facturas.
    const fechaPorFactura = new Map<string, string>();
    // Fila completa repetida: casi siempre es una fila pegada dos veces, que
    // duplicaría los rollos en silencio. Repetir la factura con OTRO tipo de
    // papel (o con otra cantidad) sí es válido y no se marca.
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
      else if (facturasEnBase.has(claveFactura))
        error = `La factura "${c.numeroFactura}" ya está cargada — corregila desde "Corregir ingreso"`;

      const fechaIso = c.fecha ? c.fecha.toISOString().slice(0, 10) : '';

      if (!error) {
        const fechaPrevia = fechaPorFactura.get(claveFactura);
        if (fechaPrevia && fechaPrevia !== fechaIso)
          error = `La factura "${c.numeroFactura}" aparece con dos fechas distintas en el archivo`;
        else fechaPorFactura.set(claveFactura, fechaIso);
      }

      if (!error) {
        const huella = [
          claveFactura,
          c.tipoPapelCodigo.toLowerCase(),
          c.cantidad,
          c.yardas,
          c.costo,
        ].join('|');
        if (vistas.has(huella)) error = 'Fila repetida dentro del archivo';
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
      select: { idTipoPapel: true, codigo: true },
    });
    const tipoPorCodigo = new Map(
      tipos.map((t) => [t.codigo.toLowerCase(), t.idTipoPapel]),
    );

    const porFactura = new Map<
      string,
      {
        numeroFactura: string;
        fecha: Date;
        grupos: { idTipoPapel: number; fila: FilaAplicarIngresoRolloDto }[];
      }
    >();

    for (const f of filas) {
      const idTipoPapel = tipoPorCodigo.get(f.tipoPapelCodigo.toLowerCase());
      if (!idTipoPapel)
        throw new BadRequestException(
          `El tipo de papel "${f.tipoPapelCodigo}" no existe o está inactivo`,
        );
      const fecha = new Date(f.fecha);
      if (Number.isNaN(fecha.getTime()))
        throw new BadRequestException(
          `Fecha inválida en la factura "${f.numeroFactura}"`,
        );
      const clave = f.numeroFactura.toLowerCase();
      const actual = porFactura.get(clave);
      if (!actual) {
        porFactura.set(clave, {
          numeroFactura: f.numeroFactura,
          fecha,
          grupos: [{ idTipoPapel, fila: f }],
        });
      } else {
        if (actual.fecha.getTime() !== fecha.getTime())
          throw new BadRequestException(
            `La factura "${f.numeroFactura}" viene con dos fechas distintas`,
          );
        actual.grupos.push({ idTipoPapel, fila: f });
      }
    }

    const yaExisten = await this.prisma.facturaPapel.findMany({
      where: {
        numeroFactura: {
          in: [...porFactura.values()].map((v) => v.numeroFactura),
        },
      },
      select: { numeroFactura: true },
    });
    if (yaExisten.length > 0)
      throw new ConflictException(
        `Ya existen estas facturas: ${yaExisten.map((f) => f.numeroFactura).join(', ')}`,
      );

    const creadas = await this.prisma.$transaction(async (tx) => {
      const ids: { idFacturaPapel: number; numeroFactura: string }[] = [];
      for (const v of porFactura.values()) {
        const totalRollos = v.grupos.reduce(
          (a, g) => a + g.fila.cantidadRollos,
          0,
        );
        const factura = await tx.facturaPapel.create({
          data: {
            numeroFactura: v.numeroFactura,
            fecha: v.fecha,
            totalRollos,
            creadoPor: idUsuarioActor,
          },
        });
        let secuencia = 0;
        const rollos = v.grupos.flatMap((g) =>
          Array.from({ length: g.fila.cantidadRollos }, () => ({
            idFacturaPapel: factura.idFacturaPapel,
            secuencia: ++secuencia,
            idTipoPapel: g.idTipoPapel,
            yardasIniciales: g.fila.yardasPorRollo ?? null,
            costoUnitario: g.fila.costoUnitario ?? null,
          })),
        );
        await tx.rolloPapel.createMany({ data: rollos });
        ids.push({
          idFacturaPapel: factura.idFacturaPapel,
          numeroFactura: factura.numeroFactura,
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
        datosNuevos: { numeroFactura: c.numeroFactura, origen: 'import' },
      });
    }

    return {
      facturas: creadas.length,
      rollos: filas.reduce((a, f) => a + f.cantidadRollos, 0),
    };
  }
}
