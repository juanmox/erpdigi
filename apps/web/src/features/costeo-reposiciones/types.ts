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
}
