import type { AccionHistorial } from '../types'

/** Cómo se llama cada acción del historial. Aparte de los componentes: así el refresco en caliente sigue funcionando. */
export const ETIQUETA_ACCION: Record<AccionHistorial, string> = {
  CARGA: 'Carga',
  EDITAR: 'Modificación',
  ANULAR: 'Anulación',
  ENTREGAR: 'Entrega',
  CORREGIR_FECHA: 'Fecha de entrega corregida',
  REVERTIR: 'Entrega revertida',
  COSTO_CONGELADO: 'Costo congelado',
  LIGAR_OP: 'OP cargada',
}

/** Un instante (ISO) en hora de Guatemala. */
export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
