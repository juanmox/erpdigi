import { apiFetch, descargarArchivo } from '@/lib/api'
import type { FiltrosConsumo, ReporteConsumo } from './types'

/** Los filtros vacíos no viajan: el servidor los trata como "sin filtro". */
function query(f: FiltrosConsumo) {
  const p = new URLSearchParams({ desde: f.desde, hasta: f.hasta })
  if (f.idCliente) p.set('idCliente', f.idCliente)
  if (f.idImpresora) p.set('idImpresora', f.idImpresora)
  return p.toString()
}

export const costeoReportesApi = {
  consumo: (f: FiltrosConsumo) =>
    apiFetch<ReporteConsumo>(`/costeo/reportes/consumo?${query(f)}`),
  consumoExcel: (f: FiltrosConsumo) =>
    descargarArchivo(
      `/costeo/reportes/consumo/excel?${query(f)}`,
      `consumo_por_op_${f.desde}_a_${f.hasta}.xlsx`,
    ),
}
