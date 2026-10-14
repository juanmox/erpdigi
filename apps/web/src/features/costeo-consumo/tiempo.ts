/**
 * "hace 12 min" en vez de una hora absoluta: para decidir si una máquina sigue
 * ocupada, lo que importa es cuán reciente es la actividad, no a qué hora fue.
 *
 * Vive acá y no dentro de un componente porque lo usan dos pantallas del mismo
 * flujo: el aviso del encabezado de cada impresora y el resumen del envío
 * cuando el servidor frena líneas por impresora ajena.
 */
export function hace(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return `hace ${h} h ${min % 60} min`
}
