export interface Departamento {
  idDepartamento: number
  codigo: string
  nombre: string
}

export interface Defecto {
  idDefecto: number
  codigo: string
  nombre: string
  categoria: string | null
  imputableA: string | null
}

export interface Calandra {
  idCalandra: number
  codigo: string
}

export interface Impresora {
  idImpresora: number
  codigo: string
}

export interface InsumoTela {
  idInsumo: number
  codigo: string
  descripcion: string
  /** Nombre de la categoría. Se usa para quedarse solo con las telas. */
  categoria?: string
  /**
   * Nombre de la unidad. Ojo: el catálogo (`/recetas/insumos`) la devuelve
   * como texto plano, mientras que la línea ya guardada
   * (`ReposicionInsumo.insumo.unidad`) la trae como `{ nombre }` — son dos
   * formas distintas del mismo dato, no un descuido.
   */
  unidad?: string
}

export type TipoReposicion = 'REIMPRESION' | 'MATERIALES'

/** Una linea de material de una reposicion tipo MATERIALES. */
export interface ReposicionInsumo {
  idReposicionInsumo: number
  cantidad: string
  insumo: {
    idInsumo: number
    codigo: string
    descripcion: string
    /** La unidad se lee del catalogo, nunca se guarda en la linea. */
    unidad: { nombre: string }
  }
}

/** Una pieza del catálogo (cuello, manga, frontal…). */
export interface Pieza {
  idPieza: number
  nombre: string
}

/** Una pieza con su estado y uso, para el mantenimiento del catálogo. */
export interface PiezaAdmin extends Pieza {
  activo: boolean
  /** Cuántas líneas de prendas repuestas la usan. */
  usos: number
}

/** Un producto de los ítems de la orden con sus tallas: lo único que se puede elegir como prenda. */
export interface PrendaDisponible {
  idProducto: number
  codigo: string
  descripcion: string | null
  estilo: string | null
  tallas: { idTalla: number; nombre: string; cantidadPedida: number }[]
}

export interface SiguienteNumero {
  siguienteNumero: number
  cliente: string | null
  estilos: string[]
  /** Si la orden no tiene ítems (las migradas del legacy) no se piden prendas. */
  tieneItems: boolean
  prendasDisponibles: PrendaDisponible[]
}

/** Una prenda repuesta, ya guardada, con producto y talla resueltos. */
export interface ReposicionPrenda {
  idReposicionPrenda: number
  cantidad: number
  producto: { idProducto: number; codigo: string; descripcion: string | null; estilo: { nombre: string } | null }
  talla: { idTalla: number; nombre: string; orden: number }
  pieza: Pieza
}

export interface Reposicion {
  idReposicion: number
  fecha: string
  numeroRepo: number
  codigoRepo: string
  /** REIMPRESION (papel + tela) o MATERIALES (N insumos). Excluyentes. */
  tipo: TipoReposicion
  bodegaSac: string | null
  yardasPapel: string
  yardasTela: string
  comentario: string | null
  creadoEn: string
  anuladoEn: string | null
  motivoAnulacion: string | null
  departamento: Departamento
  defecto: Defecto
  empleado: { nombres: string } | null
  impresora: Impresora | null
  calandra: Calandra | null
  tipoPapel: { nombre: string } | null
  insumoTela: InsumoTela | null
  reposicionInsumos: ReposicionInsumo[]
  /** Qué prendas cubre. Vacío en las reposiciones migradas del legacy. */
  prendas: ReposicionPrenda[]
  ordenProduccion: {
    codigo: string
    cliente: { nombre: string } | null
  }
  /** Flujo de validaciones (2026-11-17). Las anteriores son HISTORICA. */
  estado: EstadoReposicion
  pasoPendiente: number | null
  estadoDesde: string | null
  idOrdenProduccion: number
  requisicion: Requisicion | null
}

export type EstadoReposicion =
  | 'EN_VALIDACION'
  | 'DEVUELTA'
  | 'POR_IMPRIMIR'
  | 'POR_DESPACHAR'
  | 'DESPACHADA'
  | 'HISTORICA'

export interface Requisicion {
  numero: number
  impresiones: number
  numeroTalonario: string | null
  despachadaEn: string | null
}

export interface ValidacionHecha {
  paso: number
  usuario: string
  fecha: string
}

/** Una reposición con su requisición y la cadena de validaciones, para imprimir. */
export interface ReposicionParaImprimir extends Reposicion {
  creadoPorNombre: string | null
  validaciones: (ValidacionHecha & { nombrePaso: string })[]
}

/** Una fila del seguimiento: los datos del formulario y dónde está en el flujo. */
export interface FilaSeguimiento {
  idReposicion: number
  codigo: string
  codigoRepo: string
  codigoOp: string
  cliente: string | null
  fecha: string
  creadoEn: string
  tipo: TipoReposicion
  estado: EstadoReposicion
  pasoPendiente: number | null
  estadoDesde: string | null
  anuladoEn: string | null
  motivoAnulacion: string | null
  departamento: string
  defecto: string
  responsable: string | null
  bodegaSac: string | null
  impresora: string | null
  calandra: string | null
  tipoPapel: string | null
  tela: { codigo: string; descripcion: string } | null
  yardasPapel: number
  yardasTela: number
  comentario: string | null
  prendas: { producto: string; talla: string; pieza: string; cantidad: number }[]
  materiales: { codigo: string; descripcion: string; unidad: string; cantidad: number }[]
  creadoPor: number
  creadoPorNombre: string | null
  esMia: boolean
  validaciones: ValidacionHecha[]
  devolucion: { paso: number; usuario: string; fecha: string; motivo: string | null } | null
  requisicion: Requisicion | null
  acciones: {
    validar: boolean
    motivoNoValidar: string | null
    corregir: boolean
    imprimir: boolean
    despachar: boolean
    anular: boolean
  }
}

export interface ResumenSeguimiento {
  porPaso: { paso: number; nombre: string; cantidad: number }[]
  devueltas: number
  porImprimir: number
  porDespachar: number
  despachadas: number
  porValidar: number
  devueltasMias: number
  pasosQueValido: number[]
  puedeImprimir: boolean
  puedeDespachar: boolean
  creadores: { idUsuario: number; nombre: string }[]
}

/** Lo que consulta el aviso global cada minuto (`GET seguimiento/avisos`). */
export interface AvisosReposiciones {
  /** Lo que este usuario puede mover ahora (sus pasos, imprimir, despachar). */
  total: number
  /** Desde cuándo espera lo más nuevo de su cola: sirve para saber si llegó algo. */
  masReciente: string | null
  grupos: { clave: string; etiqueta: string; cantidad: number }[]
  /** Las que creó este usuario y le devolvieron para corregir. */
  devueltas: { cantidad: number; masReciente: string | null }
}

export interface PaginaSeguimiento {
  total: number
  pagina: number
  porPagina: number
  paginas: number
  filas: FilaSeguimiento[]
  resumen: ResumenSeguimiento
}

export interface EventoReposicion {
  idEvento: number
  accion: string
  paso: number
  nombrePaso: string
  usuario: string
  desde: string
  fecha: string
  segundos: number
  motivo: string | null
  cambios: { campo: string; antes: string | null; despues: string | null }[]
}

export interface FallaLote {
  idReposicion: number
  codigo: string | null
  motivo: string
  sinRollo?: boolean
}

export interface ResultadoLote {
  hechas: number
  idsHechas: number[]
  fallidas: FallaLote[]
}

export interface MetricasReposiciones {
  desde: string | null
  hasta: string | null
  horasAmarillo: number
  horasRojo: number
  porPaso: {
    paso: number
    nombre: string
    accion: string
    cantidad: number
    promedioHoras: number | null
    medianaHoras: number | null
    p90Horas: number | null
    maximoHoras: number | null
  }[]
  porUsuario: {
    paso: number
    nombrePaso: string
    usuario: string
    validadas: number
    devueltas: number
    promedioHoras: number | null
    p90Horas: number | null
    maximoHoras: number | null
  }[]
  porCreador: { usuario: string; creadas: number; devueltas: number }[]
  devoluciones: {
    fecha: string
    codigo: string
    paso: number
    nombrePaso: string
    usuario: string
    motivo: string | null
    creador: string | null
  }[]
  ciclo: { cantidad: number; promedioHoras: number | null; medianaHoras: number | null; p90Horas: number | null }
  enCursoPorPaso: {
    paso: number
    nombre: string
    cantidad: number
    masAntiguaHoras: number | null
    mas24: number
    mas48: number
  }[]
  enCurso: { idReposicion: number; codigo: string; paso: number; nombrePaso: string; horas: number | null; creador: string | null }[]
}
