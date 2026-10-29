/**
 * Cantidad de una orden o línea: prendas y, en un servicio de sublimación
 * continua, YARDAS. Las yardas NO son piezas (el servidor las separa), así que
 * se muestran con su propia unidad en vez de sumarse a las prendas.
 */

/** Para celdas angostas: `120`, `197 yd` o `120 · 197 yd`. */
export function cantidadCorta(piezas: number, yardas: number): string {
  const p = piezas.toLocaleString('es-GT')
  const y = yardas.toLocaleString('es-GT')
  if (yardas > 0 && piezas > 0) return `${p} · ${y} yd`
  if (yardas > 0) return `${y} yd`
  return p
}

/** Para totales: `120 pieza(s)`, `197 yd` o `120 pieza(s) · 197 yd`. */
export function cantidadConUnidad(piezas: number, yardas: number): string {
  const p = `${piezas.toLocaleString('es-GT')} pieza(s)`
  const y = `${yardas.toLocaleString('es-GT')} yd`
  if (yardas > 0 && piezas > 0) return `${p} · ${y}`
  if (yardas > 0) return y
  return p
}
