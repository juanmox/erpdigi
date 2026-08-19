import { apiFetch, descargarArchivo } from '@/lib/api'
import type {
  ClienteRef,
  FilaPreviewLinea,
  LineaProduccionDetalle,
  LineaProductoDetalle,
  OrdenProduccionDetalle,
} from './types'

async function subirArchivo<T>(path: string, archivo: File): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: archivo })
}

export const costeoOrdenesApi = {
  buscarPorCodigo: (codigo: string) => apiFetch<OrdenProduccionDetalle>(`/costeo/ordenes/${codigo}`),
  previewImportar: (archivo: File) =>
    subirArchivo<{ filas: FilaPreviewLinea[] }>('/costeo/ordenes/importar/preview', archivo),
  aplicarImportar: (filas: FilaPreviewLinea[]) =>
    apiFetch<{ ordenesCreadas: number; lineasCreadas: number }>('/costeo/ordenes/importar/aplicar', {
      method: 'POST',
      body: JSON.stringify({ filas }),
    }),
  plantillaImportar: () => descargarArchivo('/costeo/ordenes/plantilla-importar', 'plantilla_ordenes_items.xlsx'),
  clientes: () => apiFetch<ClienteRef[]>('/costeo/ordenes/clientes'),
  lineasProducto: () => apiFetch<LineaProductoDetalle[]>('/costeo/ordenes/lineas-producto'),
  crearLineaProducto: (dto: { idCliente: number; nombre: string }) =>
    apiFetch<LineaProductoDetalle>('/costeo/ordenes/lineas-producto', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  editarLineaProduccion: (id: number, consumoEnBlanco: boolean) =>
    apiFetch<LineaProduccionDetalle>(`/costeo/ordenes/lineas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ consumoEnBlanco }),
    }),
}
