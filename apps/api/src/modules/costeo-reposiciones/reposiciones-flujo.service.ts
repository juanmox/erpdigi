import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GoogleSheetsService } from '../../common/google-sheets/google-sheets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { nombreParaHistorial } from '../costeo-materiales/materiales-historial';
import {
  DevolverReposicionesDto,
  EntregarRequisicionesDto,
  ValidarReposicionesDto,
} from './dto/flujo-reposicion.dto';
import {
  type CambioReposicion,
  crearEventosReposicion,
  eventosDelCiclo,
  motivoNoPuedeValidar,
  NOMBRE_PASO,
  PASO_AUTORIZACION,
  PASO_ENTREGA,
  PASO_IMPRESION,
  PASO_PREPARACION,
  permisoDelPaso,
} from './flujo';
import { espejarReposicionEnSheets } from './reposiciones-espejo';
import { INCLUDE_REPOSICION } from './reposiciones-include';

type TxCliente = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface FallaLote {
  idReposicion: number;
  codigo: string | null;
  motivo: string;
  /** La impresora no tiene rollo montado ahora: se puede reintentar con otra. */
  sinRollo?: boolean;
}

/** Texto de un error para el resumen del lote. */
function mensajeDe(e: unknown): string {
  if (e instanceof HttpException) {
    const r = e.getResponse();
    if (typeof r === 'string') return r;
    const m = (r as { message?: unknown }).message;
    return Array.isArray(m)
      ? m.join('; ')
      : typeof m === 'string'
        ? m
        : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

const esSinRollo = (e: unknown) =>
  e instanceof HttpException &&
  (e.getResponse() as { motivo?: string })?.motivo === 'SIN_ROLLO_MONTADO';

/**
 * El flujo de validaciones de una reposición: validar, devolver, imprimir la
 * requisición y despachar.
 *
 * Todo va POR LOTE y con UNA TRANSACCIÓN POR REPOSICIÓN (igual que el envío masivo
 * de Impresión de OPs): se cargan 100-200 reposiciones por día, y si 3 de 50
 * fallan —una impresora sin rollo, otro validador que se adelantó— no tiene
 * sentido perder las otras 47.
 */
@Injectable()
export class ReposicionesFlujoService {
  private readonly logger = new Logger(ReposicionesFlujoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly googleSheets: GoogleSheetsService,
  ) {}

  /** Bloquea la fila y la devuelve, solo si es de la empresa. */
  private async bloquear(
    tx: TxCliente,
    idReposicion: number,
    idEmpresa: number,
  ) {
    const filas = await tx.$queryRaw<{ id_reposicion: number }[]>`
      SELECT r.id_reposicion
      FROM costeo.reposicion r
      JOIN costeo.orden_produccion op ON op.id_orden_produccion = r.id_orden_produccion
      WHERE r.id_reposicion = ${idReposicion} AND op.id_empresa = ${idEmpresa}
      FOR UPDATE OF r`;
    if (filas.length === 0)
      throw new NotFoundException('Reposición no encontrada');
    return tx.reposicion.findUniqueOrThrow({
      where: { idReposicion },
      include: {
        eventos: {
          select: { accion: true, paso: true, idUsuario: true, creadoEn: true },
        },
        ordenProduccion: { select: { codigo: true } },
      },
    });
  }

  private async codigos(ids: number[]) {
    const filas = await this.prisma.reposicion.findMany({
      where: { idReposicion: { in: ids } },
      select: {
        idReposicion: true,
        codigoRepo: true,
        ordenProduccion: { select: { codigo: true } },
      },
    });
    return new Map(
      filas.map((f) => [
        f.idReposicion,
        `${f.ordenProduccion.codigo}-${f.codigoRepo}`,
      ]),
    );
  }

  // ── Validar ───────────────────────────────────────────────────────────

  async validarLote(
    dto: ValidarReposicionesDto,
    usuario: { sub: number; permisos: string[] },
    idEmpresa: number,
  ) {
    const permiso = permisoDelPaso(dto.paso);
    if (!permiso || !usuario.permisos.includes(permiso))
      throw new ForbiddenException(
        `No tenés permiso para validar el paso ${dto.paso} (${NOMBRE_PASO[dto.paso] ?? ''}).`,
      );
    if (dto.idImpresora != null && dto.paso !== PASO_AUTORIZACION)
      throw new ConflictException(
        'La impresora solo se puede cambiar al autorizar (paso 6).',
      );

    const usuarioNombre = await nombreParaHistorial(this.prisma, usuario.sub);
    const ids = [...new Set(dto.ids)];
    const codigos = await this.codigos(ids);
    const hechas: number[] = [];
    const autorizadas: { idReposicion: number; nrollo: string }[] = [];
    const fallidas: FallaLote[] = [];

    for (const id of ids) {
      try {
        const r = await this.prisma.$transaction(
          (tx) =>
            this.validarUna(tx, id, dto, usuario, usuarioNombre, idEmpresa),
          { timeout: 20_000 },
        );
        hechas.push(id);
        if (r.autorizada)
          autorizadas.push({ idReposicion: id, nrollo: r.nrollo });
      } catch (e) {
        fallidas.push({
          idReposicion: id,
          codigo: codigos.get(id) ?? null,
          motivo: mensajeDe(e),
          ...(esSinRollo(e) ? { sinRollo: true } : {}),
        });
      }
    }

    if (hechas.length > 0)
      await this.auditoria.registrar({
        idUsuario: usuario.sub,
        entidad: 'costeo.reposicion',
        idEntidad: hechas.join(','),
        accion: 'UPDATE',
        datosNuevos: {
          validadas: hechas.length,
          paso: dto.paso,
          ...(dto.paso === PASO_AUTORIZACION
            ? { autorizadas: autorizadas.length }
            : {}),
        },
      });

    // Al autorizar sale el papel del rollo: recién ahí se espeja a los Sheets.
    if (autorizadas.length > 0) void this.espejar(autorizadas, idEmpresa);

    return { hechas: hechas.length, idsHechas: hechas, fallidas };
  }

  private async validarUna(
    tx: TxCliente,
    id: number,
    dto: ValidarReposicionesDto,
    usuario: { sub: number; permisos: string[] },
    usuarioNombre: string,
    idEmpresa: number,
  ): Promise<{ autorizada: boolean; nrollo: string }> {
    const r = await this.bloquear(tx, id, idEmpresa);
    const motivo = motivoNoPuedeValidar(
      r,
      r.eventos,
      dto.paso,
      usuario.sub,
      usuario.permisos,
    );
    if (motivo) throw new ConflictException(motivo);

    const ahora = new Date();
    const desde = r.estadoDesde ?? r.creadoEn;
    const cambios: CambioReposicion[] = [];
    let nrollo = '';

    if (dto.paso < PASO_AUTORIZACION) {
      await tx.reposicion.update({
        where: { idReposicion: id },
        data: { pasoPendiente: dto.paso + 1, estadoDesde: ahora },
      });
    } else {
      // ── Paso 6: autorización. Acá sale el papel del rollo. ──
      const aut = await this.autorizarEnTx(tx, r, {
        idUsuario: usuario.sub,
        momento: ahora,
        ahora,
        estadoFinal: 'POR_IMPRIMIR',
        idImpresoraNueva: dto.idImpresora ?? null,
        exigirRolloAhora: false,
      });
      nrollo = aut.nrollo;
      cambios.push(...aut.cambios);
    }

    await crearEventosReposicion(tx, [
      {
        idEmpresa,
        idReposicion: id,
        accion: 'VALIDAR',
        paso: dto.paso,
        desde,
        ahora,
        cambios,
        idUsuario: usuario.sub,
        usuarioNombre,
      },
    ]);
    return { autorizada: dto.paso === PASO_AUTORIZACION, nrollo };
  }

  /**
   * Deja una reposición autorizada: resuelve el rollo montado, descuenta el papel
   * (crea el `consumo_papel`) y la pasa a su estado final. Lo comparten el paso 6
   * del flujo (estado `POR_IMPRIMIR`) y el modo transitorio sin validaciones
   * (estado `HISTORICA`, que se imprime y se anula como siempre).
   *
   * `momento` es el instante contra el que se resuelve el rollo y se fecha el
   * consumo. `exigirRolloAhora` replica la regla de antes del flujo: sin el
   * permiso de excepción la impresora tiene que tener rollo montado AHORA, no solo
   * en la fecha que se mandó (si no, se esquivaría retrocediendo la fecha).
   */
  async autorizarEnTx(
    tx: TxCliente,
    r: {
      idReposicion: number;
      idOrdenProduccion: number;
      tipo: string;
      yardasPapel: Prisma.Decimal | number;
      idImpresora: number | null;
    },
    o: {
      idUsuario: number;
      momento: Date;
      ahora: Date;
      estadoFinal: 'POR_IMPRIMIR' | 'HISTORICA';
      idImpresoraNueva: number | null;
      exigirRolloAhora: boolean;
    },
  ): Promise<{ nrollo: string; cambios: CambioReposicion[] }> {
    const cambios: CambioReposicion[] = [];
    let nrollo = '';
    const datos: Prisma.ReposicionUncheckedUpdateInput = {
      estado: o.estadoFinal,
      pasoPendiente: null,
      estadoDesde: o.ahora,
    };
    if (r.tipo === 'REIMPRESION' && Number(r.yardasPapel) > 0) {
      let idImpresora = r.idImpresora!;
      if (o.idImpresoraNueva != null && o.idImpresoraNueva !== idImpresora) {
        const [antes, despues] = await Promise.all([
          tx.impresora.findUnique({ where: { idImpresora } }),
          tx.impresora.findUnique({
            where: { idImpresora: o.idImpresoraNueva },
          }),
        ]);
        if (!despues || !despues.activo)
          throw new ConflictException(
            'Esa impresora no existe o está retirada.',
          );
        cambios.push({
          campo: 'Impresora',
          antes: antes?.codigo ?? null,
          despues: despues.codigo,
        });
        idImpresora = o.idImpresoraNueva;
        datos.idImpresora = idImpresora;
      }
      const sinRollo = async () => {
        const imp = await tx.impresora.findUnique({ where: { idImpresora } });
        return new ConflictException({
          message: `La ${imp?.codigo ?? 'impresora'} no tiene ningún rollo montado ahora: montá uno, o elegí otra impresora que sí lo tenga.`,
          motivo: 'SIN_ROLLO_MONTADO',
          idImpresora,
        });
      };
      if (o.exigirRolloAhora) {
        const ahoraRes = await tx.$queryRaw<{ id_montaje: number | null }[]>`
          SELECT costeo.fn_rollo_en(${idImpresora}, now()) AS id_montaje`;
        if ((ahoraRes[0]?.id_montaje ?? null) == null) throw await sinRollo();
      }
      const res = await tx.$queryRaw<{ id_montaje: number | null }[]>`
        SELECT costeo.fn_rollo_en(${idImpresora}, ${o.momento}::timestamptz) AS id_montaje`;
      const idMontajeRollo = res[0]?.id_montaje ?? null;
      if (idMontajeRollo == null) throw await sinRollo();
      const montaje = await tx.montajeRollo.findUniqueOrThrow({
        where: { idMontajeRollo },
        include: { rolloPapel: { include: { facturaPapel: true } } },
      });
      // Mismo formato que costeo.v_rollo_codigo (el NRollo de los Sheets).
      nrollo = `${montaje.rolloPapel.facturaPapel.numeroFactura}-${montaje.rolloPapel.facturaPapel.totalRollos}-${montaje.rolloPapel.secuencia}`;
      datos.idMontajeRollo = idMontajeRollo;
      datos.idTipoPapel = montaje.rolloPapel.idTipoPapel;
      await tx.consumoPapel.create({
        data: {
          fecha: o.momento,
          origen: 'REPOSICION',
          idOrdenProduccion: r.idOrdenProduccion,
          idReposicion: r.idReposicion,
          idImpresora,
          idMontajeRollo,
          idTipoPapel: montaje.rolloPapel.idTipoPapel,
          consumoYd: r.yardasPapel,
          creadoPor: o.idUsuario,
        },
      });
    }
    await tx.reposicion.update({
      where: { idReposicion: r.idReposicion },
      data: datos,
    });
    return { nrollo, cambios };
  }

  /** ¿La empresa tiene prendido el modo transitorio sin validaciones? */
  async modoSinValidacion(idEmpresa: number): Promise<boolean> {
    const e = await this.prisma.empresa.findUnique({
      where: { idEmpresa },
      select: { reposicionesConValidacion: true },
    });
    return e ? !e.reposicionesConValidacion : false;
  }

  /**
   * Autoriza de una vez lo que ya estaba esperando validación cuando se prendió el
   * modo sin validaciones (la reposición que se quedó a mitad de camino). Solo
   * funciona con el modo prendido, y es del mismo nivel de confianza que crear en
   * ese modo: el permiso es `costeo.reposicion.crear`.
   */
  async autorizarDirectoLote(
    ids: number[],
    usuario: { sub: number; permisos: string[] },
    idEmpresa: number,
  ) {
    if (!(await this.modoSinValidacion(idEmpresa)))
      throw new ConflictException(
        'El modo sin validaciones está apagado: las reposiciones siguen el flujo de validaciones.',
      );
    const usuarioNombre = await nombreParaHistorial(this.prisma, usuario.sub);
    const puedeSinRollo = usuario.permisos.includes(
      'costeo.reposicion.impresora_sin_rollo',
    );
    const unicos = [...new Set(ids)];
    const codigos = await this.codigos(unicos);
    const hechas: number[] = [];
    const autorizadas: { idReposicion: number; nrollo: string }[] = [];
    const fallidas: FallaLote[] = [];

    for (const id of unicos) {
      try {
        const nrollo = await this.prisma.$transaction(
          async (tx) => {
            const r = await this.bloquear(tx, id, idEmpresa);
            if (r.anuladoEn)
              throw new ConflictException('La reposición está anulada.');
            if (r.estado === 'DEVUELTA')
              throw new ConflictException(
                'Está devuelta: corregila primero y después se autoriza.',
              );
            if (r.estado !== 'EN_VALIDACION')
              throw new ConflictException('Ya no está esperando validación.');
            const ahora = new Date();
            const aut = await this.autorizarEnTx(tx, r, {
              idUsuario: usuario.sub,
              momento: r.fecha,
              ahora,
              estadoFinal: 'HISTORICA',
              idImpresoraNueva: null,
              exigirRolloAhora: !puedeSinRollo,
            });
            await crearEventosReposicion(tx, [
              {
                idEmpresa,
                idReposicion: id,
                accion: 'SIN_VALIDACION',
                paso: PASO_AUTORIZACION,
                desde: r.estadoDesde ?? r.creadoEn,
                ahora,
                motivo: 'Autorizada sin validaciones (modo transitorio)',
                cambios: aut.cambios,
                idUsuario: usuario.sub,
                usuarioNombre,
              },
            ]);
            return aut.nrollo;
          },
          { timeout: 20_000 },
        );
        hechas.push(id);
        autorizadas.push({ idReposicion: id, nrollo });
      } catch (e) {
        fallidas.push({
          idReposicion: id,
          codigo: codigos.get(id) ?? null,
          motivo: mensajeDe(e),
          ...(esSinRollo(e) ? { sinRollo: true } : {}),
        });
      }
    }

    if (hechas.length > 0) {
      await this.auditoria.registrar({
        idUsuario: usuario.sub,
        entidad: 'costeo.reposicion',
        idEntidad: hechas.join(','),
        accion: 'UPDATE',
        datosNuevos: { autorizadasSinValidacion: hechas.length },
      });
      void this.espejar(autorizadas, idEmpresa);
    }
    return { hechas: hechas.length, idsHechas: hechas, fallidas };
  }

  async espejar(
    autorizadas: { idReposicion: number; nrollo: string }[],
    idEmpresa: number,
  ) {
    try {
      const empresa = await this.prisma.empresa.findUnique({
        where: { idEmpresa },
        select: { espejaSheets: true },
      });
      if (!empresa?.espejaSheets) return;
      const nrollos = new Map(
        autorizadas.map((a) => [a.idReposicion, a.nrollo]),
      );
      const detalles = await this.prisma.reposicion.findMany({
        where: { idReposicion: { in: autorizadas.map((a) => a.idReposicion) } },
        include: INCLUDE_REPOSICION,
        orderBy: { idReposicion: 'asc' },
      });
      // ⚠️ Las de MATERIALES NO se espejan (decisión del usuario, 2026-10-19):
      // la hoja "Registro" no tiene columnas de material.
      for (const d of detalles.filter((x) => x.tipo !== 'MATERIALES'))
        await espejarReposicionEnSheets(
          this.prisma,
          this.googleSheets,
          d,
          nrollos.get(d.idReposicion) ?? '',
        );
    } catch (e) {
      this.logger.error(`Espejo de reposiciones autorizadas: ${mensajeDe(e)}`);
    }
  }

  // ── Devolver ──────────────────────────────────────────────────────────

  async devolverLote(
    dto: DevolverReposicionesDto,
    usuario: { sub: number; permisos: string[] },
    idEmpresa: number,
  ) {
    const permiso = permisoDelPaso(dto.paso);
    if (!permiso || !usuario.permisos.includes(permiso))
      throw new ForbiddenException(
        `No tenés permiso para el paso ${dto.paso} (${NOMBRE_PASO[dto.paso] ?? ''}).`,
      );
    const usuarioNombre = await nombreParaHistorial(this.prisma, usuario.sub);
    const ids = [...new Set(dto.ids)];
    const codigos = await this.codigos(ids);
    const hechas: number[] = [];
    const fallidas: FallaLote[] = [];

    for (const id of ids) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const r = await this.bloquear(tx, id, idEmpresa);
          const motivo = motivoNoPuedeValidar(
            r,
            r.eventos,
            dto.paso,
            usuario.sub,
            usuario.permisos,
          );
          if (motivo) throw new ConflictException(motivo);
          const ahora = new Date();
          await tx.reposicion.update({
            where: { idReposicion: id },
            data: {
              estado: 'DEVUELTA',
              pasoPendiente: null,
              estadoDesde: ahora,
            },
          });
          await crearEventosReposicion(tx, [
            {
              idEmpresa,
              idReposicion: id,
              accion: 'DEVOLVER',
              paso: dto.paso,
              desde: r.estadoDesde ?? r.creadoEn,
              ahora,
              motivo: dto.motivo,
              idUsuario: usuario.sub,
              usuarioNombre,
            },
          ]);
        });
        hechas.push(id);
      } catch (e) {
        fallidas.push({
          idReposicion: id,
          codigo: codigos.get(id) ?? null,
          motivo: mensajeDe(e),
        });
      }
    }

    if (hechas.length > 0)
      await this.auditoria.registrar({
        idUsuario: usuario.sub,
        entidad: 'costeo.reposicion',
        idEntidad: hechas.join(','),
        accion: 'UPDATE',
        datosNuevos: {
          devueltas: hechas.length,
          paso: dto.paso,
          motivo: dto.motivo,
        },
      });

    return { hechas: hechas.length, idsHechas: hechas, fallidas };
  }

  // ── Imprimir la requisición (paso 7) ─────────────────────────────────

  /**
   * La primera impresión le asigna a la requisición un número correlativo POR
   * EMPRESA y la deja "por despachar"; las siguientes son copias (se cuentan y el
   * impreso sale marcado COPIA). Devuelve lo necesario para imprimir.
   */
  async imprimirRequisiciones(
    ids: number[],
    idUsuario: number,
    idEmpresa: number,
    soloCopias = false,
  ) {
    const usuarioNombre = await nombreParaHistorial(this.prisma, idUsuario);
    const unicos = [...new Set(ids)];
    const codigos = await this.codigos(unicos);
    const hechas: number[] = [];
    const fallidas: FallaLote[] = [];

    for (const id of unicos) {
      // Dos personas imprimiendo a la vez pueden calcular el mismo número: el
      // UNIQUE (empresa, número) lo rechaza y se reintenta con el siguiente.
      for (let intento = 1; ; intento++) {
        try {
          await this.prisma.$transaction((tx) =>
            this.imprimirUna(
              tx,
              id,
              idUsuario,
              usuarioNombre,
              idEmpresa,
              soloCopias,
            ),
          );
          hechas.push(id);
          break;
        } catch (e) {
          const choque =
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002';
          if (choque && intento < 4) continue;
          fallidas.push({
            idReposicion: id,
            codigo: codigos.get(id) ?? null,
            motivo: mensajeDe(e),
          });
          break;
        }
      }
    }

    if (hechas.length > 0)
      await this.auditoria.registrar({
        idUsuario,
        entidad: 'costeo.reposicion',
        idEntidad: hechas.join(','),
        accion: 'UPDATE',
        datosNuevos: { requisicionesImpresas: hechas.length },
      });

    const reposiciones = await this.paraImprimir(hechas, idEmpresa);
    return { reposiciones, fallidas };
  }

  private async imprimirUna(
    tx: TxCliente,
    id: number,
    idUsuario: number,
    usuarioNombre: string,
    idEmpresa: number,
    soloCopias = false,
  ) {
    const r = await this.bloquear(tx, id, idEmpresa);
    if (r.anuladoEn) throw new ConflictException('La reposición está anulada.');
    const ahora = new Date();
    const req = await tx.requisicionReposicion.findUnique({
      where: { idReposicion: id },
    });

    if (!req) {
      if (soloCopias)
        throw new ConflictException(
          'Todavía no tiene número de requisición: la numera quien imprime.',
        );
      if (r.estado !== 'POR_IMPRIMIR')
        throw new ConflictException(
          r.estado === 'HISTORICA'
            ? 'Es anterior al flujo de validaciones: no lleva requisición numerada.'
            : 'Todavía no está autorizada para despacho.',
        );
      const max = await tx.requisicionReposicion.aggregate({
        where: { idEmpresa },
        _max: { numero: true },
      });
      await tx.requisicionReposicion.create({
        data: {
          idEmpresa,
          numero: (max._max.numero ?? 0) + 1,
          idReposicion: id,
          impresaEn: ahora,
          impresaPor: idUsuario,
          ultimaImpresionEn: ahora,
        },
      });
      await tx.reposicion.update({
        where: { idReposicion: id },
        data: { estado: 'POR_DESPACHAR', estadoDesde: ahora },
      });
      await crearEventosReposicion(tx, [
        {
          idEmpresa,
          idReposicion: id,
          accion: 'IMPRIMIR',
          paso: PASO_IMPRESION,
          desde: r.estadoDesde ?? r.creadoEn,
          ahora,
          idUsuario,
          usuarioNombre,
        },
      ]);
      return;
    }

    // Copia: no mueve el estado ni el reloj.
    await tx.requisicionReposicion.update({
      where: { idReposicion: id },
      data: { impresiones: { increment: 1 }, ultimaImpresionEn: ahora },
    });
    await crearEventosReposicion(tx, [
      {
        idEmpresa,
        idReposicion: id,
        accion: 'REIMPRIMIR',
        paso: PASO_IMPRESION,
        desde: ahora,
        ahora,
        idUsuario,
        usuarioNombre,
      },
    ]);
  }

  /** Las reposiciones con su requisición y la cadena de validaciones, para imprimir. */
  async paraImprimir(ids: number[], idEmpresa: number) {
    if (ids.length === 0) return [];
    const filas = await this.prisma.reposicion.findMany({
      where: { idReposicion: { in: ids }, ordenProduccion: { idEmpresa } },
      include: {
        ...INCLUDE_REPOSICION,
        eventos: {
          select: {
            accion: true,
            paso: true,
            idUsuario: true,
            usuarioNombre: true,
            creadoEn: true,
          },
        },
      },
    });
    const orden = new Map(ids.map((id, i) => [id, i]));
    return filas
      .sort(
        (a, b) =>
          (orden.get(a.idReposicion) ?? 0) - (orden.get(b.idReposicion) ?? 0),
      )
      .map(({ eventos, ...r }) => ({
        ...r,
        creadoPorNombre:
          eventos.find((e) => e.accion === 'CREAR')?.usuarioNombre ?? null,
        validaciones: eventosDelCiclo(eventos)
          .filter((e) => e.accion === 'VALIDAR')
          .map((e) => ({
            paso: e.paso,
            nombrePaso: NOMBRE_PASO[e.paso],
            usuario: e.usuarioNombre,
            fecha: e.creadoEn,
          })),
      }));
  }

  // ── Preparar en bodega (paso 8) y entregar al solicitante (paso 9) ──────

  /**
   * Bodega deja lista la requisición y AVISA: quien la pidió y su encargado de área
   * reciben el aviso (ver `avisos()` del seguimiento). Acá termina el reloj de bodega:
   * de "lista" a la entrega la demora es del solicitante, no de bodega.
   */
  async prepararLote(ids: number[], idUsuario: number, idEmpresa: number) {
    const usuarioNombre = await nombreParaHistorial(this.prisma, idUsuario);
    const unicos = [...new Set(ids)];
    const codigos = await this.codigos(unicos);
    const hechas: number[] = [];
    const fallidas: FallaLote[] = [];

    for (const id of unicos) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const r = await this.bloquear(tx, id, idEmpresa);
          if (r.anuladoEn)
            throw new ConflictException('La reposición está anulada.');
          if (r.estado !== 'POR_DESPACHAR')
            throw new ConflictException(
              r.estado === 'POR_RECOGER' || r.estado === 'DESPACHADA'
                ? 'Ya estaba lista para recoger.'
                : 'Primero hay que imprimir su requisición.',
            );
          await this.dejarLista(tx, r, idUsuario, usuarioNombre, idEmpresa);
        });
        hechas.push(id);
      } catch (e) {
        fallidas.push({
          idReposicion: id,
          codigo: codigos.get(id) ?? null,
          motivo: mensajeDe(e),
        });
      }
    }

    if (hechas.length > 0)
      await this.auditoria.registrar({
        idUsuario,
        entidad: 'costeo.reposicion',
        idEntidad: hechas.join(','),
        accion: 'UPDATE',
        datosNuevos: { listasParaRecoger: hechas.length },
      });

    return { hechas: hechas.length, idsHechas: hechas, fallidas };
  }

  /** POR_DESPACHAR → POR_RECOGER: fija quién y cuándo la dejó lista, y deja el evento. */
  private async dejarLista(
    tx: TxCliente,
    r: { idReposicion: number; estadoDesde: Date | null; creadoEn: Date },
    idUsuario: number,
    usuarioNombre: string,
    idEmpresa: number,
    ahora = new Date(),
  ) {
    await tx.requisicionReposicion.update({
      where: { idReposicion: r.idReposicion },
      data: { listaEn: ahora, listaPor: idUsuario },
    });
    await tx.reposicion.update({
      where: { idReposicion: r.idReposicion },
      data: { estado: 'POR_RECOGER', estadoDesde: ahora },
    });
    await crearEventosReposicion(tx, [
      {
        idEmpresa,
        idReposicion: r.idReposicion,
        accion: 'PREPARAR',
        paso: PASO_PREPARACION,
        desde: r.estadoDesde ?? r.creadoEn,
        ahora,
        idUsuario,
        usuarioNombre,
      },
    ]);
  }

  /**
   * El solicitante llegó a recoger: bodega marca la entrega. Si la requisición
   * todavía no estaba marcada "lista" (la persona ya estaba en bodega), se deja
   * lista y entregada en el mismo instante: no hubo espera que medir.
   */
  async entregarLote(
    dto: EntregarRequisicionesDto,
    idUsuario: number,
    idEmpresa: number,
  ) {
    const usuarioNombre = await nombreParaHistorial(this.prisma, idUsuario);
    const items = dto.items;
    const codigos = await this.codigos(items.map((i) => i.idReposicion));
    const hechas: number[] = [];
    const fallidas: FallaLote[] = [];

    for (const item of items) {
      const id = item.idReposicion;
      try {
        await this.prisma.$transaction(async (tx) => {
          const r = await this.bloquear(tx, id, idEmpresa);
          if (r.anuladoEn)
            throw new ConflictException('La reposición está anulada.');
          if (r.estado === 'DESPACHADA')
            throw new ConflictException('Ya estaba entregada.');
          if (r.estado !== 'POR_RECOGER' && r.estado !== 'POR_DESPACHAR')
            throw new ConflictException(
              'Primero hay que imprimir su requisición.',
            );

          const ahora = new Date();
          let desde = r.estadoDesde ?? r.creadoEn;
          if (r.estado === 'POR_DESPACHAR') {
            await this.dejarLista(
              tx,
              r,
              idUsuario,
              usuarioNombre,
              idEmpresa,
              ahora,
            );
            desde = ahora;
          }
          const talonario = item.numeroTalonario?.trim() || null;
          const recibidoPor = item.recibidoPor?.trim() || null;
          await tx.requisicionReposicion.update({
            where: { idReposicion: id },
            data: {
              despachadaEn: ahora,
              despachadaPor: idUsuario,
              numeroTalonario: talonario,
              recibidoPor,
            },
          });
          await tx.reposicion.update({
            where: { idReposicion: id },
            data: { estado: 'DESPACHADA', estadoDesde: ahora },
          });
          const cambios: CambioReposicion[] = [];
          if (talonario)
            cambios.push({
              campo: 'Nº talonario',
              antes: null,
              despues: talonario,
            });
          if (recibidoPor)
            cambios.push({
              campo: 'Recibido por',
              antes: null,
              despues: recibidoPor,
            });
          await crearEventosReposicion(tx, [
            {
              idEmpresa,
              idReposicion: id,
              accion: 'DESPACHAR',
              paso: PASO_ENTREGA,
              // Desde que quedó lista: lo que tardó el solicitante en recoger.
              desde,
              ahora,
              cambios,
              idUsuario,
              usuarioNombre,
            },
          ]);
        });
        hechas.push(id);
      } catch (e) {
        fallidas.push({
          idReposicion: id,
          codigo: codigos.get(id) ?? null,
          motivo: mensajeDe(e),
        });
      }
    }

    if (hechas.length > 0)
      await this.auditoria.registrar({
        idUsuario,
        entidad: 'costeo.reposicion',
        idEntidad: hechas.join(','),
        accion: 'UPDATE',
        datosNuevos: { entregadas: hechas.length },
      });

    return { hechas: hechas.length, idsHechas: hechas, fallidas };
  }
}
