import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { rangoDeDiasGT } from '../../common/dia-guatemala';
import { PrismaService } from '../../prisma/prisma.service';
import { whereMateriales } from './costeo-materiales.service';
import type {
  CampoFecha,
  FiltrosHistorial,
  FiltrosMateriales,
  PermisosMateriales,
} from './costeo-materiales.types';
import {
  type EventoExport,
  type FilaExport,
  construirExcelMateriales,
} from './materiales-excel';
import { leerCambios, sinDinero } from './materiales-historial';

/** Un Excel de control puede ser grande, pero no infinito: con aviso si se corta. */
const TOPE_EXPORTAR = 20_000;
const TOPE_EVENTOS = 100_000;
const TOPE_HISTORIAL = 500;

const aDia = (d: Date) => d.toISOString().slice(0, 10);
const diaGT = (d: Date) =>
  d.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });

const ETIQUETA_ESTADO: Record<string, string> = {
  todos: 'Todos',
  pendientes: 'Pendientes de entrega',
  entregados: 'Entregados',
  anulados: 'Anulados',
  sin_costo: 'Sin costo',
  sin_ligar: 'OP sin cargar',
  modificados: 'Con modificaciones',
};
const ETIQUETA_CAMPO_FECHA: Record<CampoFecha, string> = {
  planificador: 'fecha del planificador',
  carga: 'fecha de carga',
  entrega: 'fecha de entrega',
};

/**
 * Lectura del historial de cambios y exportación a Excel de la explosión de
 * materiales. Aparte del servicio principal, que ya es el que escribe: este solo
 * lee, así que no necesita transacciones ni permisos de escritura.
 */
@Injectable()
export class CosteoMaterialesReporteService {
  constructor(private readonly prisma: PrismaService) {}

  /** Nombres de usuario en un solo lote (las columnas de autoría no tienen @relation). */
  private async nombres(ids: (number | null)[]) {
    const limpios = [...new Set(ids.filter((x): x is number => x != null))];
    if (limpios.length === 0) return new Map<number, string>();
    const us = await this.prisma.usuario.findMany({
      where: { idUsuario: { in: limpios } },
      select: { idUsuario: true, username: true, nombreCompleto: true },
    });
    return new Map(
      us.map((u) => [u.idUsuario, u.nombreCompleto || u.username] as const),
    );
  }

  // ─────────────────────────── Historial de UN ítem ───────────────────────────

  async historialDeItem(id: number, idEmpresa: number, p: PermisosMateriales) {
    const m = await this.prisma.materialOp.findFirst({
      where: { idMaterialOp: id, idEmpresa },
      include: {
        insumo: {
          select: {
            codigo: true,
            descripcion: true,
            unidad: { select: { nombre: true } },
          },
        },
        carga: { select: { nombreArchivo: true } },
      },
    });
    if (!m) throw new NotFoundException('Ese ítem no existe');

    const filas = await this.prisma.materialOpHistorial.findMany({
      where: { idMaterialOp: id },
      orderBy: [{ creadoEn: 'asc' }, { idHistorial: 'asc' }],
    });
    const nombre = await this.nombres([m.creadoPor]);

    // La carga no es una fila del historial (el ítem nace con ella), pero es el
    // primer capítulo de su historia: se arma a partir del propio ítem.
    const eventos = [
      {
        id: 0,
        accion: 'CARGA',
        fecha: m.creadoEn,
        usuario: nombre.get(m.creadoPor) ?? `Usuario ${m.creadoPor}`,
        motivo: null as string | null,
        detalle:
          m.origen === 'INVENTARIO'
            ? 'Generado por el módulo de Inventario'
            : m.carga?.nombreArchivo
              ? `Cargado con el archivo «${m.carga.nombreArchivo}»`
              : 'Cargado con la plantilla',
        cambios: [] as {
          campo: string;
          antes: string | null;
          despues: string | null;
        }[],
      },
      ...filas.map((f) => ({
        id: f.idHistorial,
        accion: f.accion,
        fecha: f.creadoEn,
        usuario: f.usuarioNombre,
        motivo: f.motivo,
        detalle: null as string | null,
        cambios: sinDinero(leerCambios(f.cambios), p.verDinero),
      })),
    ];

    return {
      item: {
        idMaterialOp: m.idMaterialOp,
        codigoOp: m.codigoOp,
        ordenPlanificacion: m.ordenPlanificacion,
        insumoCodigo: m.insumo.codigo,
        insumoDescripcion: m.insumo.descripcion,
        unidad: m.insumo.unidad.nombre,
        cantidad: Number(m.cantidad),
        estado: m.anuladoEn
          ? 'ANULADO'
          : m.entregadoEn
            ? 'ENTREGADO'
            : 'PENDIENTE',
      },
      eventos,
    };
  }

  // ─────────────────────────── Historial global ───────────────────────────

  async listarHistorial(
    idEmpresa: number,
    f: FiltrosHistorial,
    p: PermisosMateriales,
  ) {
    const item: Prisma.MaterialOpWhereInput = {
      ...(f.op
        ? { codigoOp: { contains: f.op.trim(), mode: 'insensitive' as const } }
        : {}),
      ...(f.ordenPlanificacion
        ? {
            ordenPlanificacion: {
              contains: f.ordenPlanificacion.trim(),
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(f.insumo
        ? {
            insumo: {
              OR: [
                {
                  codigo: {
                    contains: f.insumo.trim(),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  descripcion: {
                    contains: f.insumo.trim(),
                    mode: 'insensitive' as const,
                  },
                },
              ],
            },
          }
        : {}),
    };
    const rango = rangoDeDiasGT(f.desde, f.hasta);
    const where: Prisma.MaterialOpHistorialWhereInput = {
      idEmpresa,
      ...(f.accion ? { accion: f.accion } : {}),
      ...(f.usuario
        ? {
            usuarioNombre: {
              contains: f.usuario.trim(),
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(rango ? { creadoEn: rango } : {}),
      ...(Object.keys(item).length ? { materialOp: item } : {}),
    };

    const [total, filas] = await Promise.all([
      this.prisma.materialOpHistorial.count({ where }),
      this.prisma.materialOpHistorial.findMany({
        where,
        include: {
          materialOp: {
            select: {
              idMaterialOp: true,
              codigoOp: true,
              ordenPlanificacion: true,
              anuladoEn: true,
              insumo: {
                select: {
                  codigo: true,
                  descripcion: true,
                  unidad: { select: { nombre: true } },
                },
              },
            },
          },
        },
        orderBy: [{ creadoEn: 'desc' }, { idHistorial: 'desc' }],
        take: TOPE_HISTORIAL,
      }),
    ]);

    return {
      total,
      truncado: total > filas.length,
      items: filas.map((h) => ({
        idHistorial: h.idHistorial,
        fecha: h.creadoEn,
        accion: h.accion,
        usuario: h.usuarioNombre,
        motivo: h.motivo,
        cambios: sinDinero(leerCambios(h.cambios), p.verDinero),
        idMaterialOp: h.materialOp.idMaterialOp,
        codigoOp: h.materialOp.codigoOp,
        ordenPlanificacion: h.materialOp.ordenPlanificacion,
        insumoCodigo: h.materialOp.insumo.codigo,
        insumoDescripcion: h.materialOp.insumo.descripcion,
        unidad: h.materialOp.insumo.unidad.nombre,
        anulado: h.materialOp.anuladoEn != null,
      })),
    };
  }

  // ─────────────────────────── Excel ───────────────────────────

  async exportarExcel(
    idEmpresa: number,
    f: FiltrosMateriales,
    idUsuario: number,
    p: PermisosMateriales,
  ) {
    const where = whereMateriales(idEmpresa, f, idUsuario, true);

    const [total, filas, empresa] = await Promise.all([
      this.prisma.materialOp.count({ where }),
      this.prisma.materialOp.findMany({
        where,
        include: {
          insumo: {
            select: {
              codigo: true,
              descripcion: true,
              unidad: { select: { nombre: true } },
            },
          },
          ordenProduccion: {
            select: { cliente: { select: { nombre: true } } },
          },
          carga: { select: { idCargaMaterial: true, nombreArchivo: true } },
        },
        orderBy: [
          { fechaPlanificador: 'desc' },
          { ordenPlanificacion: 'asc' },
          { codigoOp: 'asc' },
          { idMaterialOp: 'asc' },
        ],
        take: TOPE_EXPORTAR,
      }),
      this.prisma.empresa.findUnique({
        where: { idEmpresa },
        select: { nombreComercial: true, razonSocial: true },
      }),
    ]);

    // El historial de ESTOS ítems: se filtra por la misma condición, no por una
    // lista de ids (con miles de ítems, un IN gigante).
    const historial = await this.prisma.materialOpHistorial.findMany({
      where: { idEmpresa, materialOp: where },
      include: {
        materialOp: {
          select: {
            codigoOp: true,
            ordenPlanificacion: true,
            insumo: { select: { codigo: true, descripcion: true } },
          },
        },
      },
      orderBy: [{ creadoEn: 'desc' }, { idHistorial: 'desc' }],
      take: TOPE_EVENTOS,
    });

    const porItem = new Map<number, { n: number; ultima: Date }>();
    for (const h of historial) {
      const x = porItem.get(h.idMaterialOp);
      if (!x) porItem.set(h.idMaterialOp, { n: 1, ultima: h.creadoEn });
      else {
        x.n++;
        if (h.creadoEn > x.ultima) x.ultima = h.creadoEn;
      }
    }

    const nombre = await this.nombres(
      filas.flatMap((m) => [m.creadoPor, m.entregadoPor]).concat(idUsuario),
    );

    const items: FilaExport[] = filas.map((m) => {
      const h = porItem.get(m.idMaterialOp);
      return {
        idMaterialOp: m.idMaterialOp,
        ordenPlanificacion: m.ordenPlanificacion,
        fechaPlanificador: aDia(m.fechaPlanificador),
        fechaCarga: diaGT(m.creadoEn),
        fechaEntrega: m.fechaEntrega ? aDia(m.fechaEntrega) : null,
        codigoOp: m.codigoOp,
        cliente: m.ordenProduccion?.cliente?.nombre ?? null,
        opLigada: m.idOrdenProduccion != null,
        insumoCodigo: m.insumo.codigo,
        insumoDescripcion: m.insumo.descripcion,
        unidad: m.insumo.unidad.nombre,
        cantidad: Number(m.cantidad),
        estado: m.anuladoEn
          ? 'ANULADO'
          : m.entregadoEn
            ? 'ENTREGADO'
            : 'PENDIENTE',
        salidaSac: m.salidaSac,
        entregadoPor: m.entregadoPor
          ? (nombre.get(m.entregadoPor) ?? null)
          : null,
        cargadoPor: nombre.get(m.creadoPor) ?? `Usuario ${m.creadoPor}`,
        idCarga: m.carga?.idCargaMaterial ?? null,
        archivo: m.carga?.nombreArchivo ?? null,
        comentario: m.comentario,
        motivoAnulacion: m.motivoAnulacion,
        sinCosto: m.costoUnitario == null,
        // El dinero solo con `ver_financiero`; "sin costo" es un estado, no dinero.
        costoUnitario:
          p.verDinero && m.costoUnitario != null
            ? Number(m.costoUnitario)
            : null,
        costoTotal:
          p.verDinero && m.costoTotal != null ? Number(m.costoTotal) : null,
        modificaciones: h?.n ?? 0,
        ultimaModificacion: h?.ultima ?? null,
      };
    });

    // Un acto es UNA fila de historial; en el Excel va una fila por campo
    // cambiado, que es lo que se puede filtrar y leer.
    const eventos: EventoExport[] = historial.flatMap((h): EventoExport[] => {
      const base = {
        idMaterialOp: h.idMaterialOp,
        fecha: h.creadoEn,
        accion: h.accion,
        codigoOp: h.materialOp.codigoOp,
        ordenPlanificacion: h.materialOp.ordenPlanificacion,
        insumo: `${h.materialOp.insumo.codigo} · ${h.materialOp.insumo.descripcion}`,
        motivo: h.motivo,
        usuario: h.usuarioNombre,
      };
      const cambios = sinDinero(leerCambios(h.cambios), p.verDinero);
      return cambios.length
        ? cambios.map((c) => ({
            ...base,
            campo: c.campo,
            antes: c.antes,
            despues: c.despues,
          }))
        : [{ ...base, campo: null, antes: null, despues: null }];
    });

    const filtros: string[] = [];
    if (f.estado && f.estado !== 'todos')
      filtros.push(`estado: ${ETIQUETA_ESTADO[f.estado] ?? f.estado}`);
    if (f.ordenPlanificacion)
      filtros.push(`orden de planificación: ${f.ordenPlanificacion}`);
    if (f.op) filtros.push(`OP: ${f.op}`);
    if (f.insumo) filtros.push(`insumo: ${f.insumo}`);
    if (f.salida) filtros.push(`salida SAC: ${f.salida}`);
    if (f.desde || f.hasta)
      filtros.push(
        `${ETIQUETA_CAMPO_FECHA[f.campoFecha ?? 'planificador']}: ${f.desde ?? '…'} a ${f.hasta ?? '…'}`,
      );
    if (f.soloMios) filtros.push('solo lo que cargó quien exporta');

    const buffer = await construirExcelMateriales({
      empresa: empresa?.nombreComercial || empresa?.razonSocial || '',
      generadoPor: nombre.get(idUsuario) ?? `Usuario ${idUsuario}`,
      generadoEn: new Date(),
      filtros,
      truncado:
        total > items.length ? { total, exportados: items.length } : null,
      verDinero: p.verDinero,
      items,
      eventos,
    });

    const hoy = diaGT(new Date());
    const rango =
      f.desde || f.hasta ? `_${f.desde ?? 'inicio'}_a_${f.hasta ?? hoy}` : '';
    return { buffer, nombre: `explosion_materiales${rango}_${hoy}.xlsx` };
  }
}
