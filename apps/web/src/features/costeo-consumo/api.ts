import { apiFetch } from '@/lib/api'
import type { OrdenConsumo } from './types'

export const costeoConsumoApi = {
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
