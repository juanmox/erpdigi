import { apiFetch } from '@/lib/api'
import type { Calandra, Defecto, Departamento, InsumoTela, Reposicion, SiguienteNumero, TipoReposicion } from './types'

export interface MaterialBody {
  idInsumo: number
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
  comentario?: string
}

export const costeoReposicionesApi = {
  departamentos: () => apiFetch<Departamento[]>('/costeo/reposiciones/departamentos'),
  defectos: () => apiFetch<Defecto[]>('/costeo/reposiciones/defectos'),
  calandras: () => apiFetch<Calandra[]>('/costeo/reposiciones/calandras'),
  insumos: () => apiFetch<InsumoTela[]>('/recetas/insumos'),
  siguienteNumero: (codigoOp: string) =>
    apiFetch<SiguienteNumero>(`/costeo/reposiciones/siguiente-numero?codigoOp=${encodeURIComponent(codigoOp)}`),
  listar: (idOrdenProduccion?: number) =>
    apiFetch<Reposicion[]>(`/costeo/reposiciones${idOrdenProduccion ? `?idOrdenProduccion=${idOrdenProduccion}` : ''}`),
  crear: (body: CrearReposicionBody) =>
    apiFetch<Reposicion>('/costeo/reposiciones', { method: 'POST', body: JSON.stringify(body) }),
  anular: (idReposicion: number, motivo: string) =>
    apiFetch<Reposicion>(`/costeo/reposiciones/${idReposicion}/anular`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo }),
    }),
}
