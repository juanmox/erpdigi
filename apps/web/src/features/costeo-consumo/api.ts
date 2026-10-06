import { apiFetch } from '@/lib/api'
import type { EstadoEnBlanco, OrdenConsumo, Pendientes, ResultadoLote } from './types'

export const costeoConsumoApi = {
  /** Trabajo pendiente; sin impresora devuelve el de todas. */
  pendientes: (idImpresora?: number) =>
    apiFetch<Pendientes>(
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

  /**
   * Marca o desmarca el papel en blanco de una orden, con su cantidad.
   * Vive en Consumo de Papel porque crea o anula una fila de consumo.
   */
  editarEnBlanco: (codigoOp: string, consumoEnBlanco: boolean, enBlancoYd?: number) =>
    apiFetch<EstadoEnBlanco>(
      `/costeo/consumo-papel/orden/${encodeURIComponent(codigoOp)}/en-blanco`,
      { method: 'PATCH', body: JSON.stringify({ consumoEnBlanco, enBlancoYd }) },
    ),

  anular: (idConsumoPapel: number, motivo?: string) =>
    apiFetch<{ anulado: boolean }>(`/costeo/consumo-papel/${idConsumoPapel}/anular`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo }),
    }),
}
