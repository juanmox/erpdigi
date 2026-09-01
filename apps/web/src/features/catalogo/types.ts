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
  /// Línea de prenda (YOUTH·ADULT·MEN·WOMEN·LADIES_FIT·NUMERICA·PANT·COMBINADA).
  /// Solo agrupa los selectores; no participa de ningún cálculo.
  grupo: string | null
  /// Las 13 tallas de uso cotidiano; van primero en los selectores.
  frecuente: boolean
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
  /// Estado del desarrollo asignado (null si no tiene).
  estadoDesarrollo: string | null
}

/// Línea de receta. Pertenece al DESARROLLO, no al producto (2026-08-26).
export interface LineaReceta {
  idDesarrolloInsumo: number
  idInsumo: number
  codigo: string
  descripcion: string
  categoria: string
  ordenCategoria: number
  unidad: string
  consumo: number
  /// El backend ya devuelve el costo calculado — nunca se calcula en el cliente.
  costoPromedio: number
  costoTotal: number
  idArea: number | null
  area: string | null
}

export type EstadoDesarrollo = 'BORRADOR' | 'APROBADO'

/// Prototipo de una prenda: dueño de la receta y de la mano de obra.
export interface Desarrollo {
  idDesarrollo: number
  codigo: string
  descripcion: string
  estado: EstadoDesarrollo
  idCliente: number | null
  clienteNombre: string | null
  idTallaBase: number | null
  tallaBase: string | null
  minutosMo: number
  costoMoMinuto: number
  notas: string | null
  activo: boolean
  aprobadoEn: string | null
  /// Producto al que ya está asignado (null si todavía está libre).
  productoCodigo: string | null
  productoActivo: boolean | null
  costoInsumos: number
  costoManoObra: number
  costoUnitario: number
  lineas: number
}

export interface ManoObraDesarrollo {
  categoria: string
  descripcion: string
  consumo: number
  unidad: string
  area: string | null
  costoPromedio: number
  costoTotal: number
}

export interface DesarrolloDetalle extends Desarrollo {
  insumos: LineaReceta[]
  manoObra: ManoObraDesarrollo | null
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
  error: string | null
}

// Preview del import de desarrollos (dos hojas: cabecera + receta). Reemplaza
// al preview de "Productos + Receta", que murió con ese import: la receta ya
// no cuelga del producto.
export interface FilaPreviewDesarrollo {
  fila: number
  codigo: string
  descripcion: string
  clienteCodigo: string | null
  idCliente: number | null
  tallaBase: string | null
  idTallaBase: number | null
  minutosMo: number | null
  costoMoMinuto: number | null
  notas: string | null
  yaExiste: boolean
  error: string | null
}

export interface FilaPreviewInsumoDesarrollo {
  fila: number
  desarrolloCodigo: string
  insumoCodigo: string
  consumo: number | null
  area: string | null
  desarrolloNuevo: boolean
  /** El desarrollo ya tiene ese insumo en esa área: aplicar actualiza el consumo. */
  yaCargada: boolean
  error: string | null
}
