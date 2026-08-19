import { apiFetch, descargarArchivo } from '@/lib/api'
import type { ConsumoEstandarDetalle, FilaPreviewConsumoEstandar } from './types'

async function subirArchivo<T>(path: string, archivo: File): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: archivo })
}

export const costeoEstandarApi = {
  listar: (producto?: string, historial?: boolean) => {
    const params = new URLSearchParams()
    if (producto) params.set('producto', producto)
    if (historial) params.set('historial', 'true')
    const qs = params.toString()
    return apiFetch<ConsumoEstandarDetalle[]>(`/costeo/estandar${qs ? `?${qs}` : ''}`)
  },
  crear: (dto: { idProducto: number; idTalla: number; pulgadasPapel: number; vigenteDesde?: string; vigenteHasta?: string }) =>
    apiFetch<ConsumoEstandarDetalle>('/costeo/estandar', { method: 'POST', body: JSON.stringify(dto) }),
  previewImportar: (archivo: File) =>
    subirArchivo<{ filas: FilaPreviewConsumoEstandar[] }>('/costeo/estandar/importar/preview', archivo),
  aplicarImportar: (filas: FilaPreviewConsumoEstandar[]) =>
    apiFetch<{ creados: number; reemplazados: number; corregidos: number }>('/costeo/estandar/importar/aplicar', {
      method: 'POST',
      body: JSON.stringify({ filas }),
    }),
  plantillaImportar: () => descargarArchivo('/costeo/estandar/plantilla-importar', 'plantilla_consumo_estandar.xlsx'),
}
