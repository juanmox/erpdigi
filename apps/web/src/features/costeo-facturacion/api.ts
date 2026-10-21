import { apiFetch, descargarArchivo } from '@/lib/api'
import type {
  FilaPreviewOfOp,
  FiltrosListadoOf,
  OrdenFacturacionDetalle,
  OrdenFacturacionListado,
} from './types'

function qs(f: FiltrosListadoOf): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const costeoFacturacionApi = {
  plantilla: () => descargarArchivo('/costeo/facturacion/plantilla', 'plantilla_ordenes_facturacion.xlsx'),
  previewImportar: (archivo: File) =>
    apiFetch<{ filas: FilaPreviewOfOp[] }>('/costeo/facturacion/importar/preview', {
      method: 'POST',
      body: archivo,
    }),
  aplicarImportar: (filas: FilaPreviewOfOp[]) =>
    apiFetch<{ ofsCreadas: number; ofsConFacturaAsignada: number; opsAsignadas: number; opsYaCargadas: number }>(
      '/costeo/facturacion/importar/aplicar',
      { method: 'POST', body: JSON.stringify({ filas }) },
    ),
  listar: (filtros: FiltrosListadoOf) =>
    apiFetch<OrdenFacturacionListado[]>(`/costeo/facturacion${qs(filtros)}`),
  obtener: (codigo: string) => apiFetch<OrdenFacturacionDetalle>(`/costeo/facturacion/${encodeURIComponent(codigo)}`),
  asignarFactura: (id: number, body: { numeroFactura: string | null; fecha: string | null }) =>
    apiFetch<OrdenFacturacionDetalle>(`/costeo/facturacion/${id}/factura`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  editarFecha: (id: number, fecha: string) =>
    apiFetch<OrdenFacturacionDetalle>(`/costeo/facturacion/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fecha }),
    }),
  agregarOp: (id: number, codigoOp: string) =>
    apiFetch<OrdenFacturacionDetalle>(`/costeo/facturacion/${id}/ops`, {
      method: 'POST',
      body: JSON.stringify({ codigoOp }),
    }),
  quitarOp: (idOfOp: number, motivo: string) =>
    apiFetch<OrdenFacturacionDetalle>(`/costeo/facturacion/ops/${idOfOp}/quitar`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo }),
    }),
  anular: (id: number, motivo: string) =>
    apiFetch<OrdenFacturacionDetalle>(`/costeo/facturacion/${id}/anular`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo }),
    }),
}
