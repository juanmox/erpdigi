import { apiFetch, descargarArchivo } from '@/lib/api'
import type {
  AreaUso,
  CategoriaInsumo,
  Cliente,
  Deporte,
  FilaPreviewAltaInsumo,
  FilaPreviewAltaProducto,
  FilaPreviewLineaReceta,
  FilaPreviewPrecio,
  FilaPreviewProductoReceta,
  InsumoCatalogo,
  LineaReceta,
  ProductoCatalogo,
  Talla,
  UnidadMedida,
} from './types'

type Estado = 'activos' | 'inactivos' | 'todos'

export interface AltaProductoBody {
  codigo: string
  descripcion: string
  idCliente?: number | null
  desarrollo?: string | null
  patron?: string | null
  tamano?: string | null
  deporte?: string | null
  precioVenta?: number | null
  minutosMo?: number | null
  costoMoMinuto?: number | null
}

async function subirArchivo<T>(path: string, archivo: File): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: archivo })
}

export const catalogoApi = {
  // referencias
  categoriasInsumo: () => apiFetch<CategoriaInsumo[]>('/recetas/categorias-insumo'),
  unidadesMedida: () => apiFetch<UnidadMedida[]>('/recetas/unidades-medida'),
  areasUso: () => apiFetch<AreaUso[]>('/recetas/areas-uso'),
  clientes: () => apiFetch<Cliente[]>('/recetas/clientes'),
  tallas: () => apiFetch<Talla[]>('/recetas/tallas'),
  deportes: () => apiFetch<Deporte[]>('/recetas/deportes'),

  // insumos
  listarInsumos: (estado: Estado = 'activos') => apiFetch<InsumoCatalogo[]>(`/recetas/insumos?estado=${estado}`),
  crearInsumo: (body: { codigo: string; descripcion: string; idCategoria: number; idUnidad: number; costoPromedio?: number }) =>
    apiFetch<{ idInsumo: number }>('/recetas/insumos', { method: 'POST', body: JSON.stringify(body) }),
  editarInsumo: (id: number, body: { descripcion: string; idCategoria: number; idUnidad: number }) =>
    apiFetch(`/recetas/insumos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  cambiarActivoInsumo: (id: number, activo: boolean) =>
    apiFetch(`/recetas/insumos/${id}/activo`, { method: 'PATCH', body: JSON.stringify({ activo }) }),
  guardarPrecios: (cambios: { idInsumo: number; costoPromedio: number }[]) =>
    apiFetch<{ actualizados: number }>('/recetas/insumos/precios', { method: 'POST', body: JSON.stringify({ cambios }) }),
  previewImportarPrecios: (archivo: File) =>
    subirArchivo<{ filas: FilaPreviewPrecio[] }>('/recetas/insumos/importar/preview', archivo),
  previewImportarAltasInsumos: (archivo: File) =>
    subirArchivo<{ filas: FilaPreviewAltaInsumo[] }>('/recetas/insumos/importar-altas/preview', archivo),
  altasInsumos: (altas: { codigo: string; descripcion: string; idCategoria: number; idUnidad: number; costoPromedio: number }[]) =>
    apiFetch<{ creados: number }>('/recetas/insumos/altas', { method: 'POST', body: JSON.stringify({ altas }) }),

  // productos
  listarProductos: (estado: Estado = 'activos') =>
    apiFetch<{ productos: ProductoCatalogo[]; total: number; limit: number }>(`/recetas/productos?estado=${estado}&limit=2000`),
  crearProducto: (body: Record<string, unknown>) =>
    apiFetch<{ idProducto: number }>('/recetas/productos', { method: 'POST', body: JSON.stringify(body) }),
  editarProducto: (id: number, body: Record<string, unknown>) =>
    apiFetch(`/recetas/productos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  cambiarActivoProducto: (id: number, activo: boolean) =>
    apiFetch(`/recetas/productos/${id}/activo`, { method: 'PATCH', body: JSON.stringify({ activo }) }),
  previewImportarAltasProductos: (archivo: File) =>
    subirArchivo<{ filas: FilaPreviewAltaProducto[] }>('/recetas/productos/importar-altas/preview', archivo),
  altasProductos: (altas: AltaProductoBody[]) =>
    apiFetch<{ creados: number }>('/recetas/productos/altas', { method: 'POST', body: JSON.stringify({ altas }) }),

  // líneas de receta
  lineasReceta: (idProducto: number) => apiFetch<LineaReceta[]>(`/recetas/productos/${idProducto}/insumos`),
  agregarLineaReceta: (idProducto: number, body: { idInsumo: number; consumo: number; idArea?: number | null }) =>
    apiFetch<{ idProductoInsumo: number }>(`/recetas/productos/${idProducto}/insumos`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  editarLineaReceta: (idProducto: number, idLinea: number, body: { consumo: number; idArea?: number | null }) =>
    apiFetch(`/recetas/productos/${idProducto}/insumos/${idLinea}`, { method: 'PATCH', body: JSON.stringify(body) }),
  eliminarLineaReceta: (idProducto: number, idLinea: number) =>
    apiFetch(`/recetas/productos/${idProducto}/insumos/${idLinea}`, { method: 'DELETE' }),

  // import masivo de recetas (multi-producto)
  previewImportarRecetas: (archivo: File) =>
    subirArchivo<{ productos: FilaPreviewProductoReceta[]; receta: FilaPreviewLineaReceta[] }>(
      '/recetas/importar-recetas/preview',
      archivo,
    ),
  aplicarImportarRecetas: (
    productos: AltaProductoBody[],
    receta: { productoCodigo: string; insumoCodigo: string; consumo: number; area?: string | null }[],
  ) =>
    apiFetch<{ productosCreados: number; lineasAplicadas: number }>('/recetas/importar-recetas/aplicar', {
      method: 'POST',
      body: JSON.stringify({ productos, receta }),
    }),

  // descargas protegidas (requieren Bearer token, se resuelven con fetch+blob)
  exportarInsumos: () => descargarArchivo('/recetas/insumos/export', `insumos_${new Date().toISOString().slice(0, 10)}.xlsx`),
  plantillaAltaInsumos: () => descargarArchivo('/recetas/insumos/plantilla-alta', 'plantilla_alta_insumos.xlsx'),
  exportarProductos: () => descargarArchivo('/recetas/productos/export', `productos_${new Date().toISOString().slice(0, 10)}.xlsx`),
  plantillaAltaProductos: () => descargarArchivo('/recetas/productos/plantilla-alta', 'plantilla_alta_productos.xlsx'),
  plantillaRecetas: () => descargarArchivo('/recetas/recetas-plantilla', 'plantilla_recetas.xlsx'),
  exportarPlantillaReceta: (idProducto: number, codigo: string) =>
    descargarArchivo(`/recetas/productos/${idProducto}/receta/exportar-plantilla`, `receta_${codigo}.xlsx`),
}
