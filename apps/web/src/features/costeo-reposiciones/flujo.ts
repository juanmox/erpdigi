import type { EstadoReposicion } from './types'

/**
 * Nombres del flujo de validaciones. Deben coincidir con
 * `apps/api/src/modules/costeo-reposiciones/flujo.ts`, que es la fuente.
 */
export const NOMBRE_PASO: Record<number, string> = {
  1: 'Creación',
  2: 'Responsable del área',
  3: 'Calidad',
  4: 'Auditoría',
  5: 'Administración',
  6: 'Autorización de despacho',
  7: 'Impresión de requisición',
  8: 'Despacho en bodega',
}

export const PASOS_VALIDACION = [2, 3, 4, 5, 6]

export const PERMISO_PASO: Record<number, string> = {
  2: 'costeo.reposicion.validar_responsable',
  3: 'costeo.reposicion.validar_calidad',
  4: 'costeo.reposicion.validar_auditoria',
  5: 'costeo.reposicion.validar_administracion',
  6: 'costeo.reposicion.autorizar',
}

const ETIQUETA: Record<EstadoReposicion, string> = {
  EN_VALIDACION: 'En validación',
  DEVUELTA: 'Devuelta',
  POR_IMPRIMIR: 'Por imprimir',
  POR_DESPACHAR: 'Por despachar',
  DESPACHADA: 'Despachada',
  HISTORICA: 'Histórica',
}

export function etiquetaEstado(r: {
  estado: EstadoReposicion
  pasoPendiente: number | null
  anuladoEn: string | null
  sinValidacion?: boolean
}) {
  if (r.anuladoEn) return 'Anulada'
  if (r.estado === 'HISTORICA' && r.sinValidacion) return 'Sin validaciones'
  if (r.estado === 'EN_VALIDACION') return `Paso ${r.pasoPendiente}: ${NOMBRE_PASO[r.pasoPendiente ?? 2]}`
  return ETIQUETA[r.estado]
}

/** Clases del chip de estado (mismo lenguaje de color que el resto del ERP). */
export function claseEstado(r: { estado: EstadoReposicion; anuladoEn: string | null }) {
  if (r.anuladoEn) return 'border-transparent bg-muted text-muted-foreground line-through'
  switch (r.estado) {
    case 'EN_VALIDACION':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400'
    case 'DEVUELTA':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
    case 'POR_IMPRIMIR':
    case 'POR_DESPACHAR':
      return 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400'
    case 'DESPACHADA':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    default:
      return 'border-border text-ink-faint'
  }
}

/** En qué paso (1..8) está, para el indicador de pasos. 9 = terminada. */
export function pasoEnCurso(r: { estado: EstadoReposicion; pasoPendiente: number | null }) {
  switch (r.estado) {
    case 'EN_VALIDACION':
      return r.pasoPendiente ?? 2
    case 'DEVUELTA':
      return 1
    case 'POR_IMPRIMIR':
      return 7
    case 'POR_DESPACHAR':
      return 8
    default:
      return 9
  }
}

/** "hace 3 h 20 min" a partir de un instante. */
export function tiempoDesde(iso: string | null, ahora = Date.now()) {
  if (!iso) return null
  const min = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ${min % 60} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

/** Horas transcurridas desde un instante (para el semáforo). */
export const horasDesde = (iso: string | null, ahora = Date.now()) =>
  iso ? (ahora - new Date(iso).getTime()) / 3600_000 : 0

export const HORAS_AMARILLO = 24
export const HORAS_ROJO = 48

export function claseSemaforo(horas: number) {
  if (horas >= HORAS_ROJO) return 'text-red-600 dark:text-red-400 font-semibold'
  if (horas >= HORAS_AMARILLO) return 'text-amber-600 dark:text-amber-400 font-medium'
  return 'text-ink-faint'
}

/** Duración en segundos como texto corto. */
export function duracion(segundos: number) {
  if (segundos < 60) return `${segundos} s`
  const min = Math.floor(segundos / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h} h ${min % 60} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

export const fechaHoraGT = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('es-GT', {
        timeZone: 'America/Guatemala',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
