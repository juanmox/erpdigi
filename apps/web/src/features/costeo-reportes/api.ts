import { apiFetch, descargarArchivo } from '@/lib/api'
import type { FiltrosConsumo, ReporteConsumo } from './types'

/** Los filtros vacíos no viajan: el servidor los trata como "sin filtro". */
function query(f: FiltrosConsumo) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
  return p.toString()
}

export const costeoReportesApi = {
  consumo: (f: FiltrosConsumo) =>
    apiFetch<ReporteConsumo>(`/costeo/reportes/consumo?${query(f)}`),
  consumoExcel: (f: FiltrosConsumo) =>
    descargarArchivo(
      `/costeo/reportes/consumo/excel?${query(f)}`,
      // Sin rango de fecha (filtrando solo por OF) no hay "desde"/"hasta" que
      // nombrar — mismo criterio que el nombre que arma el backend.
      f.desde && f.hasta
        ? `consumo_por_op_${f.desde}_a_${f.hasta}.xlsx`
        : `consumo_por_op_${f.ofs?.replace(/,/g, '_') ?? 'ordenes_de_facturacion'}.xlsx`,
    ),
}
