import { apiFetch, descargarArchivo } from '@/lib/api'
import type { CategoriaInsumo, FilaPreviewAltaInsumo, FilaPreviewPrecio, InsumoCatalogo, UnidadMedida } from './types'

export type EstadoInsumo = 'activos' | 'inactivos' | 'todos'

export const inventarioApi = {
  // Selectores del alta. Van bajo `inventario.insumo.ver`, no bajo el
  // `recetas.catalogo.ver` que abre todo Recetas.
  categorias: () => apiFetch<CategoriaInsumo[]>('/inventario/insumos/categorias'),
  unidades: () => apiFetch<UnidadMedida[]>('/inventario/insumos/unidades'),

  listarInsumos: (estado: EstadoInsumo = 'activos') =>
    apiFetch<InsumoCatalogo[]>(`/inventario/insumos?estado=${estado}`),
  crearInsumo: (body: { codigo: string; descripcion: string; idCategoria: number; idUnidad: number; costoPromedio?: number }) =>
    apiFetch<{ idInsumo: number }>('/inventario/insumos', { method: 'POST', body: JSON.stringify(body) }),
  editarInsumo: (id: number, body: { descripcion: string; idCategoria: number; idUnidad: number }) =>
    apiFetch(`/inventario/insumos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  cambiarActivoInsumo: (id: number, activo: boolean) =>
    apiFetch(`/inventario/insumos/${id}/activo`, { method: 'PATCH', body: JSON.stringify({ activo }) }),

  previewImportarAltas: (archivo: File) =>
    apiFetch<{ filas: FilaPreviewAltaInsumo[] }>('/inventario/insumos/importar-altas/preview', { method: 'POST', body: archivo }),
  altasInsumos: (altas: { codigo: string; descripcion: string; idCategoria: number; idUnidad: number; costoPromedio?: number }[]) =>
    apiFetch<{ creados: number }>('/inventario/insumos/altas', { method: 'POST', body: JSON.stringify({ altas }) }),

  // costos
  guardarPrecios: (cambios: { idInsumo: number; costoPromedio: number }[]) =>
    apiFetch<{ actualizados: number }>('/inventario/insumos/precios', { method: 'POST', body: JSON.stringify({ cambios }) }),
  previewImportarPrecios: (archivo: File) =>
    apiFetch<{ filas: FilaPreviewPrecio[] }>('/inventario/insumos/importar/preview', { method: 'POST', body: archivo }),

  // descargas protegidas (requieren Bearer token, se resuelven con fetch+blob)
  exportarInsumos: () =>
    descargarArchivo('/inventario/insumos/export', `insumos_${new Date().toISOString().slice(0, 10)}.xlsx`),
  plantillaAltaInsumos: () => descargarArchivo('/inventario/insumos/plantilla-alta', 'plantilla_alta_insumos.xlsx'),
  plantillaPrecios: () => descargarArchivo('/inventario/insumos/plantilla-precios', 'plantilla_precios_insumos.xlsx'),
}
