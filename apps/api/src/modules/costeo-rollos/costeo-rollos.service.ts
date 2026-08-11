import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DesmontarMontajeDto } from './dto/desmontar-montaje.dto';
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
      orderBy: { codigo: 'asc' },
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
    return factura;
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

  // Consumo acumulado + merma en vivo (§6.0 punto 3). merma = yardas
  // físicamente usadas (iniciales − finales) menos lo que sí quedó
  // registrado como consumo real — la diferencia es la merma invisible que
  // el modelo legacy no podía calcular (ver CLAUDE.md, ANEXO_A).
  async detalleMontaje(idMontajeRollo: number) {
    const montaje = await this.prisma.montajeRollo.findUnique({
      where: { idMontajeRollo },
      include: {
        rolloPapel: { include: INCLUDE_ROLLO },
        impresora: true,
      },
    });
    if (!montaje) throw new NotFoundException('Montaje no encontrado');

    const consumoAcumulado = await this.consumoAcumulado(idMontajeRollo);
    const yardasIniciales = montaje.rolloPapel.yardasIniciales
      ? Number(montaje.rolloPapel.yardasIniciales)
      : null;
    const yardasFinales = montaje.yardasFinales
      ? Number(montaje.yardasFinales)
      : null;
    const yardasUsadasFisicas =
      yardasIniciales != null && yardasFinales != null
        ? yardasIniciales - yardasFinales
        : null;
    const merma =
      yardasUsadasFisicas != null
        ? yardasUsadasFisicas - consumoAcumulado
        : null;

    return { ...montaje, consumoAcumulado, yardasUsadasFisicas, merma };
  }

  private async consumoAcumulado(idMontajeRollo: number): Promise<number> {
    const resultado = await this.prisma.consumoPapel.aggregate({
      where: { idMontajeRollo },
      _sum: { consumoYd: true },
    });
    return Number(resultado._sum.consumoYd ?? 0);
  }

  // Panel de estado (§6.0 punto 4): qué rollo está en cada impresora ahora,
  // consumo acumulado y yardas restantes estimadas. El umbral de "alerta de
  // poco papel" no se calcula aquí — no hay una regla de negocio confirmada
  // para eso (ver DesmontarMontajeDto); se expone `porcentajeRestante` para
  // que la UI decida el estilo visual.
  async panel() {
    const impresoras = await this.prisma.impresora.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
    });

    const montajesActivos = await this.prisma.montajeRollo.findMany({
      where: { desmontadoEn: null },
      include: { rolloPapel: { include: INCLUDE_ROLLO } },
    });

    const consumos =
      montajesActivos.length > 0
        ? await this.prisma.consumoPapel.groupBy({
            by: ['idMontajeRollo'],
            where: {
              idMontajeRollo: {
                in: montajesActivos.map((m) => m.idMontajeRollo),
              },
            },
            _sum: { consumoYd: true },
          })
        : [];
    const consumoPorMontaje = new Map(
      consumos.map((c) => [c.idMontajeRollo, Number(c._sum.consumoYd ?? 0)]),
    );

    return impresoras.map((impresora) => {
      const montaje = montajesActivos.find(
        (m) => m.idImpresora === impresora.idImpresora,
      );
      if (!montaje) return { impresora, montaje: null };

      const consumoAcumulado =
        consumoPorMontaje.get(montaje.idMontajeRollo) ?? 0;
      const yardasIniciales = montaje.rolloPapel.yardasIniciales
        ? Number(montaje.rolloPapel.yardasIniciales)
        : null;
      const yardasRestantesEstimadas =
        yardasIniciales != null ? yardasIniciales - consumoAcumulado : null;
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
          consumoAcumulado,
          yardasRestantesEstimadas,
          porcentajeRestante,
        },
      };
    });
  }
}
