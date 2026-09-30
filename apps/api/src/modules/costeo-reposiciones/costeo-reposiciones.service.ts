import {
  BadRequestException,
  ConflictException,
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
    private readonly googleSheets: GoogleSheetsService,
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

  async siguienteNumero(
    codigoOp: string,
    idEmpresa: number,
    idUsuario: number,
  ) {
    const orden = await this.resolverOrden(codigoOp, idEmpresa, idUsuario);
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

  listar(idEmpresa: number, idOrdenProduccion?: number) {
    return this.prisma.reposicion.findMany({
      // Sin `idOrdenProduccion` esto listaba TODAS las reposiciones, de las dos
      // empresas. El filtro va por la OP porque la reposición no lleva empresa
      // propia: la hereda de su orden.
      where: { idOrdenProduccion, ordenProduccion: { idEmpresa } },
      include: INCLUDE_REPOSICION,
      orderBy: { fecha: 'desc' },
    });
  }

  async obtener(idReposicion: number, idEmpresa: number) {
    // findFirst y no findUnique: una reposición de otra empresa debe verse
    // como inexistente, no como existente-pero-prohibida.
    const reposicion = await this.prisma.reposicion.findFirst({
      where: { idReposicion, ordenProduccion: { idEmpresa } },
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
  async crear(
    dto: CrearReposicionDto,
    idUsuarioActor: number,
    idEmpresa: number,
    puedeImpresoraSinRollo: boolean,
  ) {
    const orden = await this.resolverOrden(
      dto.codigoOp,
      idEmpresa,
      idUsuarioActor,
    );
    const fecha = new Date(dto.fecha);
    const yardasPapel = dto.yardasPapel ?? 0;

    const { idReposicion, nrolloTexto } = await this.prisma.$transaction(
      async (tx) => {
        let idMontajeRollo: number | null = null;
        let idTipoPapel: number | null = null;
        let nrolloTexto = '';

        if (dto.idImpresora != null) {
          // Sin el permiso de excepción la impresora tiene que tener rollo
          // montado AHORA, no solo en la fecha que se mandó. La pantalla ya
          // filtra el selector a esas impresoras, pero sin este chequeo la
          // regla se esquivaría con solo retroceder la fecha del formulario.
          if (!puedeImpresoraSinRollo) {
            const ahora = await tx.$queryRaw<{ id_montaje: number | null }[]>`
          SELECT costeo.fn_rollo_en(${dto.idImpresora}, now()) AS id_montaje
        `;
            if ((ahora[0]?.id_montaje ?? null) == null) {
              throw new ConflictException(
                'Esa impresora no tiene ningún rollo montado. Elegí una que sí lo tenga, o pedile a un administrador el permiso para registrar sobre una impresora sin rollo.',
              );
            }
          }

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
            include: { rolloPapel: { include: { facturaPapel: true } } },
          });
          idTipoPapel = montaje.rolloPapel.idTipoPapel;
          // Mismo formato que costeo.v_rollo_codigo — el NRollo que el ERP ya
          // resolvió (no la búsqueda heurística del Código.gs legacy, que a
          // veces se queda en "Buscando..." sin resolver nada).
          nrolloTexto = `${montaje.rolloPapel.facturaPapel.numeroFactura}-${montaje.rolloPapel.facturaPapel.totalRollos}-${montaje.rolloPapel.secuencia}`;
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

        return { idReposicion: reposicion.idReposicion, nrolloTexto };
      },
    );

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

    const detalle = await this.obtener(idReposicion, idEmpresa);

    // Espejo hacia los dos Google Sheets legacy que todavía alimentan Data
    // Studio — en segundo plano, nunca bloquea ni puede fallar el guardado
    // (que ya quedó confirmado en Postgres arriba).
    //
    // Solo para las empresas que espejan. El usuario lo pidió para Impresión de
    // OPs, pero Reposiciones escribe a los MISMOS libros de Digitexsa, así que
    // dejarlo abierto acá habría filtrado por la otra puerta lo que se estaba
    // cerrando por la primera.
    const empresa = await this.prisma.empresa.findUnique({
      where: { idEmpresa },
      select: { espejaSheets: true },
    });
    if (empresa?.espejaSheets)
      void this.espejarEnGoogleSheets(detalle, nrolloTexto);

    return detalle;
  }

  private async espejarEnGoogleSheets(
    detalle: Awaited<ReturnType<CosteoReposicionesService['obtener']>>,
    nrolloTexto: string,
  ) {
    const fechaTexto = formatearFechaSheets(detalle.fecha);
    const responsable = detalle.empleado?.nombres ?? 'Sin responsable';
    const cliente = detalle.ordenProduccion.cliente?.nombre ?? '';
    const yardasPapel = Number(detalle.yardasPapel);
    const yardasTela = Number(detalle.yardasTela);
    const tipoPapel = detalle.tipoPapel?.nombre ?? '';
    const impresora = detalle.impresora?.codigo ?? '';

    // Hoja "Registro" (libro Repos) — una fila por reposición, réplica
    // exacta de guardarRepo()/hojasRepos.appendRow() del Código.gs legacy,
    // más la columna P "Comentario" (agregada a pedido del usuario, solo en
    // este libro — el campo comentario del ERP no existía en el legacy y no
    // tiene equivalente en "Datos"/ConsumosFinal).
    const filaRegistro = [
      fechaTexto,
      detalle.ordenProduccion.codigo,
      detalle.codigoRepo,
      detalle.departamento.nombre,
      responsable,
      detalle.defecto.nombre,
      detalle.bodegaSac ?? '',
      yardasPapel,
      tipoPapel,
      detalle.insumoTela?.descripcion ?? '',
      yardasTela,
      cliente,
      impresora,
      detalle.calandra?.codigo ?? '',
      nrolloTexto,
      detalle.comentario ?? '',
    ];

    // Hoja "Datos" (libro ConsumosFinal DIGITEXSA, compartido con Forma 2) —
    // mismas columnas que hojaCostos.appendRow() del Código.gs legacy; una
    // reposición solo llena las de papel, el resto queda en blanco (nunca
    // se manda tela ahí, igual que el legacy).
    const filaDatos = [
      fechaTexto,
      '',
      detalle.ordenProduccion.codigo,
      detalle.codigoRepo,
      cliente,
      impresora,
      '',
      tipoPapel,
      '',
      '',
      '',
      '',
      yardasPapel,
      '',
      nrolloTexto,
    ];

    await Promise.all([
      this.googleSheets.agregarFila(
        process.env.GOOGLE_SHEETS_ID_REGISTRO,
        'Registro',
        filaRegistro,
      ),
      this.googleSheets.agregarFila(
        process.env.GOOGLE_SHEETS_ID_CONSUMOS,
        'Datos',
        filaDatos,
      ),
    ]);
  }

  async anular(
    idReposicion: number,
    dto: AnularReposicionDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const reposicion = await this.prisma.reposicion.findFirst({
      where: { idReposicion, ordenProduccion: { idEmpresa } },
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

    return this.obtener(idReposicion, idEmpresa);
  }
}
