import { apiFetch } from '@/lib/api'
import type {
  CotizacionCreada,
  CotizacionDetalleCompleto,
  CotizacionListada,
  FiltrosOpciones,
  RecetaProducto,
  ResumenMaterial,
  TipoCambio,
} from './types'

export interface FiltrosProductosQuery {
  cliente?: number
  deporte?: string
  talla?: string
  patron?: string
  desarrollo?: string
  q?: string
  estado?: 'activos' | 'inactivos' | 'todos'
  limit?: number
}

function qs(params: object): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const recetasApi = {
  tipoCambio: () => apiFetch<TipoCambio>('/recetas/tipo-cambio'),

  filtros: (params: FiltrosProductosQuery) => apiFetch<FiltrosOpciones>(`/recetas/filtros${qs(params)}`),

  productos: (params: FiltrosProductosQuery) =>
    apiFetch<{ productos: import('./types').ProductoListado[]; total: number; limit: number }>(
      `/recetas/productos${qs(params)}`,
    ),

  receta: (codigo: string) => apiFetch<RecetaProducto>(`/recetas/productos/${encodeURIComponent(codigo)}/receta`),

  crearCotizacion: (body: { items: { codigo: string; cantidad: number }[]; notas?: string; moneda?: 'GTQ' | 'USD' }) =>
    apiFetch<CotizacionCreada>('/recetas/cotizaciones', { method: 'POST', body: JSON.stringify(body) }),

  listarCotizaciones: () => apiFetch<CotizacionListada[]>('/recetas/cotizaciones'),

  obtenerCotizacion: (id: number) => apiFetch<CotizacionDetalleCompleto>(`/recetas/cotizaciones/${id}`),

  resumenMaterial: (items: { codigo: string; cantidad: number }[]) =>
    apiFetch<ResumenMaterial>('/recetas/resumen-material', { method: 'POST', body: JSON.stringify({ items }) }),
}
