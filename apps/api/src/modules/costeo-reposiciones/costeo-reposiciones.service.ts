import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parsearCodigoOp } from '../../common/op-codigo';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AnularReposicionDto } from './dto/anular-reposicion.dto';
import { CrearReposicionDto } from './dto/crear-reposicion.dto';

const INCLUDE_REPOSICION = {
  departamento: true,
  defecto: true,
  empleado: true,
  impresora: true,
  calandra: true,
  tipoPapel: true,
  insumoTela: true,
  ordenProduccion: { include: { cliente: true, lineaProducto: true } },
} as const;

@Injectable()
export class CosteoReposicionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  listarDepartamentos() {
    return this.prisma.departamento.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  listarDefectos() {
    return this.prisma.defecto.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  listarCalandras() {
    return this.prisma.calandra.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
    });
  }

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
    if (!orden)
      throw new NotFoundException(
        `No existe la orden de producción ${codigoOp}`,
      );
    return orden;
  }

  async siguienteNumero(codigoOp: string) {
    const orden = await this.resolverOrden(codigoOp);
    const agg = await this.prisma.reposicion.aggregate({
      where: { idOrdenProduccion: orden.idOrdenProduccion },
      _max: { numeroRepo: true },
    });
    return {
      siguienteNumero: (agg._max.numeroRepo ?? 0) + 1,
      cliente: orden.cliente?.nombre ?? null,
      lineaProducto: orden.lineaProducto?.nombre ?? null,
    };
  }

  listar(idOrdenProduccion?: number) {
    return this.prisma.reposicion.findMany({
      where: { idOrdenProduccion },
      include: INCLUDE_REPOSICION,
      orderBy: { fecha: 'desc' },
    });
  }

  async obtener(idReposicion: number) {
    const reposicion = await this.prisma.reposicion.findUnique({
      where: { idReposicion },
      include: INCLUDE_REPOSICION,
    });
    if (!reposicion) throw new NotFoundException('Reposición no encontrada');
    return reposicion;
  }

  // Corrección #1 de §6.1: el NRollo/tipo de papel nunca se buscan a mano ni
  // se teclean — se resuelven en el servidor vía fn_rollo_en(impresora,
  // fecha), la misma función corregida antes de F2. Si la impresora no
  // tiene rollo montado en ese instante, se rechaza — nunca se guarda una
  // reposición con el rollo indeterminado (reemplaza el "Buscando..." del
  // legacy por "se resuelve exacto, o se rechaza").
  async crear(dto: CrearReposicionDto, idUsuarioActor: number) {
    const orden = await this.resolverOrden(dto.codigoOp);
    const fecha = new Date(dto.fecha);
    const yardasPapel = dto.yardasPapel ?? 0;

    const idReposicion = await this.prisma.$transaction(async (tx) => {
      let idMontajeRollo: number | null = null;
      let idTipoPapel: number | null = null;

      if (dto.idImpresora != null) {
        const resultado = await tx.$queryRaw<{ id_montaje: number | null }[]>`
          SELECT costeo.fn_rollo_en(${dto.idImpresora}, ${fecha}::timestamptz) AS id_montaje
        `;
        idMontajeRollo = resultado[0]?.id_montaje ?? null;
        if (idMontajeRollo == null) {
          throw new ConflictException(
            'Esta impresora no tiene ningún rollo montado en ese momento',
          );
        }
        const montaje = await tx.montajeRollo.findUniqueOrThrow({
          where: { idMontajeRollo },
          include: { rolloPapel: true },
        });
        idTipoPapel = montaje.rolloPapel.idTipoPapel;
      }

      // MAX+1 calculado dentro de la misma transacción — el UNIQUE
      // (id_orden_produccion, numero_repo) es la garantía real ante
      // concurrencia, esto solo evita colisiones en el caso común.
      const agg = await tx.reposicion.aggregate({
        where: { idOrdenProduccion: orden.idOrdenProduccion },
        _max: { numeroRepo: true },
      });
      const numeroRepo = (agg._max.numeroRepo ?? 0) + 1;

      const reposicion = await tx.reposicion.create({
        data: {
          fecha,
          idOrdenProduccion: orden.idOrdenProduccion,
          numeroRepo,
          idDepartamento: dto.idDepartamento,
          idEmpleado: dto.idEmpleado ?? null,
          idDefecto: dto.idDefecto,
          bodegaSac: dto.bodegaSac ?? null,
          idImpresora: dto.idImpresora ?? null,
          idCalandra: dto.idCalandra ?? null,
          idMontajeRollo,
          idTipoPapel,
          yardasPapel,
          idInsumoTela: dto.idInsumoTela ?? null,
          yardasTela: dto.yardasTela ?? 0,
          comentario: dto.comentario ?? null,
          creadoPor: idUsuarioActor,
        },
      });

      // Si la reposición sí consumió papel de un rollo resuelto, queda
      // registrada también como hecho de consumo — es lo que permite que
      // el panel de Gestión de Rollos (F2) refleje el papel usado por
      // reposiciones, no solo por producción.
      if (idMontajeRollo != null && yardasPapel > 0) {
        await tx.consumoPapel.create({
          data: {
            fecha,
            origen: 'REPOSICION',
            idOrdenProduccion: orden.idOrdenProduccion,
            idReposicion: reposicion.idReposicion,
            idImpresora: dto.idImpresora!,
            idMontajeRollo,
            idTipoPapel: idTipoPapel!,
            consumoYd: yardasPapel,
            creadoPor: idUsuarioActor,
          },
        });
      }

      return reposicion.idReposicion;
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.reposicion',
      idEntidad: String(idReposicion),
      accion: 'CREATE',
      datosNuevos: {
        codigoOp: dto.codigoOp,
        idDefecto: dto.idDefecto,
        yardasPapel,
        yardasTela: dto.yardasTela ?? 0,
      },
    });

    return this.obtener(idReposicion);
  }

  async anular(
    idReposicion: number,
    dto: AnularReposicionDto,
    idUsuarioActor: number,
  ) {
    const reposicion = await this.prisma.reposicion.findUnique({
      where: { idReposicion },
    });
    if (!reposicion) throw new NotFoundException('Reposición no encontrada');
    if (reposicion.anuladoEn)
      throw new ConflictException('Esta reposición ya fue anulada');

    const ahora = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.reposicion.update({
        where: { idReposicion },
        data: {
          anuladoEn: ahora,
          anuladoPor: idUsuarioActor,
          motivoAnulacion: dto.motivo,
        },
      });
      // El consumo de papel asociado también se anula — si no, seguiría
      // restando del rollo aunque la reposición que lo originó ya no cuente.
      await tx.consumoPapel.updateMany({
        where: { idReposicion, anuladoEn: null },
        data: {
          anuladoEn: ahora,
          anuladoPor: idUsuarioActor,
          motivoAnulacion: dto.motivo,
        },
      });
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.reposicion',
      idEntidad: String(idReposicion),
      accion: 'UPDATE',
      datosNuevos: { anuladoEn: ahora, motivo: dto.motivo },
    });

    return this.obtener(idReposicion);
  }
}
