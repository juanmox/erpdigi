export interface CategoriaInsumo {
  idCategoria: number
  nombre: string
  orden: number
}

export interface UnidadMedida {
  idUnidad: number
  nombre: string
}

export interface InsumoCatalogo {
  idInsumo: number
  codigo: string
  descripcion: string
  activo: boolean
  idCategoria: number
  idUnidad: number
  /**
   * AUSENTE (no null) si el usuario no tiene `inventario.costo.ver`: el servidor
   * ni lo manda. 0 = el insumo todavía no tiene costo ("sin costo").
   */
  costoPromedio?: number
  categoria: string
  ordenCategoria: number
  unidad: string
}

export interface FilaPreviewPrecio {
  fila: number
  codigo: string
  encontrado: boolean
  idInsumo: number | null
  descripcion: string | null
  costoActual: number | null
  costoNuevo: number | null
  delta: number | null
  error: string | null
}

export interface FilaPreviewAltaInsumo {
  fila: number
  codigo: string
  descripcion: string
  categoria: string
  unidad: string
  idCategoria: number | null
  idUnidad: number | null
  costoInicial: number | null
  error: string | null
}
