/** Una prenda repuesta, con el producto, la talla y la pieza ya resueltos a texto. */
export interface PrendaResumible {
  producto: string
  talla: string
  pieza?: string | null
  cantidad: number | string
}

/**
 * `BSN-FB01N M×1 MANGA IZQ, XL×2 CUELLO V · UA-FB02MJ L×3 PRENDA COMPLETA`, para
 * una sola celda.
 *
 * Agrupado por PRODUCTO: una reposición suele cubrir varias tallas y piezas del
 * mismo producto, y repetir el código en cada una alargaría la celda sin decir
 * nada.
 *
 * Vive acá y no en cada pantalla porque lo usan la tabla de Reposiciones, la
 * requisición impresa y el reporte de consumo; tres copias del mismo formato se
 * desincronizan (mismo criterio que `resumirMateriales`). El equivalente del
 * backend es `resumirPrendas()` en `apps/api/src/common/prendas-texto.ts`.
 */
export function resumirPrendas(prendas: PrendaResumible[]): string {
  const porProducto = new Map<string, string[]>()
  for (const p of prendas) {
    const partes = porProducto.get(p.producto) ?? []
    partes.push(`${p.talla}×${p.cantidad}${p.pieza ? ` ${p.pieza}` : ''}`)
    porProducto.set(p.producto, partes)
  }
  return [...porProducto].map(([producto, partes]) => `${producto} ${partes.join(', ')}`).join(' · ')
}
