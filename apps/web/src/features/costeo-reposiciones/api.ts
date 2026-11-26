import { apiFetch, descargarArchivo } from '@/lib/api'
import type {
  AvisosReposiciones,
  Calandra,
  ConfiguracionReposiciones,
  CorteConfig,
  Defecto,
  Departamento,
  EventoReposicion,
  FallaLote,
  InsumoTela,
  MetricasReposiciones,
  PaginaSeguimiento,
  Pieza,
  PiezaAdmin,
  Reposicion,
  ReposicionParaImprimir,
  ResultadoLote,
  SemaforoConfig,
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

  // ── Flujo de validaciones ──
  obtener: (idReposicion: number) => apiFetch<Reposicion>(`/costeo/reposiciones/${idReposicion}`),
  corregir: (idReposicion: number, body: Omit<CrearReposicionBody, 'codigoOp'> & { nota?: string }) =>
    apiFetch<Reposicion>(`/costeo/reposiciones/${idReposicion}`, { method: 'PATCH', body: JSON.stringify(body) }),
  avisos: () => apiFetch<AvisosReposiciones>('/costeo/reposiciones/seguimiento/avisos'),
  seguimiento: (f: FiltrosSeguimiento) => apiFetch<PaginaSeguimiento>(`/costeo/reposiciones/seguimiento?${qs(f)}`),
  exportarSeguimiento: (f: FiltrosSeguimiento) =>
    descargarArchivo(`/costeo/reposiciones/seguimiento/exportar?${qs({ ...f, pagina: undefined })}`, `reposiciones-${hoyGT()}.xlsx`),
  eventos: (idReposicion: number) => apiFetch<EventoReposicion[]>(`/costeo/reposiciones/${idReposicion}/eventos`),
  paraImprimir: (idReposicion: number) =>
    apiFetch<ReposicionParaImprimir>(`/costeo/reposiciones/${idReposicion}/para-imprimir`),
  validar: (ids: number[], paso: number, idImpresora?: number) =>
    apiFetch<ResultadoLote>('/costeo/reposiciones/validar', {
      method: 'POST',
      body: JSON.stringify({ ids, paso, ...(idImpresora ? { idImpresora } : {}) }),
    }),
  // Modo transitorio sin validaciones.
  configuracion: () => apiFetch<ConfiguracionReposiciones>('/costeo/reposiciones/configuracion'),
  configurar: (sinValidacion: boolean) =>
    apiFetch<ConfiguracionReposiciones>('/costeo/reposiciones/configuracion', {
      method: 'PATCH',
      body: JSON.stringify({ sinValidacion }),
    }),
  autorizarDirecto: (ids: number[]) =>
    apiFetch<ResultadoLote>('/costeo/reposiciones/autorizar-directo', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  devolver: (ids: number[], paso: number, motivo: string) =>
    apiFetch<ResultadoLote>('/costeo/reposiciones/devolver', {
      method: 'POST',
      body: JSON.stringify({ ids, paso, motivo }),
    }),
  imprimirRequisiciones: (ids: number[]) =>
    apiFetch<{ reposiciones: ReposicionParaImprimir[]; fallidas: FallaLote[] }>(
      '/costeo/reposiciones/requisiciones/imprimir',
      { method: 'POST', body: JSON.stringify({ ids }) },
    ),
  // Bodega: dejar lista la requisición (avisa a quien la pidió) y marcar la entrega.
  preparar: (ids: number[]) =>
    apiFetch<ResultadoLote>('/costeo/reposiciones/requisiciones/preparar', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  entregar: (items: { idReposicion: number; numeroTalonario?: string; recibidoPor?: string }[]) =>
    apiFetch<ResultadoLote>('/costeo/reposiciones/requisiciones/entregar', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  // Cortes y semáforo (costeo.reposicion.configurar). Los cortes se mandan completos.
  guardarCortes: (cortes: CorteConfig[]) =>
    apiFetch<ConfiguracionReposiciones>('/costeo/reposiciones/configuracion/cortes', {
      method: 'PUT',
      body: JSON.stringify({ cortes }),
    }),
  guardarSemaforo: (semaforo: SemaforoConfig) =>
    apiFetch<ConfiguracionReposiciones>('/costeo/reposiciones/configuracion/semaforo', {
      method: 'PATCH',
      body: JSON.stringify(semaforo),
    }),
  metricas: (desde?: string, hasta?: string) =>
    apiFetch<MetricasReposiciones>(`/costeo/reposiciones/metricas?${qs({ desde, hasta })}`),
  exportarMetricas: (desde?: string, hasta?: string) =>
    descargarArchivo(`/costeo/reposiciones/metricas/exportar?${qs({ desde, hasta })}`, `reposiciones-tiempos-${hoyGT()}.xlsx`),
}

export interface FiltrosSeguimiento {
  estado?: string
  paso?: number
  soloMias?: boolean
  porValidar?: boolean
  /** Corte asignado: día `aaaa-mm-dd` y, opcionalmente, su hora `HH:MM`. */
  corteDia?: string
  corteHora?: string
  /** `con` = pasó por las validaciones; `sin` = se autorizó al registrarla. */
  ruta?: 'con' | 'sin'
  codigoOp?: string
  idCreador?: number
  idDefecto?: number
  idDepartamento?: number
  tipo?: string
  idImpresora?: number
  producto?: string
  texto?: string
  campoFecha?: 'reposicion' | 'creacion'
  desde?: string
  hasta?: string
  pagina?: number
  porPagina?: number
}

/** Query string sin los vacíos (`undefined`, '' y `false`). */
function qs(f: object) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== false && v !== null) p.set(k, String(v))
  return p.toString()
}

function hoyGT() {
  return new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10)
}
