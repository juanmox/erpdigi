import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { contextoActual } from '../../common/contexto-peticion';
import { PrismaService } from '../../prisma/prisma.service';
import { CodigosResueltos, ENTIDADES_RESOLUBLES, narrar } from './narrador';

export interface RegistrarAuditoriaInput {
  idEmpresa?: number | null;
  idUsuario?: number | null;
  entidad: string;
  idEntidad: string;
  accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN';
  datosAnteriores?: Record<string, unknown> | null;
  datosNuevos?: Record<string, unknown> | null;
  ipOrigen?: string | null;
  userAgent?: string | null;
}

function aJson(
  valor: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return valor == null ? Prisma.JsonNull : (valor as Prisma.InputJsonValue);
}

/**
 * Un día calendario de Guatemala, anclado a UTC-6.
 *
 * Mismo criterio que el reporte de consumo: `new Date('2026-10-09')` es
 * medianoche UTC, o sea las 18:00 del día anterior acá, y un límite superior
 * inclusivo se come casi todo el último día. Guatemala no tiene horario de
 * verano, así que el desfase es constante y el día se puede anclar exacto.
 */
function rangoDeDias(desde?: string, hasta?: string) {
  if (!desde && !hasta) return undefined;
  const dia = (s: string, sumarUno = false) => {
    const [a, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + (sumarUno ? 1 : 0), 6, 0, 0));
  };
  return {
    ...(desde ? { gte: dia(desde) } : {}),
    // Exclusivo sobre el día siguiente: abarca el día pedido entero sin
    // depender de la precisión del timestamp.
    ...(hasta ? { lt: dia(hasta, true) } : {}),
  };
}

/** Nombre legible de la entidad, para el selector de filtros. */
function etiquetaEntidad(entidad: string): string {
  const mapa: Record<string, string> = {
    'costeo.orden_produccion': 'Órdenes de producción',
    'costeo.linea_produccion': 'Ítems de órdenes',
    'costeo.consumo_papel': 'Consumo de papel',
    'costeo.montaje_rollo': 'Montajes de rollo',
    'costeo.rollo_papel': 'Rollos de papel',
    'costeo.factura_papel': 'Facturas de papel',
    'costeo.reposicion': 'Reposiciones',
    'costeo.consumo_estandar': 'Consumo estándar',
    'costeo.linea_producto': 'Líneas de producto',
    usuarios: 'Usuarios',
    usuario_empresa_rol: 'Roles de usuario',
    roles: 'Roles',
    'core.roles': 'Roles',
    empresas: 'Empresas',
    productos: 'Productos',
    insumos: 'Insumos',
    desarrollos: 'Desarrollos',
    desarrollo_insumos: 'Líneas de receta',
    producto_insumos: 'Líneas de receta',
  };
  return mapa[entidad] ?? entidad;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(input: RegistrarAuditoriaInput) {
    // La IP, el user agent y el nombre del usuario salen del contexto de la
    // petición si quien llama no los pasó, que es el caso de las 45 llamadas
    // que ya existen. Las columnas de IP existían desde F1 pero **nadie las
    // llenaba**: 0 de 418 registros tenían IP cuando se midió el 2026-10-09.
    const ctx = contextoActual();
    await this.prisma.auditoria.create({
      data: {
        idEmpresa: input.idEmpresa ?? ctx.idEmpresa ?? null,
        idUsuario: input.idUsuario ?? null,
        usuarioNombre: ctx.usuarioNombre ?? null,
        entidad: input.entidad,
        idEntidad: input.idEntidad,
        accion: input.accion,
        datosAnteriores: aJson(input.datosAnteriores),
        datosNuevos: aJson(input.datosNuevos),
        ipOrigen: input.ipOrigen ?? ctx.ip,
        userAgent: input.userAgent ?? ctx.userAgent,
      },
    });
  }

  /**
   * La bitácora, ya narrada.
   *
   * Reemplaza al `listar()` anterior, que devolvía el `idUsuario` en vez del
   * nombre, filtraba solo por empresa y entidad —no por usuario ni por fecha,
   * que es justo lo que se pregunta— y tenía un tope fijo de 50 sin
   * paginación. Ninguna pantalla lo consumía.
   */
  async listar(params: {
    idEmpresa?: number;
    entidad?: string;
    accion?: string;
    usuario?: string;
    /** Día calendario `yyyy-mm-dd`, interpretado en hora de Guatemala. */
    desde?: string;
    hasta?: string;
    pagina?: number;
    porPagina?: number;
  }) {
    const porPagina = Math.min(Math.max(params.porPagina ?? 50, 1), 200);
    const pagina = Math.max(params.pagina ?? 1, 1);

    const where: Prisma.AuditoriaWhereInput = {
      // Los registros SIN empresa se muestran igual: hasta el 2026-10-09 solo
      // `usuario_empresa_rol` la guardaba, así que 389 de 418 la tenían en
      // NULL. Excluirlos escondería casi toda la bitácora histórica. Los
      // nuevos sí la llevan (ver contexto-peticion.ts), así que con el tiempo
      // esta rama deja de hacer falta.
      ...(params.idEmpresa != null
        ? { OR: [{ idEmpresa: params.idEmpresa }, { idEmpresa: null }] }
        : {}),
      entidad: params.entidad,
      accion: params.accion,
      // Por el TEXTO y no por el id: un usuario borrado ya no tiene id, y la
      // gracia de guardar el nombre es poder seguir buscándolo.
      usuarioNombre: params.usuario
        ? { contains: params.usuario, mode: 'insensitive' }
        : undefined,
      creadoEn: rangoDeDias(params.desde, params.hasta),
    };

    const [total, filas] = await this.prisma.$transaction([
      this.prisma.auditoria.count({ where }),
      this.prisma.auditoria.findMany({
        where,
        orderBy: { creadoEn: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);

    const codigos = await this.resolverCodigos(filas);

    return {
      total,
      pagina,
      porPagina,
      paginas: Math.max(1, Math.ceil(total / porPagina)),
      entradas: filas.map((f) => {
        const n = narrar(
          {
            entidad: f.entidad,
            accion: f.accion,
            idEntidad: f.idEntidad,
            datosAnteriores: f.datosAnteriores as Record<string, unknown>,
            datosNuevos: f.datosNuevos as Record<string, unknown>,
          },
          codigos,
        );
        return {
          idAuditoria: f.idAuditoria,
          fecha: f.creadoEn.toISOString(),
          usuario: f.usuarioNombre,
          /** El usuario ya no existe: el nombre sobrevive, el id no. */
          usuarioBorrado: f.usuarioNombre != null && f.idUsuario == null,
          ip: f.ipOrigen,
          userAgent: f.userAgent,
          texto: n.texto,
          detalle: n.detalle,
          entidad: f.entidad,
          accion: f.accion,
          idEntidad: f.idEntidad,
        };
      }),
    };
  }

  /** Para llenar los selectores de la pantalla sin inventar la lista. */
  async filtros(idEmpresa?: number) {
    const deLaEmpresa =
      idEmpresa != null ? { OR: [{ idEmpresa }, { idEmpresa: null }] } : {};
    const entidades = await this.prisma.auditoria.groupBy({
      by: ['entidad'],
      where: deLaEmpresa,
      _count: { entidad: true },
      orderBy: { _count: { entidad: 'desc' } },
    });
    const usuarios = await this.prisma.auditoria.groupBy({
      by: ['usuarioNombre'],
      where: { ...deLaEmpresa, usuarioNombre: { not: null } },
      orderBy: { usuarioNombre: 'asc' },
    });
    return {
      entidades: entidades.map((e) => ({
        entidad: e.entidad,
        etiqueta: etiquetaEntidad(e.entidad),
        n: e._count.entidad,
      })),
      usuarios: usuarios
        .map((u) => u.usuarioNombre)
        .filter((u): u is string => u != null),
      acciones: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN'],
    };
  }

  /**
   * Resuelve los ids a códigos legibles, **en lote por tipo de entidad**: una
   * consulta por tipo presente en la página, no una por fila.
   *
   * Lo que no resuelve se omite y el narrador muestra el id como viene. Ver la
   * nota de `narrador.ts` sobre por qué `id_entidad` no siempre es una clave.
   */
  private async resolverCodigos(
    filas: {
      entidad: string;
      idEntidad: string;
      datosNuevos?: unknown;
    }[],
  ): Promise<CodigosResueltos> {
    const codigos: CodigosResueltos = new Map();
    const porEntidad = new Map<string, number[]>();

    // Algunos ids viven DENTRO del JSON, no en `id_entidad`: un montaje guarda
    // `{idImpresora, idRolloPapel}`. Sin resolverlos, la entrada más frecuente
    // de la bitácora diría "montó un rollo" sin decir cuál ni dónde.
    const idsRollo = new Set<number>();
    const idsImpresora = new Set<number>();
    for (const f of filas) {
      const d = (f.datosNuevos ?? {}) as Record<string, unknown>;
      if (typeof d.idRolloPapel === 'number') idsRollo.add(d.idRolloPapel);
      if (typeof d.idImpresora === 'number') idsImpresora.add(d.idImpresora);
    }
    if (idsRollo.size) {
      const r = await this.prisma.rolloPapel.findMany({
        where: { idRolloPapel: { in: [...idsRollo] } },
        select: {
          idRolloPapel: true,
          secuencia: true,
          facturaPapel: { select: { numeroFactura: true, totalRollos: true } },
        },
      });
      // Mismo formato que la vista `costeo.v_rollo_codigo`.
      r.forEach((x) =>
        codigos.set(
          `rollo:${x.idRolloPapel}`,
          `${x.facturaPapel.numeroFactura}-${x.facturaPapel.totalRollos}-${x.secuencia}`,
        ),
      );
    }
    if (idsImpresora.size) {
      const r = await this.prisma.impresora.findMany({
        where: { idImpresora: { in: [...idsImpresora] } },
        select: { idImpresora: true, codigo: true },
      });
      r.forEach((x) => codigos.set(`impresora:${x.idImpresora}`, x.codigo));
    }

    for (const f of filas) {
      if (!ENTIDADES_RESOLUBLES.includes(f.entidad as never)) continue;
      const id = Number(f.idEntidad);
      if (!Number.isInteger(id)) continue; // 'import', listas de códigos…
      porEntidad.set(f.entidad, [...(porEntidad.get(f.entidad) ?? []), id]);
    }
    const guardar = (entidad: string, id: number, codigo: string | null) => {
      if (codigo) codigos.set(`${entidad}:${id}`, codigo);
    };

    for (const [entidad, ids] of porEntidad) {
      switch (entidad) {
        case 'costeo.orden_produccion': {
          const r = await this.prisma.ordenProduccion.findMany({
            where: { idOrdenProduccion: { in: ids } },
            select: { idOrdenProduccion: true, codigo: true },
          });
          r.forEach((x) => guardar(entidad, x.idOrdenProduccion, x.codigo));
          break;
        }
        case 'costeo.factura_papel':
        case 'costeo.rollo_papel': {
          const r = await this.prisma.facturaPapel.findMany({
            where: { idFacturaPapel: { in: ids } },
            select: { idFacturaPapel: true, numeroFactura: true },
          });
          r.forEach((x) => guardar(entidad, x.idFacturaPapel, x.numeroFactura));
          break;
        }
        case 'costeo.montaje_rollo': {
          const r = await this.prisma.montajeRollo.findMany({
            where: { idMontajeRollo: { in: ids } },
            select: {
              idMontajeRollo: true,
              impresora: { select: { codigo: true } },
            },
          });
          r.forEach((x) =>
            guardar(entidad, x.idMontajeRollo, x.impresora.codigo),
          );
          break;
        }
        case 'costeo.reposicion': {
          const r = await this.prisma.reposicion.findMany({
            where: { idReposicion: { in: ids } },
            select: { idReposicion: true, codigoRepo: true },
          });
          r.forEach((x) => guardar(entidad, x.idReposicion, x.codigoRepo));
          break;
        }
        case 'costeo.linea_producto': {
          const r = await this.prisma.lineaProducto.findMany({
            where: { idLineaProducto: { in: ids } },
            select: { idLineaProducto: true, nombre: true },
          });
          r.forEach((x) => guardar(entidad, x.idLineaProducto, x.nombre));
          break;
        }
        case 'usuarios':
        case 'core.usuarios': {
          const r = await this.prisma.usuario.findMany({
            where: { idUsuario: { in: ids } },
            select: { idUsuario: true, username: true },
          });
          r.forEach((x) => guardar(entidad, x.idUsuario, x.username));
          break;
        }
        case 'roles':
        case 'core.roles': {
          const r = await this.prisma.rol.findMany({
            where: { idRol: { in: ids } },
            select: { idRol: true, nombre: true },
          });
          r.forEach((x) => guardar(entidad, x.idRol, x.nombre));
          break;
        }
        case 'productos': {
          const r = await this.prisma.producto.findMany({
            where: { idProducto: { in: ids } },
            select: { idProducto: true, codigo: true },
          });
          r.forEach((x) => guardar(entidad, x.idProducto, x.codigo));
          break;
        }
        case 'insumos': {
          const r = await this.prisma.insumo.findMany({
            where: { idInsumo: { in: ids } },
            select: { idInsumo: true, codigo: true },
          });
          r.forEach((x) => guardar(entidad, x.idInsumo, x.codigo));
          break;
        }
        case 'desarrollos': {
          const r = await this.prisma.desarrollo.findMany({
            where: { idDesarrollo: { in: ids } },
            select: { idDesarrollo: true, codigo: true },
          });
          r.forEach((x) => guardar(entidad, x.idDesarrollo, x.codigo));
          break;
        }
      }
    }
    return codigos;
  }
}
