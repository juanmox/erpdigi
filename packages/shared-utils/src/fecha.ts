export const ZONA_HORARIA_GUATEMALA = 'America/Guatemala'

const formatterFecha = new Intl.DateTimeFormat('es-GT', {
  timeZone: ZONA_HORARIA_GUATEMALA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const formatterFechaHora = new Intl.DateTimeFormat('es-GT', {
  timeZone: ZONA_HORARIA_GUATEMALA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatFechaGuatemala(fecha: Date): string {
  return formatterFecha.format(fecha)
}

export function formatFechaHoraGuatemala(fecha: Date): string {
  return formatterFechaHora.format(fecha)
}
