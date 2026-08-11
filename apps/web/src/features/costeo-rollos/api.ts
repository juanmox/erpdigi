import { apiFetch } from '@/lib/api'
import type { EstadoRollo, FacturaPapel, Impresora, MontajeDetalle, PanelItem, RolloPapel, TipoPapel } from './types'

export const costeoRollosApi = {
  listarImpresoras: () => apiFetch<Impresora[]>('/costeo/rollos/impresoras'),
  listarTiposPapel: () => apiFetch<TipoPapel[]>('/costeo/rollos/tipos-papel'),
  panel: () => apiFetch<PanelItem[]>('/costeo/rollos/panel'),
  disponibles: (idImpresora?: number) =>
    apiFetch<RolloPapel[]>(`/costeo/rollos/disponibles${idImpresora ? `?idImpresora=${idImpresora}` : ''}`),
  obtener: (idRolloPapel: number) => apiFetch<RolloPapel & { montajes: MontajeDetalle[] }>(`/costeo/rollos/${idRolloPapel}`),
  ingreso: (body: {
    numeroFactura: string
    fecha: string
    totalRollos: number
    idTipoPapel: number
    yardasPorRollo?: number
    costoUnitario?: number
  }) =>
    apiFetch<FacturaPapel & { rollos: RolloPapel[] }>('/costeo/rollos/ingreso', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  montar: (idRolloPapel: number, idImpresora: number) =>
    apiFetch<MontajeDetalle>(`/costeo/rollos/${idRolloPapel}/montar`, {
      method: 'POST',
      body: JSON.stringify({ idImpresora }),
    }),
  desmontar: (idMontajeRollo: number, body: { yardasFinales: number; estado: EstadoRollo }) =>
    apiFetch<MontajeDetalle>(`/costeo/rollos/montajes/${idMontajeRollo}/desmontar`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  detalleMontaje: (idMontajeRollo: number) => apiFetch<MontajeDetalle>(`/costeo/rollos/montajes/${idMontajeRollo}`),
}
