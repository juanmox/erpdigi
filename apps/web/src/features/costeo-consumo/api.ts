import { apiFetch } from '@/lib/api'
import type { LineaPendiente, OrdenConsumo, ResultadoLote } from './types'

export const costeoConsumoApi = {
  /** Trabajo pendiente; sin impresora devuelve el de todas. */
  pendientes: (idImpresora?: number) =>
    apiFetch<{ lineas: LineaPendiente[] }>(
      `/costeo/consumo-papel/pendientes${idImpresora ? `?idImpresora=${idImpresora}` : ''}`,
    ),

  obtenerOrden: (codigo: string) =>
    apiFetch<OrdenConsumo>(`/costeo/consumo-papel/orden/${encodeURIComponent(codigo)}`),

  /**
   * Envía una o varias líneas. Siempre es un arreglo, aunque sea de un
   * elemento: el backend procesa cada línea en su propia transacción y devuelve
   * un resumen, así que una línea que falle no arrastra a las demás.
   */
  capturar: (body: {
    idsLineaProduccion: number[]
    idImpresora?: number
    fecha?: string
    observacion?: string
  }) =>
    apiFetch<ResultadoLote>('/costeo/consumo-papel', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  anular: (idConsumoPapel: number, motivo?: string) =>
    apiFetch<{ anulado: boolean }>(`/costeo/consumo-papel/${idConsumoPapel}/anular`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo }),
    }),
}
