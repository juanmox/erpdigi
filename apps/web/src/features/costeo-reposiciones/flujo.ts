import type { ColorSemaforo, EstadoReposicion, SemaforoReposicion } from './types'

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
  8: 'Preparación en bodega',
  9: 'Entrega al solicitante',
}

export const PASOS_VALIDACION = [2, 3, 4, 5, 6]
/** Cantidad de pasos del flujo; `pasoEnCurso` devuelve más que esto cuando terminó. */
export const TOTAL_PASOS = 9

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
  POR_DESPACHAR: 'En bodega',
  POR_RECOGER: 'Por recoger',
  DESPACHADA: 'Entregada',
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
    case 'POR_RECOGER':
      return 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-400'
    case 'DESPACHADA':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    default:
      return 'border-border text-ink-faint'
  }
}

/** En qué paso (1..9) está, para el indicador de pasos. 10 = terminada. */
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
    case 'POR_RECOGER':
      return 9
    default:
      return TOTAL_PASOS + 1
  }
}

/** Minutos como texto corto: "38 min", "1 h 05 min", "2 d 3 h". */
export function minutosTexto(min: number) {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

/** "3 h 20 min" a partir de un instante. */
export function tiempoDesde(iso: string | null, ahora = Date.now()) {
  if (!iso) return null
  return minutosTexto(Math.floor((ahora - new Date(iso).getTime()) / 60000))
}

/** Horas transcurridas desde un instante. */
export const horasDesde = (iso: string | null, ahora = Date.now()) =>
  iso ? (ahora - new Date(iso).getTime()) / 3600_000 : 0

/**
 * Color del semáforo. Los minutos que lo deciden NO viven acá: los calcula el
 * servidor (`common/cortes-reposicion.ts`) con lo que se configure en la pantalla de
 * cortes, y este módulo solo traduce el color a clases.
 */
export function claseSemaforo(color: ColorSemaforo | null | undefined) {
  switch (color) {
    case 'rojo':
      return 'text-red-600 dark:text-red-400 font-semibold'
    case 'amarillo':
      return 'text-amber-600 dark:text-amber-400 font-medium'
    case 'verde':
      return 'text-emerald-600 dark:text-emerald-400 font-medium'
    default:
      return 'text-ink-faint'
  }
}

/** El punto de color del semáforo. */
export function clasePuntoSemaforo(color: ColorSemaforo | null | undefined) {
  switch (color) {
    case 'rojo':
      return 'bg-red-500'
    case 'amarillo':
      return 'bg-amber-400'
    case 'verde':
      return 'bg-emerald-500'
    default:
      return 'bg-muted-foreground/40'
  }
}

/** El mismo color como "pastilla" (chip con fondo), para los tableros de tiempos. */
export function clasePastillaSemaforo(color: ColorSemaforo | null | undefined) {
  switch (color) {
    case 'rojo':
      return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400'
    case 'amarillo':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
    case 'verde':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    default:
      return 'border-border text-ink-faint'
  }
}

export const ETIQUETA_COLOR: Record<ColorSemaforo, string> = {
  verde: 'Verde',
  amarillo: 'Amarillo',
  rojo: 'Rojo',
  neutro: 'En recolección',
}

/** Hora `HH:MM` de Guatemala de un instante. */
export function horaGT(iso: string) {
  return new Date(iso).toLocaleTimeString('es-GT', {
    timeZone: 'America/Guatemala',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** "Corte 09:00", con el día si no es hoy: "Corte 09:00 · lun 30/11". */
export function etiquetaCorte(iso: string | null | undefined, ahora = Date.now()) {
  if (!iso) return null
  const dia = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })
  if (dia(new Date(iso).getTime()) === dia(ahora)) return `Corte ${horaGT(iso)}`
  const d = new Date(iso).toLocaleDateString('es-GT', {
    timeZone: 'America/Guatemala',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  return `Corte ${horaGT(iso)} · ${d}`
}

/**
 * Lo que dice el semáforo en una línea, según la fase:
 *   recolección "faltan 25 min" · proceso "38 min desde el corte" ·
 *   por recoger "lista hace 22 min" · entregada "corte → lista 38 min".
 */
export function textoSemaforo(s: SemaforoReposicion) {
  switch (s.fase) {
    case 'RECOLECCION':
      return `faltan ${minutosTexto(s.faltanMin ?? 0)}`
    case 'PROCESO':
      return `${minutosTexto(s.procesoMin ?? 0)} desde el corte`
    case 'POR_RECOGER':
      return `lista hace ${minutosTexto(s.esperaMin ?? 0)}`
    case 'ENTREGADA':
      return `corte → lista ${minutosTexto(s.procesoMin ?? 0)}`
  }
}

/** Duración en segundos como texto corto. */
export function duracion(segundos: number) {
  if (segundos < 60) return `${segundos} s`
  return minutosTexto(Math.floor(segundos / 60))
}

/** Tiempo total de una reposición, en corrido, desde que se registró.
 *  El reloj se detiene al entregar (fin del flujo) o al anular; si no, sigue
 *  corriendo y se mide contra ahora. Las anteriores al flujo (HISTORICA) no
 *  tienen un recorrido que medir: nacieron ya autorizadas. */
export function tiempoTotal(
  f: { estado: string; creadoEn: string; anuladoEn: string | null; requisicion: { despachadaEn: string | null } | null },
  ahora = Date.now(),
): { segundos: number; cierre: 'despachada' | 'anulada' | 'en_curso' } | null {
  if (f.estado === 'HISTORICA') return null
  const inicio = new Date(f.creadoEn).getTime()
  const fin = f.anuladoEn
    ? { t: new Date(f.anuladoEn).getTime(), cierre: 'anulada' as const }
    : f.requisicion?.despachadaEn
      ? { t: new Date(f.requisicion.despachadaEn).getTime(), cierre: 'despachada' as const }
      : { t: ahora, cierre: 'en_curso' as const }
  return { segundos: Math.max(0, Math.round((fin.t - inicio) / 1000)), cierre: fin.cierre }
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
