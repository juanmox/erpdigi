import { apiFetch, descargarArchivo } from '@/lib/api'
import type {
  AreaUso,
  CategoriaInsumo,
  Cliente,
  Deporte,
  Desarrollo,
  DesarrolloDetalle,
  FilaPreviewAltaInsumo,
  FilaPreviewAltaProducto,
  FilaPreviewDesarrollo,
  FilaPreviewInsumoDesarrollo,
  FilaPreviewPrecio,
  InsumoCatalogo,
  LineaReceta,
  ProductoCatalogo,
  Subcliente,
  Talla,
  TipoCatalogoProducto,
  UnidadMedida,
  ValorCatalogoProducto,
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
  idEstilo?: number | null
  idLinea?: number | null
  idGenero?: number | null
  idComposicion?: number | null
}

async function subirArchivo<T>(path: string, archivo: File): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: archivo })
}

export type OperadorComparacion = 'eq' | 'ne' | 'gte' | 'lte'

export interface FiltrosDesarrollos {
  q?: string
  estado?: 'BORRADOR' | 'APROBADO' | 'todos'
  idCliente?: number
  idTallaBase?: number
  sinProducto?: boolean
  producto?: 'con' | 'sin'
  /// Número de insumos de la receta: operador + valor (sin valor no filtra).
  insumosOp?: OperadorComparacion
  insumosN?: number
  /// Costo unitario (GTQ): operador + valor.
  costoOp?: OperadorComparacion
  costoN?: number
  incluirInactivos?: boolean
  limit?: number
}

function queryDesarrollos(p: FiltrosDesarrollos): string {
  const qs = new URLSearchParams()
  if (p.q) qs.set('q', p.q)
  if (p.estado) qs.set('estado', p.estado)
  if (p.idCliente) qs.set('idCliente', String(p.idCliente))
  if (p.idTallaBase) qs.set('idTallaBase', String(p.idTallaBase))
  if (p.sinProducto) qs.set('sinProducto', 'true')
  if (p.producto) qs.set('producto', p.producto)
  if (p.insumosOp && p.insumosN !== undefined) {
    qs.set('insumosOp', p.insumosOp)
    qs.set('insumosN', String(p.insumosN))
  }
  if (p.costoOp && p.costoN !== undefined) {
    qs.set('costoOp', p.costoOp)
    qs.set('costoN', String(p.costoN))
  }
  if (p.incluirInactivos) qs.set('incluirInactivos', 'true')
  if (p.limit) qs.set('limit', String(p.limit))
  return qs.toString()
}

export const catalogoApi = {
  // referencias
  categoriasInsumo: () => apiFetch<CategoriaInsumo[]>('/recetas/categorias-insumo'),
  unidadesMedida: () => apiFetch<UnidadMedida[]>('/recetas/unidades-medida'),
  areasUso: () => apiFetch<AreaUso[]>('/recetas/areas-uso'),
  clientes: () => apiFetch<Cliente[]>('/recetas/clientes'),
  subclientes: () => apiFetch<Subcliente[]>('/recetas/subclientes'),
  tallas: () => apiFetch<Talla[]>('/recetas/tallas'),
  deportes: () => apiFetch<Deporte[]>('/recetas/deportes'),
  // Catálogos que describen al producto (estilos, líneas, géneros, composiciones).
  // Devuelve TODOS con su `activo`: los selectores filtran, la pantalla de
  // catálogos necesita ver también los retirados para poder reactivarlos.
  catalogoProducto: (tipo: TipoCatalogoProducto) =>
    apiFetch<ValorCatalogoProducto[]>(`/recetas/catalogos-producto/${tipo}`),
  crearCatalogoProducto: (tipo: TipoCatalogoProducto, nombre: string) =>
    apiFetch<ValorCatalogoProducto>(`/recetas/catalogos-producto/${tipo}`, {
      method: 'POST',
      body: JSON.stringify({ nombre }),
    }),
  editarCatalogoProducto: (
    tipo: TipoCatalogoProducto,
    id: number,
    body: { nombre?: string; activo?: boolean },
  ) =>
    apiFetch<ValorCatalogoProducto>(`/recetas/catalogos-producto/${tipo}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

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

  // desarrollos (dueños de la receta desde 2026-08-26)
  listarDesarrollos: (params: FiltrosDesarrollos = {}) => {
    const s = queryDesarrollos(params)
    return apiFetch<{ desarrollos: Desarrollo[]; total: number; limit: number }>(
      `/recetas/desarrollos${s ? `?${s}` : ''}`,
    )
  },
  /// Excel con los MISMOS filtros que la pantalla (el servidor arma el WHERE una sola vez).
  exportarDesarrollos: (params: FiltrosDesarrollos = {}) => {
    const s = queryDesarrollos({ ...params, limit: undefined })
    return descargarArchivo(
      `/recetas/desarrollos/export${s ? `?${s}` : ''}`,
      `desarrollos_${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  },
  obtenerDesarrollo: (id: number) => apiFetch<DesarrolloDetalle>(`/recetas/desarrollos/${id}`),
  crearDesarrollo: (body: Record<string, unknown>) =>
    apiFetch<{ idDesarrollo: number }>('/recetas/desarrollos', { method: 'POST', body: JSON.stringify(body) }),
  editarDesarrollo: (id: number, body: Record<string, unknown>) =>
    apiFetch(`/recetas/desarrollos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  aprobarDesarrollo: (id: number) => apiFetch(`/recetas/desarrollos/${id}/aprobar`, { method: 'POST' }),
  reabrirDesarrollo: (id: number) => apiFetch(`/recetas/desarrollos/${id}/reabrir`, { method: 'POST' }),

  // líneas de receta (del desarrollo)
  lineasReceta: (idDesarrollo: number) => apiFetch<LineaReceta[]>(`/recetas/desarrollos/${idDesarrollo}/insumos`),
  agregarLineaReceta: (idDesarrollo: number, body: { idInsumo: number; consumo: number; idArea?: number | null }) =>
    apiFetch<{ idDesarrolloInsumo: number }>(`/recetas/desarrollos/${idDesarrollo}/insumos`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  editarLineaReceta: (idDesarrollo: number, idLinea: number, body: { consumo: number; idArea?: number | null }) =>
    apiFetch(`/recetas/desarrollos/${idDesarrollo}/insumos/${idLinea}`, { method: 'PATCH', body: JSON.stringify(body) }),
  eliminarLineaReceta: (idDesarrollo: number, idLinea: number) =>
    apiFetch(`/recetas/desarrollos/${idDesarrollo}/insumos/${idLinea}`, { method: 'DELETE' }),

  // Import masivo de desarrollos + receta. Reemplaza al import combinado
  // Productos+Receta, que escribía en recetas.producto_insumos (congelada).
  previewImportarDesarrollos: (archivo: File) =>
    subirArchivo<{ desarrollos: FilaPreviewDesarrollo[]; lineas: FilaPreviewInsumoDesarrollo[] }>(
      '/recetas/desarrollos/importar/preview',
      archivo,
    ),
  aplicarImportarDesarrollos: (desarrollos: FilaPreviewDesarrollo[], lineas: FilaPreviewInsumoDesarrollo[]) =>
    apiFetch<{ creados: number; lineasCreadas: number; lineasActualizadas: number }>(
      '/recetas/desarrollos/importar/aplicar',
      { method: 'POST', body: JSON.stringify({ desarrollos, lineas }) },
    ),

  // descargas protegidas (requieren Bearer token, se resuelven con fetch+blob)
  exportarInsumos: () => descargarArchivo('/recetas/insumos/export', `insumos_${new Date().toISOString().slice(0, 10)}.xlsx`),
  plantillaAltaInsumos: () => descargarArchivo('/recetas/insumos/plantilla-alta', 'plantilla_alta_insumos.xlsx'),
  plantillaPrecios: () => descargarArchivo('/recetas/insumos/plantilla-precios', 'plantilla_precios_insumos.xlsx'),
  exportarProductos: () => descargarArchivo('/recetas/productos/export', `productos_${new Date().toISOString().slice(0, 10)}.xlsx`),
  plantillaAltaProductos: () => descargarArchivo('/recetas/productos/plantilla-alta', 'plantilla_alta_productos.xlsx'),
  plantillaDesarrollos: () =>
    descargarArchivo('/recetas/desarrollos/plantilla-importar', 'plantilla_desarrollos.xlsx'),
}
