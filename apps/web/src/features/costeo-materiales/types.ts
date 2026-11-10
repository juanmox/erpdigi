export type EstadoMaterial = 'todos' | 'pendientes' | 'entregados' | 'anulados' | 'sin_costo' | 'sin_ligar' | 'modificados'
export type CampoFecha = 'planificador' | 'carga' | 'entrega'

export interface FiltrosMateriales {
  ordenPlanificacion?: string
  op?: string
  insumo?: string
  salida?: string
  estado?: EstadoMaterial
  campoFecha?: CampoFecha
  desde?: string
  hasta?: string
  soloMios?: boolean
}

/** Un ítem de la explosión de materiales, tal como lo devuelve el servidor. */
export interface Material {
  idMaterialOp: number
  ordenPlanificacion: string
  /** yyyy-mm-dd */
  fechaPlanificador: string
  /** ISO: el momento en que se cargó. */
  fechaCarga: string
  /** yyyy-mm-dd; null mientras esté pendiente. */
  fechaEntrega: string | null
  codigoOp: string
  /** La OP ya existe en el ERP; si no, el ítem está "suelto" hasta que se cargue. */
  opLigada: boolean
  cliente: string | null
  insumoCodigo: string
  insumoDescripcion: string
  unidad: string
  cantidad: number
  /** El insumo no tenía precio al cargar. */
  sinCosto: boolean
  /** null sin `costeo.dashboard.ver_financiero`. */
  costoUnitario: number | null
  costoTotal: number | null
  salidaSac: string | null
  entregado: boolean
  entregadoPor: string | null
  comentario: string | null
  origen: string
  creadoPor: string
  esMio: boolean
  anulado: boolean
  motivoAnulacion: string | null
  /** Cuántos cambios tiene en su historial (por cualquier razón). */
  modificaciones: number
  /** ISO del último cambio; null si nunca se tocó. */
  ultimaModificacion: string | null
  /** La regla de quién puede tocarlo la resuelve el servidor. */
  puedeModificar: boolean
}

export interface ListadoMateriales {
  total: number
  truncado: boolean
  resumen: {
    mostrados: number
    pendientes: number
    entregados: number
    sinCosto: number
    sinLigar: number
    costoTotal: number | null
  }
  items: Material[]
}

export interface FilaPreviewMaterial {
  fila: number
  fechaTexto: string
  planificadorTexto: string
  opTexto: string
  codigoTexto: string
  cantidadTexto: string
  salidaTexto: string
  comentarioTexto: string
  fecha: string | null
  ordenPlanificacion: string | null
  codigoOp: string | null
  opLigada: boolean
  insumoCodigo: string | null
  insumoDescripcion: string | null
  unidad: string | null
  cantidad: number | null
  costoUnitario: number | null
  salidaSac: string | null
  comentario: string | null
  nace: 'ENTREGADO' | 'PENDIENTE' | null
  error: string | null
  aviso: string | null
}

export interface ResultadoCarga {
  idCarga: number
  cargados: number
  entregados: number
  sinLigar: number
  sinCosto: number
}

export interface EditarMaterial {
  fechaPlanificador?: string
  ordenPlanificacion?: string
  codigoOp?: string
  codigoInsumo?: string
  cantidad?: number
  comentario?: string
  /** Obligatorio: queda en el historial del ítem. */
  motivo: string
}

export type AccionEntrega = 'ENTREGAR' | 'CORREGIR_FECHA' | 'REVERTIR'

export type AccionHistorial =
  | 'CARGA'
  | 'EDITAR'
  | 'ANULAR'
  | 'ENTREGAR'
  | 'CORREGIR_FECHA'
  | 'REVERTIR'
  | 'COSTO_CONGELADO'
  | 'LIGAR_OP'

/** Un campo que cambió, con los valores ya como texto. */
export interface CambioMaterial {
  campo: string
  antes: string | null
  despues: string | null
}

/** Un acto en la historia de UN ítem. `CARGA` es el primero y lo arma el servidor. */
export interface EventoHistorial {
  id: number
  accion: AccionHistorial
  /** ISO */
  fecha: string
  usuario: string
  motivo: string | null
  /** Solo la carga lleva detalle (el archivo). */
  detalle: string | null
  cambios: CambioMaterial[]
}

export interface HistorialDeItem {
  item: {
    idMaterialOp: number
    codigoOp: string
    ordenPlanificacion: string
    insumoCodigo: string
    insumoDescripcion: string
    unidad: string
    cantidad: number
    estado: 'PENDIENTE' | 'ENTREGADO' | 'ANULADO'
  }
  eventos: EventoHistorial[]
}

export interface FiltrosHistorial {
  /** yyyy-mm-dd: día del CAMBIO. */
  desde?: string
  hasta?: string
  accion?: string
  usuario?: string
  op?: string
  ordenPlanificacion?: string
  insumo?: string
}

/** Una fila del historial global: el acto más el ítem al que pertenece. */
export interface CambioGlobal {
  idHistorial: number
  fecha: string
  accion: AccionHistorial
  usuario: string
  motivo: string | null
  cambios: CambioMaterial[]
  idMaterialOp: number
  codigoOp: string
  ordenPlanificacion: string
  insumoCodigo: string
  insumoDescripcion: string
  unidad: string
  anulado: boolean
}

export interface HistorialGlobal {
  total: number
  truncado: boolean
  items: CambioGlobal[]
}
