import { apiFetch } from '@/lib/api'
import type { ConsultaBitacora, FiltrosBitacora, PaginaBitacora } from './types'

export const auditoriaApi = {
  listar: (q: ConsultaBitacora) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, String(v))
    return apiFetch<PaginaBitacora>(`/auditoria?${p.toString()}`)
  },
  filtros: () => apiFetch<FiltrosBitacora>('/auditoria/filtros'),
}
