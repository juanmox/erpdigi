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

const formatterFechaLarga = new Intl.DateTimeFormat('es-GT', {
  timeZone: ZONA_HORARIA_GUATEMALA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** Ej: "martes, 22 de julio" — para encabezados, no para datos tabulares. */
export function formatFechaLargaGuatemala(fecha: Date): string {
  const texto = formatterFechaLarga.format(fecha)
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
