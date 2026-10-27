import { apiFetch } from '@/lib/api'
import type {
  Calandra,
  Defecto,
  Departamento,
  InsumoTela,
  Pieza,
  PiezaAdmin,
  Reposicion,
  SiguienteNumero,
  TipoReposicion,
} from './types'

export interface MaterialBody {
  idInsumo: number
  cantidad: number
}

export interface PrendaBody {
  idProducto: number
  idTalla: number
  idPieza: number
  cantidad: number
}

export interface CrearReposicionBody {
  fecha: string
  codigoOp: string
  tipo?: TipoReposicion
  idDepartamento: number
  idEmpleado?: number
  idDefecto: number
  bodegaSac?: string
  yardasPapel?: number
  idImpresora?: number
  idCalandra?: number
  idInsumoTela?: number
  yardasTela?: number
  materiales?: MaterialBody[]
  prendas?: PrendaBody[]
  comentario?: string
}

export const costeoReposicionesApi = {
  departamentos: () => apiFetch<Departamento[]>('/costeo/reposiciones/departamentos'),
  defectos: () => apiFetch<Defecto[]>('/costeo/reposiciones/defectos'),
  piezas: () => apiFetch<Pieza[]>('/costeo/reposiciones/piezas'),
  calandras: () => apiFetch<Calandra[]>('/costeo/reposiciones/calandras'),
  insumos: () => apiFetch<InsumoTela[]>('/recetas/insumos'),
  siguienteNumero: (codigoOp: string) =>
    apiFetch<SiguienteNumero>(`/costeo/reposiciones/siguiente-numero?codigoOp=${encodeURIComponent(codigoOp)}`),
  listar: (idOrdenProduccion?: number) =>
    apiFetch<Reposicion[]>(`/costeo/reposiciones${idOrdenProduccion ? `?idOrdenProduccion=${idOrdenProduccion}` : ''}`),
  crear: (body: CrearReposicionBody) =>
    apiFetch<Reposicion>('/costeo/reposiciones', { method: 'POST', body: JSON.stringify(body) }),
  // Mantenimiento del catálogo de piezas (costeo.pieza.administrar).
  piezasAdmin: () => apiFetch<PiezaAdmin[]>('/costeo/piezas'),
  crearPieza: (nombre: string) =>
    apiFetch<PiezaAdmin>('/costeo/piezas', { method: 'POST', body: JSON.stringify({ nombre }) }),
  editarPieza: (idPieza: number, body: { nombre?: string; activo?: boolean }) =>
    apiFetch<PiezaAdmin>(`/costeo/piezas/${idPieza}`, { method: 'PATCH', body: JSON.stringify(body) }),
  anular: (idReposicion: number, motivo: string) =>
    apiFetch<Reposicion>(`/costeo/reposiciones/${idReposicion}/anular`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo }),
    }),
}
