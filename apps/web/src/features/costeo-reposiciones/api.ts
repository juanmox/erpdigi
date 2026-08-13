import { apiFetch } from '@/lib/api'
import type { Calandra, Defecto, Departamento, InsumoTela, Reposicion, SiguienteNumero } from './types'

export interface CrearReposicionBody {
  fecha: string
  codigoOp: string
  idDepartamento: number
  idEmpleado?: number
  idDefecto: number
  bodegaSac?: string
  yardasPapel?: number
  idImpresora?: number
  idCalandra?: number
  idInsumoTela?: number
  yardasTela?: number
  comentario?: string
}

export const costeoReposicionesApi = {
  departamentos: () => apiFetch<Departamento[]>('/costeo/reposiciones/departamentos'),
  defectos: () => apiFetch<Defecto[]>('/costeo/reposiciones/defectos'),
  calandras: () => apiFetch<Calandra[]>('/costeo/reposiciones/calandras'),
  insumosTela: () => apiFetch<InsumoTela[]>('/recetas/insumos'),
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
