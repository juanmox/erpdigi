/**
 * Una línea de material requisado, como la devuelven tanto Reposiciones como
 * el reporte de consumo.
 *
 * La unidad viene del catálogo de insumos y nunca se convierte: el hilo se
 * guarda en yardas aunque bodega lo entregue en conos, y el largo del cono no
 * está en los datos.
 */
export interface LineaMaterialResumible {
  codigo: string
  cantidad: number | string
  unidad: string
}

/**
 * `61601403 × 12 UNIDAD · 6120100 × 500 YARDAS`, para una sola celda.
 *
 * Vive acá y no en cada pantalla porque lo usan la tabla de Reposiciones, el
 * reporte de consumo y su PDF: tres copias del mismo formato se desincronizan.
 * El equivalente del backend es `resumirMateriales()` en
 * `costeo-reportes.service.ts`, que alimenta el Excel.
 */
export function resumirMateriales(materiales: LineaMaterialResumible[]): string {
  return materiales.map((m) => `${m.codigo} × ${m.cantidad} ${m.unidad}`).join(' · ')
}
