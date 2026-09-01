import { apiFetch } from '@/lib/api'
import type { LineaPendiente, OrdenConsumo } from './types'

export const costeoConsumoApi = {
  /** Trabajo pendiente; sin impresora devuelve el de todas. */
  pendientes: (idImpresora?: number) =>
    apiFetch<{ lineas: LineaPendiente[] }>(
      `/costeo/consumo-papel/pendientes${idImpresora ? `?idImpresora=${idImpresora}` : ''}`,
    ),

  obtenerOrden: (codigo: string) =>
    apiFetch<OrdenConsumo>(`/costeo/consumo-papel/orden/${encodeURIComponent(codigo)}`),

  capturar: (body: {
    idLineaProduccion: number
    idImpresora?: number
    fecha?: string
    observacion?: string
  }) =>
    apiFetch<{ creadas: number; yaEstaban: string[]; codigoLine: string }>(
      '/costeo/consumo-papel',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  anular: (idConsumoPapel: number, motivo?: string) =>
    apiFetch<{ anulado: boolean }>(`/costeo/consumo-papel/${idConsumoPapel}/anular`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo }),
    }),
}
