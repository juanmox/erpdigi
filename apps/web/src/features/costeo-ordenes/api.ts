import { apiFetch, descargarArchivo } from '@/lib/api'
import type {
  ClienteRef,
  EditarLineaPayload,
  EditarOrdenPayload,
  EstadoListadoOrdenes,
  FilaPreviewLinea,
  LineaProductoDetalle,
  ListadoOrdenes,
  OrdenProduccionDetalle,
  ProductoBusqueda,
  TallaCatalogo,
} from './types'

async function subirArchivo<T>(path: string, archivo: File): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: archivo })
}

export const costeoOrdenesApi = {
  buscarPorCodigo: (codigo: string) => apiFetch<OrdenProduccionDetalle>(`/costeo/ordenes/${codigo}`),
  listado: (estado: EstadoListadoOrdenes) =>
    apiFetch<ListadoOrdenes>(`/costeo/ordenes/listado?estado=${estado}`),
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
  // Catálogo global desde el 2026-10-09: sin cliente.
  crearLineaProducto: (dto: { nombre: string }) =>
    apiFetch<LineaProductoDetalle>('/costeo/ordenes/lineas-producto', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),
  // ── Edición de órdenes ya cargadas (gateado costeo.orden.editar) ──
  tallasEdicion: () => apiFetch<TallaCatalogo[]>('/costeo/ordenes/edicion/catalogos'),
  buscarProductosEdicion: (q: string) =>
    apiFetch<ProductoBusqueda[]>(`/costeo/ordenes/edicion/productos?q=${encodeURIComponent(q)}`),
  editarOrden: (id: number, dto: EditarOrdenPayload) =>
    apiFetch<{ actualizado: true }>(`/costeo/ordenes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),
  eliminarOrden: (id: number) => apiFetch<{ eliminado: true }>(`/costeo/ordenes/${id}`, { method: 'DELETE' }),
  editarLinea: (idLinea: number, dto: EditarLineaPayload) =>
    apiFetch<{ actualizado: true }>(`/costeo/ordenes/lineas/${idLinea}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),
  eliminarLinea: (idLinea: number) =>
    apiFetch<{ eliminado: true }>(`/costeo/ordenes/lineas/${idLinea}`, { method: 'DELETE' }),
}
