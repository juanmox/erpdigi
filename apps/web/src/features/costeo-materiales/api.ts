import { apiFetch, descargarArchivo } from '@/lib/api'
import type {
  AccionEntrega,
  EditarMaterial,
  FilaPreviewMaterial,
  FiltrosHistorial,
  FiltrosMateriales,
  HistorialDeItem,
  HistorialGlobal,
  ListadoMateriales,
  ResultadoCarga,
} from './types'

function qs(f: object): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f))
    if (v !== undefined && v !== '' && v !== false) p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const costeoMaterialesApi = {
  plantilla: () => descargarArchivo('/costeo/materiales/plantilla', 'plantilla_explosion_materiales.xlsx'),

  previewImportar: (archivo: File) =>
    apiFetch<{ filas: FilaPreviewMaterial[] }>('/costeo/materiales/importar/preview', {
      method: 'POST',
      body: archivo,
    }),

  aplicarImportar: (filas: FilaPreviewMaterial[], nombreArchivo?: string) =>
    apiFetch<ResultadoCarga>('/costeo/materiales/importar/aplicar', {
      method: 'POST',
      body: JSON.stringify({ filas, nombreArchivo }),
    }),

  listar: (filtros: FiltrosMateriales) => apiFetch<ListadoMateriales>(`/costeo/materiales${qs(filtros)}`),

  editar: (id: number, cambios: EditarMaterial) =>
    apiFetch<{ idMaterialOp: number; modificado: boolean }>(`/costeo/materiales/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(cambios),
    }),

  anular: (ids: number[], motivo: string) =>
    apiFetch<{ anulados: number; noPermitidos: number; noEncontrados: number }>('/costeo/materiales/anular', {
      method: 'PATCH',
      body: JSON.stringify({ ids, motivo }),
    }),

  historial: (filtros: FiltrosHistorial) => apiFetch<HistorialGlobal>(`/costeo/materiales/historial${qs(filtros)}`),

  historialDeItem: (id: number) => apiFetch<HistorialDeItem>(`/costeo/materiales/${id}/historial`),

  /** Exporta lo que se ve con los filtros aplicados. */
  exportar: (filtros: FiltrosMateriales) => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })
    return descargarArchivo(`/costeo/materiales/exportar${qs(filtros)}`, `explosion_materiales_${hoy}.xlsx`)
  },

  entrega: (body: { ids: number[]; accion: AccionEntrega; salidaSac?: string; fechaEntrega?: string; motivo?: string }) =>
    apiFetch<{ aplicados: number; omitidos: number; noEncontrados: number }>('/costeo/materiales/entrega', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  congelarCostos: () =>
    apiFetch<{ actualizados: number; siguenSinCosto: number }>('/costeo/materiales/congelar-costos', {
      method: 'PATCH',
    }),
}
