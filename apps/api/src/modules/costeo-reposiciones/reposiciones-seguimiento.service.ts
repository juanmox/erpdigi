import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { rangoDeDiasGT } from '../../common/dia-guatemala';
import { parsearCodigoOp } from '../../common/op-codigo';
import { PrismaService } from '../../prisma/prisma.service';
import {
  eventosDelCiclo,
  leerCambiosReposicion,
  motivoNoPuedeValidar,
  NOMBRE_PASO,
  PASOS_VALIDACION,
  PERMISO_DESPACHAR,
  PERMISO_IMPRIMIR,
  PERMISOS_COPIA_REQUISICION,
  pasosQueValida,
} from './flujo';
import {
  construirExcelMetricas,
  construirExcelSeguimiento,
} from './reposiciones-excel';

export const ESTADOS_FILTRO = [
  'en_curso',
  'en_validacion',
  'devueltas',
  'por_imprimir',
  'por_despachar',
  'despachadas',
  'historicas',
  'anuladas',
  'todas',
] as const;
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number];

export interface FiltrosSeguimiento {
  estado: EstadoFiltro;
  paso?: number;
  soloMias: boolean;
  porValidar: boolean;
  codigoOp?: string;
  idCreador?: number;
  idDefecto?: number;
  idDepartamento?: number;
  tipo?: string;
  idImpresora?: number;
  producto?: string;
  texto?: string;
  campoFecha: 'reposicion' | 'creacion';
  desde?: string;
  hasta?: string;
  pagina: number;
  porPagina: number;
}

export interface UsuarioActor {
  sub: number;
  permisos: string[];
}

/** Semáforo de "esperando hace…", en horas de tiempo corrido. */
export const HORAS_AMARILLO = 24;
export const HORAS_ROJO = 48;

const ESTADO_DE_FILTRO: Partial<Record<EstadoFiltro, string[]>> = {
  en_curso: ['EN_VALIDACION', 'DEVUELTA', 'POR_IMPRIMIR', 'POR_DESPACHAR'],
  en_validacion: ['EN_VALIDACION'],
  devueltas: ['DEVUELTA'],
  por_imprimir: ['POR_IMPRIMIR'],
  por_despachar: ['POR_DESPACHAR'],
  despachadas: ['DESPACHADA'],
  historicas: ['HISTORICA'],
};

const INCLUDE_LISTADO = {
  departamento: { select: { nombre: true } },
  defecto: { select: { nombre: true } },
  empleado: { select: { nombres: true } },
  impresora: { select: { codigo: true } },
  calandra: { select: { codigo: true } },
  tipoPapel: { select: { nombre: true } },
  insumoTela: { select: { codigo: true, descripcion: true } },
  reposicionInsumos: {
    select: {
      cantidad: true,
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
  prendas: {
    select: {
      cantidad: true,
      producto: { select: { codigo: true } },
      talla: { select: { nombre: true } },
      pieza: { select: { nombre: true } },
    },
    orderBy: { idReposicionPrenda: 'asc' },
  },
  ordenProduccion: {
    select: { codigo: true, cliente: { select: { nombre: true } } },
  },
  requisicion: true,
  eventos: {
    select: {
      accion: true,
      paso: true,
      idUsuario: true,
      usuarioNombre: true,
      creadoEn: true,
      motivo: true,
    },
    orderBy: { creadoEn: 'asc' },
  },
} satisfies Prisma.ReposicionInclude;

type FilaListado = Prisma.ReposicionGetPayload<{
  include: typeof INCLUDE_LISTADO;
}>;

@Injectable()
export class ReposicionesSeguimientoService {
  constructor(private readonly prisma: PrismaService) {}

  /** ¿La empresa tiene prendido el modo transitorio sin validaciones? */
  private async sinValidacion(idEmpresa: number): Promise<boolean> {
    const e = await this.prisma.empresa.findUnique({
      where: { idEmpresa },
      select: { reposicionesConValidacion: true },
    });
    return e ? !e.reposicionesConValidacion : false;
  }

  /** Lo que el usuario puede mover AHORA según sus permisos. */
  /**
   * `incluirPropias`: la cola de la pantalla muestra también lo que el usuario
   * creó (deshabilitado y con su motivo) para que no parezca que "no llegó".
   * El contador de pendientes, en cambio, cuenta solo lo que sí puede mover.
   */
  private condicionPorValidar(
    u: UsuarioActor,
    incluirPropias = false,
  ): Prisma.ReposicionWhereInput {
    const ors: Prisma.ReposicionWhereInput[] = [];
    const pasos = pasosQueValida(u.permisos);
    if (pasos.length > 0)
      ors.push({
        estado: 'EN_VALIDACION',
        pasoPendiente: { in: pasos },
        // Nadie valida lo que creó (en la cola se muestra bloqueado).
        ...(incluirPropias ? {} : { creadoPor: { not: u.sub } }),
      });
    if (u.permisos.includes(PERMISO_IMPRIMIR))
      ors.push({ estado: 'POR_IMPRIMIR' });
    if (u.permisos.includes(PERMISO_DESPACHAR))
      ors.push({ estado: 'POR_DESPACHAR' });
    // Sin ningún permiso de paso: la cola está vacía, no "todo".
    return ors.length > 0
      ? { anuladoEn: null, OR: ors }
      : { idReposicion: { in: [] } };
  }

  private where(
    f: FiltrosSeguimiento,
    u: UsuarioActor,
    idEmpresa: number,
  ): Prisma.ReposicionWhereInput {
    const y: Prisma.ReposicionWhereInput[] = [];
    const orden: Prisma.OrdenProduccionWhereInput = { idEmpresa };
    if (f.codigoOp) {
      const p = parsearCodigoOp(f.codigoOp);
      // Un código mal escrito no debe devolver "todo".
      if (p) {
        orden.anio = p.anio;
        orden.correlativo = p.correlativo;
      } else orden.codigo = { contains: f.codigoOp.trim().toUpperCase() };
    }
    y.push({ ordenProduccion: orden });

    // "Por validar" se combina con el estado: así la pantalla arma una cola por
    // paso (estado=en_validacion&paso=3) o la de bodega (estado=por_imprimir).
    if (f.porValidar) y.push(this.condicionPorValidar(u, true));
    if (f.estado === 'anuladas') y.push({ anuladoEn: { not: null } });
    else if (f.estado !== 'todas')
      y.push({ anuladoEn: null, estado: { in: ESTADO_DE_FILTRO[f.estado] } });

    if (f.paso) y.push({ pasoPendiente: f.paso });
    if (f.soloMias) y.push({ creadoPor: u.sub });
    if (f.idCreador) y.push({ creadoPor: f.idCreador });
    if (f.idDefecto) y.push({ idDefecto: f.idDefecto });
    if (f.idDepartamento) y.push({ idDepartamento: f.idDepartamento });
    if (f.tipo) y.push({ tipo: f.tipo });
    if (f.idImpresora) y.push({ idImpresora: f.idImpresora });
    if (f.producto)
      y.push({
        prendas: {
          some: {
            producto: {
              codigo: { contains: f.producto.trim(), mode: 'insensitive' },
            },
          },
        },
      });
    if (f.texto) {
      const t = f.texto.trim();
      y.push({
        OR: [
          { comentario: { contains: t, mode: 'insensitive' } },
          { bodegaSac: { contains: t, mode: 'insensitive' } },
          { defecto: { nombre: { contains: t, mode: 'insensitive' } } },
          {
            ordenProduccion: {
              cliente: { nombre: { contains: t, mode: 'insensitive' } },
            },
          },
          {
            requisicion: {
              numeroTalonario: { contains: t, mode: 'insensitive' },
            },
          },
          ...(/^\d+$/.test(t) ? [{ requisicion: { numero: Number(t) } }] : []),
        ],
      });
    }
    const rango = rangoDeDiasGT(f.desde, f.hasta);
    if (rango)
      y.push(
        f.campoFecha === 'creacion' ? { creadoEn: rango } : { fecha: rango },
      );
    return { AND: y };
  }

  mapear(r: FilaListado, u: UsuarioActor, modoSinValidacion = false) {
    const ciclo = eventosDelCiclo(r.eventos);
    const devolucion =
      r.estado === 'DEVUELTA'
        ? [...r.eventos].reverse().find((e) => e.accion === 'DEVOLVER')
        : undefined;
    const crear = r.eventos.find((e) => e.accion === 'CREAR');
    const motivoNoValidar =
      r.estado === 'EN_VALIDACION' && r.pasoPendiente
        ? motivoNoPuedeValidar(r, r.eventos, r.pasoPendiente, u.sub, u.permisos)
        : 'No está en validación.';
    const vivo = !r.anuladoEn;
    return {
      idReposicion: r.idReposicion,
      codigo: `${r.ordenProduccion.codigo}-${r.codigoRepo}`,
      codigoRepo: r.codigoRepo,
      codigoOp: r.ordenProduccion.codigo,
      cliente: r.ordenProduccion.cliente?.nombre ?? null,
      fecha: r.fecha,
      creadoEn: r.creadoEn,
      tipo: r.tipo,
      estado: r.estado,
      pasoPendiente: r.pasoPendiente,
      estadoDesde: r.estadoDesde,
      anuladoEn: r.anuladoEn,
      motivoAnulacion: r.motivoAnulacion,
      departamento: r.departamento.nombre,
      defecto: r.defecto.nombre,
      responsable: r.empleado?.nombres ?? null,
      bodegaSac: r.bodegaSac,
      impresora: r.impresora?.codigo ?? null,
      calandra: r.calandra?.codigo ?? null,
      tipoPapel: r.tipoPapel?.nombre ?? null,
      tela: r.insumoTela,
      yardasPapel: Number(r.yardasPapel),
      yardasTela: Number(r.yardasTela),
      comentario: r.comentario,
      prendas: r.prendas.map((p) => ({
        producto: p.producto.codigo,
        talla: p.talla.nombre,
        pieza: p.pieza.nombre,
        cantidad: p.cantidad,
      })),
      materiales: r.reposicionInsumos.map((m) => ({
        codigo: m.insumo.codigo,
        descripcion: m.insumo.descripcion,
        unidad: m.insumo.unidad.nombre,
        cantidad: Number(m.cantidad),
      })),
      creadoPor: r.creadoPor,
      creadoPorNombre: crear?.usuarioNombre ?? null,
      esMia: r.creadoPor === u.sub,
      // Autorizada en el modo transitorio sin validaciones (quedó HISTORICA).
      sinValidacion: r.eventos.some((e) => e.accion === 'SIN_VALIDACION'),
      validaciones: ciclo
        .filter((e) => e.accion === 'VALIDAR')
        .map((e) => ({
          paso: e.paso,
          usuario: e.usuarioNombre,
          fecha: e.creadoEn,
        })),
      devolucion: devolucion
        ? {
            paso: devolucion.paso,
            usuario: devolucion.usuarioNombre,
            fecha: devolucion.creadoEn,
            motivo: devolucion.motivo,
          }
        : null,
      requisicion: r.requisicion
        ? {
            numero: r.requisicion.numero,
            impresiones: r.requisicion.impresiones,
            numeroTalonario: r.requisicion.numeroTalonario,
            despachadaEn: r.requisicion.despachadaEn,
          }
        : null,
      acciones: {
        validar: vivo && motivoNoValidar === null,
        motivoNoValidar,
        corregir:
          vivo &&
          u.permisos.includes('costeo.reposicion.crear') &&
          (r.estado === 'DEVUELTA' ||
            (r.estado === 'EN_VALIDACION' && r.pasoPendiente === 2)),
        imprimir:
          vivo &&
          ((u.permisos.includes(PERMISO_IMPRIMIR) &&
            ['POR_IMPRIMIR', 'POR_DESPACHAR', 'DESPACHADA'].includes(
              r.estado,
            )) ||
            (PERMISOS_COPIA_REQUISICION.some((p) => u.permisos.includes(p)) &&
              ['POR_DESPACHAR', 'DESPACHADA'].includes(r.estado))),
        despachar:
          vivo &&
          u.permisos.includes(PERMISO_DESPACHAR) &&
          r.estado === 'POR_DESPACHAR',
        // Modo transitorio sin validaciones: lo que quedó esperando se puede
        // autorizar de una vez (la devuelta se corrige primero).
        autorizarDirecto:
          vivo &&
          modoSinValidacion &&
          u.permisos.includes('costeo.reposicion.crear') &&
          r.estado === 'EN_VALIDACION',
        anular:
          vivo &&
          u.permisos.includes('costeo.reposicion.anular') &&
          r.estado !== 'DESPACHADA',
      },
    };
  }

  async listar(f: FiltrosSeguimiento, u: UsuarioActor, idEmpresa: number) {
    const where = this.where(f, u, idEmpresa);
    const modoSinValidacion = await this.sinValidacion(idEmpresa);
    const [total, filas] = await Promise.all([
      this.prisma.reposicion.count({ where }),
      this.prisma.reposicion.findMany({
        where,
        include: INCLUDE_LISTADO,
        // La cola se trabaja de lo más viejo a lo más nuevo; el listado, al revés.
        orderBy: f.porValidar
          ? [{ estadoDesde: 'asc' }, { idReposicion: 'asc' }]
          : [{ creadoEn: 'desc' }, { idReposicion: 'desc' }],
        skip: (f.pagina - 1) * f.porPagina,
        take: f.porPagina,
      }),
    ]);
    return {
      total,
      pagina: f.pagina,
      porPagina: f.porPagina,
      paginas: Math.max(1, Math.ceil(total / f.porPagina)),
      filas: filas.map((r) => this.mapear(r, u, modoSinValidacion)),
      resumen: await this.resumen(u, idEmpresa),
    };
  }

  /** Conteos por estado y paso (lo vivo, sin históricas) y la cola del usuario. */
  async resumen(u: UsuarioActor, idEmpresa: number) {
    const base: Prisma.ReposicionWhereInput = {
      ordenProduccion: { idEmpresa },
      anuladoEn: null,
      estado: { not: 'HISTORICA' },
    };
    const [grupos, porValidar, devueltasMias, creadores] = await Promise.all([
      this.prisma.reposicion.groupBy({
        by: ['estado', 'pasoPendiente'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.reposicion.count({
        where: {
          AND: [
            { ordenProduccion: { idEmpresa } },
            this.condicionPorValidar(u),
          ],
        },
      }),
      this.prisma.reposicion.count({
        where: { ...base, estado: 'DEVUELTA', creadoPor: u.sub },
      }),
      this.prisma.$queryRaw<{ id_usuario: number; nombre: string }[]>`
        SELECT DISTINCT ON (e.id_usuario) e.id_usuario, e.usuario_nombre AS nombre
        FROM costeo.reposicion_evento e
        WHERE e.id_empresa = ${idEmpresa} AND e.accion = 'CREAR' AND e.id_usuario IS NOT NULL
        ORDER BY e.id_usuario, e.creado_en DESC`,
    ]);
    const cuenta = (estado: string, paso?: number) =>
      grupos
        .filter(
          (g) =>
            g.estado === estado && (paso == null || g.pasoPendiente === paso),
        )
        .reduce((a, g) => a + g._count._all, 0);
    return {
      porPaso: PASOS_VALIDACION.map((p) => ({
        paso: p.paso,
        nombre: p.nombre,
        cantidad: cuenta('EN_VALIDACION', p.paso),
      })),
      devueltas: cuenta('DEVUELTA'),
      porImprimir: cuenta('POR_IMPRIMIR'),
      porDespachar: cuenta('POR_DESPACHAR'),
      despachadas: cuenta('DESPACHADA'),
      porValidar,
      devueltasMias,
      pasosQueValido: pasosQueValida(u.permisos),
      puedeImprimir: u.permisos.includes(PERMISO_IMPRIMIR),
      puedeDespachar: u.permisos.includes(PERMISO_DESPACHAR),
      creadores: creadores
        .map((c) => ({ idUsuario: c.id_usuario, nombre: c.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  }

  /**
   * Lo mínimo para avisarle al usuario que tiene trabajo esperando (2026-11-19).
   * Lo consulta el navegador cada minuto, así que son dos consultas agregadas y
   * nada más. `masReciente` es lo que permite avisar de algo NUEVO aunque el
   * total no cambie (validaron 2 y llegaron 2): el navegador compara contra lo
   * último que ya avisó.
   */
  async avisos(u: UsuarioActor, idEmpresa: number) {
    const [grupos, devueltas] = await Promise.all([
      this.prisma.reposicion.groupBy({
        by: ['estado', 'pasoPendiente'],
        where: {
          AND: [
            { ordenProduccion: { idEmpresa } },
            this.condicionPorValidar(u),
          ],
        },
        _count: { _all: true },
        _max: { estadoDesde: true },
      }),
      this.prisma.reposicion.aggregate({
        where: {
          ordenProduccion: { idEmpresa },
          anuladoEn: null,
          estado: 'DEVUELTA',
          creadoPor: u.sub,
        },
        _count: { _all: true },
        _max: { estadoDesde: true },
      }),
    ]);
    const etiqueta = (estado: string, paso: number | null) =>
      estado === 'POR_IMPRIMIR'
        ? 'Requisiciones por imprimir'
        : estado === 'POR_DESPACHAR'
          ? 'Por despachar en bodega'
          : `Paso ${paso} · ${NOMBRE_PASO[paso ?? 0] ?? ''}`;
    const orden = (g: { estado: string; pasoPendiente: number | null }) =>
      g.estado === 'EN_VALIDACION'
        ? (g.pasoPendiente ?? 0)
        : g.estado === 'POR_IMPRIMIR'
          ? 7
          : 8;
    const filas = [...grupos]
      .sort((a, b) => orden(a) - orden(b))
      .map((g) => ({
        clave: g.estado === 'EN_VALIDACION' ? `p${g.pasoPendiente}` : g.estado,
        etiqueta: etiqueta(g.estado, g.pasoPendiente),
        cantidad: g._count._all,
      }));
    const maximo = (fechas: (Date | null | undefined)[]) => {
      const t = fechas.filter((d): d is Date => !!d).map((d) => d.getTime());
      return t.length ? new Date(Math.max(...t)).toISOString() : null;
    };
    return {
      total: filas.reduce((a, g) => a + g.cantidad, 0),
      masReciente: maximo(grupos.map((g) => g._max.estadoDesde)),
      grupos: filas,
      devueltas: {
        cantidad: devueltas._count._all,
        masReciente: maximo([devueltas._max.estadoDesde]),
      },
    };
  }

  /** La línea de tiempo completa de una reposición, con cuánto tardó cada paso. */
  async eventos(idReposicion: number, idEmpresa: number) {
    const r = await this.prisma.reposicion.findFirst({
      where: { idReposicion, ordenProduccion: { idEmpresa } },
      select: { idReposicion: true },
    });
    if (!r) throw new NotFoundException('Reposición no encontrada');
    const eventos = await this.prisma.reposicionEvento.findMany({
      where: { idReposicion },
      orderBy: [{ creadoEn: 'asc' }, { idEvento: 'asc' }],
    });
    return eventos.map((e) => ({
      idEvento: e.idEvento,
      accion: e.accion,
      paso: e.paso,
      nombrePaso: NOMBRE_PASO[e.paso],
      usuario: e.usuarioNombre,
      desde: e.desde,
      fecha: e.creadoEn,
      segundos: e.segundos,
      motivo: e.motivo,
      cambios: leerCambiosReposicion(e.cambios),
    }));
  }

  // ── Métricas de tiempo ───────────────────────────────────────────────

  async metricas(idEmpresa: number, desde?: string, hasta?: string) {
    const rango = rangoDeDiasGT(desde, hasta);
    const condRango = Prisma.sql`
      ${rango?.gte ? Prisma.sql`AND e.creado_en >= ${rango.gte}` : Prisma.empty}
      ${rango?.lt ? Prisma.sql`AND e.creado_en < ${rango.lt}` : Prisma.empty}`;

    type FilaPaso = {
      paso: number;
      accion: string;
      cantidad: bigint;
      promedio: number | null;
      mediana: number | null;
      p90: number | null;
      maximo: number | null;
    };
    // Cuánto tardó cada paso en ACTUAR (validar/devolver/imprimir/despachar), y
    // cuánto tardaron los creadores en corregir lo devuelto (CORREGIR del paso 1).
    const porPaso = await this.prisma.$queryRaw<FilaPaso[]>`
      SELECT e.paso, e.accion, count(*) AS cantidad,
        avg(e.segundos)::float AS promedio,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY e.segundos)::float AS mediana,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY e.segundos)::float AS p90,
        max(e.segundos)::float AS maximo
      FROM costeo.reposicion_evento e
      WHERE e.id_empresa = ${idEmpresa}
        AND (e.accion IN ('VALIDAR', 'DEVOLVER', 'IMPRIMIR', 'DESPACHAR')
             OR (e.accion = 'CORREGIR' AND e.paso = 1))
        ${condRango}
      GROUP BY e.paso, e.accion
      ORDER BY e.paso, e.accion`;

    type FilaUsuario = {
      paso: number;
      usuario: string;
      validadas: bigint;
      devueltas: bigint;
      promedio: number | null;
      p90: number | null;
      maximo: number | null;
    };
    const porUsuario = await this.prisma.$queryRaw<FilaUsuario[]>`
      SELECT e.paso, e.usuario_nombre AS usuario,
        count(*) FILTER (WHERE e.accion <> 'DEVOLVER') AS validadas,
        count(*) FILTER (WHERE e.accion = 'DEVOLVER') AS devueltas,
        avg(e.segundos)::float AS promedio,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY e.segundos)::float AS p90,
        max(e.segundos)::float AS maximo
      FROM costeo.reposicion_evento e
      WHERE e.id_empresa = ${idEmpresa}
        AND e.accion IN ('VALIDAR', 'DEVOLVER', 'IMPRIMIR', 'DESPACHAR')
        ${condRango}
      GROUP BY e.paso, e.usuario_nombre
      ORDER BY e.paso, avg(e.segundos) DESC`;

    type FilaCreador = { usuario: string; creadas: bigint; devueltas: bigint };
    // A quién le devuelven más: devoluciones por creador de la reposición.
    const porCreador = await this.prisma.$queryRaw<FilaCreador[]>`
      WITH creadas AS (
        SELECT c.id_reposicion, c.usuario_nombre
        FROM costeo.reposicion_evento c
        WHERE c.id_empresa = ${idEmpresa} AND c.accion = 'CREAR'
      )
      SELECT cr.usuario_nombre AS usuario,
        count(DISTINCT cr.id_reposicion) AS creadas,
        count(e.id_evento) AS devueltas
      FROM creadas cr
      LEFT JOIN costeo.reposicion_evento e
        ON e.id_reposicion = cr.id_reposicion AND e.accion = 'DEVOLVER' ${condRango}
      GROUP BY cr.usuario_nombre
      ORDER BY count(e.id_evento) DESC, cr.usuario_nombre`;

    type FilaDevolucion = {
      fecha: Date;
      codigo: string;
      paso: number;
      usuario: string;
      motivo: string | null;
      creador: string | null;
    };
    const devoluciones = await this.prisma.$queryRaw<FilaDevolucion[]>`
      SELECT e.creado_en AS fecha, op.codigo || '-' || r.codigo_repo AS codigo, e.paso,
        e.usuario_nombre AS usuario, e.motivo,
        (SELECT c.usuario_nombre FROM costeo.reposicion_evento c
          WHERE c.id_reposicion = e.id_reposicion AND c.accion = 'CREAR' LIMIT 1) AS creador
      FROM costeo.reposicion_evento e
      JOIN costeo.reposicion r ON r.id_reposicion = e.id_reposicion
      JOIN costeo.orden_produccion op ON op.id_orden_produccion = r.id_orden_produccion
      WHERE e.id_empresa = ${idEmpresa} AND e.accion = 'DEVOLVER' ${condRango}
      ORDER BY e.creado_en DESC
      LIMIT 300`;

    type FilaCiclo = {
      cantidad: bigint;
      promedio: number | null;
      mediana: number | null;
      p90: number | null;
    };
    // Ciclo completo: de la creación al despacho, de lo despachado en el rango.
    const ciclo = await this.prisma.$queryRaw<FilaCiclo[]>`
      SELECT count(*) AS cantidad,
        avg(s)::float AS promedio,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY s)::float AS mediana,
        percentile_cont(0.9) WITHIN GROUP (ORDER BY s)::float AS p90
      FROM (
        SELECT extract(epoch FROM (e.creado_en - c.creado_en)) AS s
        FROM costeo.reposicion_evento e
        JOIN costeo.reposicion_evento c ON c.id_reposicion = e.id_reposicion AND c.accion = 'CREAR'
        WHERE e.id_empresa = ${idEmpresa} AND e.accion = 'DESPACHAR' ${condRango}
      ) x`;

    type FilaEnCurso = {
      id_reposicion: number;
      codigo: string;
      estado: string;
      paso_pendiente: number | null;
      segundos: number;
      creador: string | null;
    };
    // Lo que está esperando AHORA (no depende del rango).
    const enCurso = await this.prisma.$queryRaw<FilaEnCurso[]>`
      SELECT r.id_reposicion, op.codigo || '-' || r.codigo_repo AS codigo, r.estado, r.paso_pendiente,
        extract(epoch FROM (now() - r.estado_desde))::float AS segundos,
        (SELECT c.usuario_nombre FROM costeo.reposicion_evento c
          WHERE c.id_reposicion = r.id_reposicion AND c.accion = 'CREAR' LIMIT 1) AS creador
      FROM costeo.reposicion r
      JOIN costeo.orden_produccion op ON op.id_orden_produccion = r.id_orden_produccion
      WHERE op.id_empresa = ${idEmpresa} AND r.anulado_en IS NULL
        AND r.estado IN ('EN_VALIDACION', 'DEVUELTA', 'POR_IMPRIMIR', 'POR_DESPACHAR')
      ORDER BY r.estado_desde ASC`;

    const horas = (s: number | null) =>
      s == null ? null : Math.round((s / 3600) * 100) / 100;
    const pasoDeEnCurso = (x: FilaEnCurso) =>
      x.estado === 'EN_VALIDACION'
        ? (x.paso_pendiente ?? 2)
        : x.estado === 'DEVUELTA'
          ? 1
          : x.estado === 'POR_IMPRIMIR'
            ? 7
            : 8;
    const enCursoPorPaso = [1, 2, 3, 4, 5, 6, 7, 8].map((paso) => {
      const xs = enCurso.filter((x) => pasoDeEnCurso(x) === paso);
      return {
        paso,
        nombre: paso === 1 ? 'Devueltas (corrección)' : NOMBRE_PASO[paso],
        cantidad: xs.length,
        masAntiguaHoras: horas(xs[0]?.segundos ?? null),
        mas24: xs.filter((x) => x.segundos >= HORAS_AMARILLO * 3600).length,
        mas48: xs.filter((x) => x.segundos >= HORAS_ROJO * 3600).length,
      };
    });

    const c = ciclo[0];
    return {
      desde: desde ?? null,
      hasta: hasta ?? null,
      horasAmarillo: HORAS_AMARILLO,
      horasRojo: HORAS_ROJO,
      porPaso: porPaso.map((p) => ({
        paso: p.paso,
        nombre: p.paso === 1 ? 'Corrección (creador)' : NOMBRE_PASO[p.paso],
        accion: p.accion,
        cantidad: Number(p.cantidad),
        promedioHoras: horas(p.promedio),
        medianaHoras: horas(p.mediana),
        p90Horas: horas(p.p90),
        maximoHoras: horas(p.maximo),
      })),
      porUsuario: porUsuario.map((p) => ({
        paso: p.paso,
        nombrePaso: NOMBRE_PASO[p.paso],
        usuario: p.usuario,
        validadas: Number(p.validadas),
        devueltas: Number(p.devueltas),
        promedioHoras: horas(p.promedio),
        p90Horas: horas(p.p90),
        maximoHoras: horas(p.maximo),
      })),
      porCreador: porCreador.map((p) => ({
        usuario: p.usuario,
        creadas: Number(p.creadas),
        devueltas: Number(p.devueltas),
      })),
      devoluciones: devoluciones.map((d) => ({
        ...d,
        nombrePaso: NOMBRE_PASO[d.paso],
      })),
      ciclo: {
        cantidad: Number(c?.cantidad ?? 0),
        promedioHoras: horas(c?.promedio ?? null),
        medianaHoras: horas(c?.mediana ?? null),
        p90Horas: horas(c?.p90 ?? null),
      },
      enCursoPorPaso,
      enCurso: enCurso.slice(0, 100).map((x) => ({
        idReposicion: x.id_reposicion,
        codigo: x.codigo,
        paso: pasoDeEnCurso(x),
        nombrePaso:
          pasoDeEnCurso(x) === 1
            ? 'Devuelta (corrección)'
            : NOMBRE_PASO[pasoDeEnCurso(x)],
        horas: horas(x.segundos),
        creador: x.creador,
      })),
    };
  }

  // ── Excel ─────────────────────────────────────────────────────────────

  async exportarSeguimiento(
    f: FiltrosSeguimiento,
    u: UsuarioActor,
    idEmpresa: number,
  ) {
    const TOPE = 20_000;
    const where = this.where(f, u, idEmpresa);
    const modoSinValidacion = await this.sinValidacion(idEmpresa);
    const filas = await this.prisma.reposicion.findMany({
      where,
      include: INCLUDE_LISTADO,
      orderBy: [{ creadoEn: 'desc' }, { idReposicion: 'desc' }],
      take: TOPE + 1,
    });
    const truncado = filas.length > TOPE;
    const mapeadas = filas
      .slice(0, TOPE)
      .map((r) => this.mapear(r, u, modoSinValidacion));
    const buffer = await construirExcelSeguimiento({
      filas: mapeadas,
      truncado,
      generadoEn: new Date(),
    });
    return { buffer, nombre: `reposiciones-seguimiento-${hoyGT()}.xlsx` };
  }

  async exportarMetricas(idEmpresa: number, desde?: string, hasta?: string) {
    const m = await this.metricas(idEmpresa, desde, hasta);
    const rango = rangoDeDiasGT(desde, hasta);
    const eventos = await this.prisma.reposicionEvento.findMany({
      where: { idEmpresa, ...(rango ? { creadoEn: rango } : {}) },
      orderBy: { creadoEn: 'desc' },
      take: 50_000,
      include: {
        reposicion: {
          select: {
            codigoRepo: true,
            ordenProduccion: { select: { codigo: true } },
          },
        },
      },
    });
    const buffer = await construirExcelMetricas({
      metricas: m,
      eventos: eventos.map((e) => ({
        fecha: e.creadoEn,
        codigo: `${e.reposicion.ordenProduccion.codigo}-${e.reposicion.codigoRepo}`,
        accion: e.accion,
        paso: e.paso,
        nombrePaso: NOMBRE_PASO[e.paso],
        usuario: e.usuarioNombre,
        horas: Math.round((e.segundos / 3600) * 100) / 100,
        motivo: e.motivo,
      })),
      generadoEn: new Date(),
    });
    return { buffer, nombre: `reposiciones-tiempos-${hoyGT()}.xlsx` };
  }
}

function hoyGT() {
  return new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
}

export type FilaSeguimiento = ReturnType<
  ReposicionesSeguimientoService['mapear']
>;
export type MetricasReposiciones = Awaited<
  ReturnType<ReposicionesSeguimientoService['metricas']>
>;
