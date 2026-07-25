export interface CategoriaInsumo {
  idCategoria: number
  nombre: string
  orden: number
}

export interface UnidadMedida {
  idUnidad: number
  nombre: string
}

export interface AreaUso {
  idArea: number
  nombre: string
}

export interface InsumoCatalogo {
  idInsumo: number
  codigo: string
  descripcion: string
  activo: boolean
  idCategoria: number
  idUnidad: number
  costoPromedio: number
  categoria: string
  ordenCategoria: number
  unidad: string
}

export interface Cliente {
  idCliente: number
  codigo: string
  nombre: string
}

export interface Talla {
  idTalla: number
  nombre: string
  orden: number
}

export interface Deporte {
  idDeporte: number
  nombre: string
}

export interface ProductoCatalogo {
  idProducto: number
  codigo: string
  descripcion: string
  desarrollo: string | null
  tamano: string | null
  deporte: string | null
  patron: string | null
  precioVenta: number
  minutosMo: number
  costoMoMinuto: number
  idCliente: number | null
  activo: boolean
  clienteNombre: string | null
  costoUnitario: number
}

export interface LineaReceta {
  idProductoInsumo: number
  idInsumo: number
  codigo: string
  descripcion: string
  categoria: string
  ordenCategoria: number
  unidad: string
  consumo: number
  idArea: number | null
  area: string | null
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

export interface FilaPreviewAltaProducto {
  fila: number
  codigo: string
  descripcion: string
  clienteCodigo: string | null
  idCliente: number | null
  desarrollo: string | null
  patron: string | null
  tamano: string | null
  deporte: string | null
  precioVenta: number | null
  minutosMo: number | null
  costoMoMinuto: number | null
  error: string | null
}

export interface FilaPreviewProductoReceta {
  fila: number
  codigo: string
  descripcion: string
  yaExiste: boolean
  clienteCodigo: string | null
  idCliente: number | null
  desarrollo: string | null
  patron: string | null
  tamano: string | null
  deporte: string | null
  precioVenta: number | null
  minutosMo: number | null
  costoMoMinuto: number | null
  error: string | null
}

export interface FilaPreviewLineaReceta {
  fila: number
  productoCodigo: string
  insumoCodigo: string
  consumo: number | null
  area: string | null
  productoNuevo: boolean
  error: string | null
}
