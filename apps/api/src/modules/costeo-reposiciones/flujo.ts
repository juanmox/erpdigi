import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Flujo de validaciones de una reposición (2026-11-17). ÚNICA fuente de la
 * secuencia: la usan el servicio que valida, el listado y las métricas. Va fija
 * en código y no en una tabla a propósito: cambiar pasos con reposiciones a mitad
 * de camino abre casos ambiguos (¿qué pasa con las que esperaban un paso que ya no
 * existe?).
 *
 *   1 creación / corrección          (costeo.reposicion.crear)
 *   2..6 validaciones                (un permiso por paso)
 *   7 impresión de la requisición    (costeo.reposicion.imprimir_requisicion)
 *   8 despacho en bodega             (costeo.reposicion.despachar)
 *
 * El papel se descuenta del rollo al validar el paso 6 (autorización), no al crear.
 */

export const ESTADOS_REPOSICION = [
  'EN_VALIDACION',
  'DEVUELTA',
  'POR_IMPRIMIR',
  'POR_DESPACHAR',
  'DESPACHADA',
  'HISTORICA',
] as const;
export type EstadoReposicion = (typeof ESTADOS_REPOSICION)[number];

/**
 * Las que ya consumieron: autorizadas (con o sin requisición) y las anteriores al
 * flujo. El reporte de costeo y las vistas analíticas cuentan solo éstas.
 */
export const ESTADOS_AUTORIZADOS: EstadoReposicion[] = [
  'POR_IMPRIMIR',
  'POR_DESPACHAR',
  'DESPACHADA',
  'HISTORICA',
];

export interface PasoValidacion {
  paso: number;
  codigo: string;
  nombre: string;
  permiso: string;
}

export const PASOS_VALIDACION: PasoValidacion[] = [
  {
    paso: 2,
    codigo: 'RESPONSABLE',
    nombre: 'Responsable del área',
    permiso: 'costeo.reposicion.validar_responsable',
  },
  {
    paso: 3,
    codigo: 'CALIDAD',
    nombre: 'Calidad',
    permiso: 'costeo.reposicion.validar_calidad',
  },
  {
    paso: 4,
    codigo: 'AUDITORIA',
    nombre: 'Auditoría',
    permiso: 'costeo.reposicion.validar_auditoria',
  },
  {
    paso: 5,
    codigo: 'ADMINISTRACION',
    nombre: 'Administración',
    permiso: 'costeo.reposicion.validar_administracion',
  },
  {
    paso: 6,
    codigo: 'AUTORIZACION',
    nombre: 'Autorización de despacho',
    permiso: 'costeo.reposicion.autorizar',
  },
];

export const PASO_AUTORIZACION = 6;
export const PASO_IMPRESION = 7;
export const PASO_DESPACHO = 8;
export const PERMISO_IMPRIMIR = 'costeo.reposicion.imprimir_requisicion';
/** Quién puede sacar copias de una requisición ya numerada. */
export const PERMISOS_COPIA_REQUISICION = [
  PERMISO_IMPRIMIR,
  'costeo.reposicion.autorizar',
  'costeo.reposicion.validar_auditoria',
];
export const PERMISO_DESPACHAR = 'costeo.reposicion.despachar';

export const NOMBRE_PASO: Record<number, string> = {
  1: 'Creación',
  ...Object.fromEntries(PASOS_VALIDACION.map((p) => [p.paso, p.nombre])),
  7: 'Impresión de requisición',
  8: 'Despacho en bodega',
};

export const permisoDelPaso = (paso: number) =>
  PASOS_VALIDACION.find((p) => p.paso === paso)?.permiso ?? null;

/** Los pasos de validación (2..6) que estos permisos habilitan. */
export const pasosQueValida = (permisos: string[]) =>
  PASOS_VALIDACION.filter((p) => permisos.includes(p.permiso)).map(
    (p) => p.paso,
  );

/** En qué paso está una reposición, para fechar el evento que la mueve. */
export function pasoActual(estado: string, pasoPendiente: number | null) {
  switch (estado) {
    case 'EN_VALIDACION':
      return pasoPendiente ?? 2;
    case 'DEVUELTA':
      return 1;
    case 'POR_IMPRIMIR':
      return PASO_IMPRESION;
    default:
      // POR_DESPACHAR, DESPACHADA, HISTORICA
      return PASO_DESPACHO;
  }
}

export type AccionEvento =
  | 'CREAR'
  | 'VALIDAR'
  | 'DEVOLVER'
  | 'CORREGIR'
  | 'IMPRIMIR'
  | 'REIMPRIMIR'
  | 'DESPACHAR'
  | 'ANULAR';

export interface CambioReposicion {
  campo: string;
  antes: string | null;
  despues: string | null;
}

export interface NuevoEventoReposicion {
  idEmpresa: number;
  idReposicion: number;
  accion: AccionEvento;
  paso: number;
  /** Cuándo quedó pendiente ese paso: de acá sale cuánto tardó. */
  desde: Date;
  ahora: Date;
  motivo?: string | null;
  cambios?: CambioReposicion[];
  idUsuario: number;
  usuarioNombre: string;
}

/**
 * Se escribe SIEMPRE dentro de la transacción del cambio. `desde` y `creadoEn`
 * salen del mismo reloj (el del servidor) para que `segundos` no dependa de la
 * diferencia de hora entre la API y la base.
 */
export async function crearEventosReposicion(
  tx: Pick<PrismaService, 'reposicionEvento'>,
  eventos: NuevoEventoReposicion[],
) {
  if (eventos.length === 0) return;
  await tx.reposicionEvento.createMany({
    data: eventos.map((e) => ({
      idEmpresa: e.idEmpresa,
      idReposicion: e.idReposicion,
      accion: e.accion,
      paso: e.paso,
      desde: e.desde > e.ahora ? e.ahora : e.desde,
      creadoEn: e.ahora,
      motivo: e.motivo?.trim() || null,
      cambios: (e.cambios ?? []) as unknown as Prisma.InputJsonValue,
      idUsuario: e.idUsuario,
      usuarioNombre: e.usuarioNombre.slice(0, 80),
    })),
  });
}

/** Lo de la base viene como JSON sin tipo: se valida antes de devolverlo. */
function comoTexto(v: Prisma.JsonValue | undefined): string | null {
  if (v == null) return null;
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export function leerCambiosReposicion(
  valor: Prisma.JsonValue,
): CambioReposicion[] {
  if (!Array.isArray(valor)) return [];
  const salida: CambioReposicion[] = [];
  for (const c of valor) {
    if (
      c &&
      typeof c === 'object' &&
      !Array.isArray(c) &&
      typeof c.campo === 'string'
    )
      salida.push({
        campo: c.campo,
        antes: comoTexto(c.antes),
        despues: comoTexto(c.despues),
      });
  }
  return salida;
}

interface EventoMinimo {
  accion: string;
  paso: number;
  idUsuario: number | null;
  creadoEn: Date;
}

/**
 * Los eventos del CICLO vigente: desde la última creación o corrección. Una
 * corrección reinicia las validaciones (los datos cambiaron), así que lo validado
 * antes ya no cuenta.
 */
export function eventosDelCiclo<T extends EventoMinimo>(eventos: T[]): T[] {
  const orden = [...eventos].sort(
    (a, b) => a.creadoEn.getTime() - b.creadoEn.getTime(),
  );
  let inicio = 0;
  orden.forEach((e, i) => {
    if (e.accion === 'CREAR' || e.accion === 'CORREGIR') inicio = i;
  });
  return orden.slice(inicio);
}

/**
 * Por qué este usuario NO puede validar (o devolver) ese paso de esa reposición,
 * o `null` si puede. Mismas reglas en el listado (para habilitar el botón) y en el
 * servidor al actuar (que es lo que manda).
 */
export function motivoNoPuedeValidar(
  r: {
    estado: string;
    pasoPendiente: number | null;
    anuladoEn: Date | null;
    creadoPor: number;
  },
  eventos: EventoMinimo[],
  paso: number,
  idUsuario: number,
  permisos: string[],
): string | null {
  const permiso = permisoDelPaso(paso);
  if (!permiso || !permisos.includes(permiso))
    return `No tenés permiso para validar el paso ${paso} (${NOMBRE_PASO[paso] ?? ''}).`;
  if (r.anuladoEn) return 'La reposición está anulada.';
  if (r.estado !== 'EN_VALIDACION')
    return r.estado === 'DEVUELTA'
      ? 'Está devuelta a quien la creó: espera su corrección.'
      : 'Ya no está en validación.';
  if (r.pasoPendiente !== paso)
    return r.pasoPendiente != null && r.pasoPendiente < paso
      ? `Todavía no la validó el paso ${r.pasoPendiente} (${NOMBRE_PASO[r.pasoPendiente]}).`
      : `Ese paso ya se validó; ahora espera el paso ${r.pasoPendiente} (${NOMBRE_PASO[r.pasoPendiente ?? 0] ?? ''}).`;
  if (r.creadoPor === idUsuario)
    return 'No podés validar una reposición que registraste vos.';
  const yaValido = eventosDelCiclo(eventos).find(
    (e) => e.accion === 'VALIDAR' && e.idUsuario === idUsuario,
  );
  if (yaValido)
    return `Ya la validaste en el paso ${yaValido.paso} (${NOMBRE_PASO[yaValido.paso]}): otro paso lo tiene que validar otra persona.`;
  return null;
}
