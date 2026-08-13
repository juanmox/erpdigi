import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DesmontarMontajeDto } from './dto/desmontar-montaje.dto';
import { EditarIngresoDto } from './dto/editar-ingreso.dto';
import { IngresoFacturaPapelDto } from './dto/ingreso-factura-papel.dto';
import { ListarRollosDto } from './dto/listar-rollos.dto';
import { MontarRolloDto } from './dto/montar-rollo.dto';

const INCLUDE_ROLLO = { tipoPapel: true, facturaPapel: true } as const;

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
        data: { desmontadoEn: ahora, yardasFinales: dto.yardasFinales },
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

    return {
      ...montaje,
      consumoEsteMontaje,
      consumoTotalHistoricoRollo: consumoTotalHistorico,
      yardasAlIniciarEsteMontaje,
      yardasRestantesRollo,
      yardasUsadasFisicas,
      merma,
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
}
