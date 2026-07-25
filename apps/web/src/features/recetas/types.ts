export interface TipoCambio {
  tasa: number | null
  fecha: string | null
  fuente: 'Banguat' | 'cache' | 'respaldo' | null
}

export interface FiltrosOpciones {
  clientes: { id: number; nombre: string }[]
  deportes: string[]
  tallas: string[]
  patrones: string[]
  desarrollos: string[]
}

export interface ProductoListado {
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

export interface InsumoReceta {
  categoria: string
  orden: number
  codigo: string | null
  descripcion: string
  consumo: number
  unidad: string
  area: string | null
  costoPromedio: number
  costoTotal: number
}

export interface ManoObra {
  categoria: string
  codigo: null
  descripcion: string
  consumo: number
  unidad: string
  area: string
  costoPromedio: number
  costoTotal: number
}

export interface RecetaProducto {
  producto: {
    idProducto: number
    codigo: string
    desarrollo: string | null
    patron: string | null
    descripcion: string
    tamano: string | null
    deporte: string | null
    precioVenta: number
    minutosMo: number
    costoMoMinuto: number
    clienteCodigo: string | null
    clienteNombre: string | null
    costoInsumos: number
    costoManoObra: number
    costoUnitario: number
  }
  insumos: InsumoReceta[]
  manoObra: ManoObra
}

export interface ItemAcumulado {
  codigo: string
  descripcion: string
  cantidad: number
  costoUnitario: number
  precioVenta: number
}

export interface CotizacionCreada {
  idCotizacion: number
  folio: string
  fechaCreacion: string
  totalCantidad: number
  totalCosto: number
  moneda: 'GTQ' | 'USD'
  tasaCambio: number | null
}

export interface CotizacionListada {
  idCotizacion: number
  folio: string
  fechaCreacion: string
  totalCantidad: number
  totalCosto: number
  notas: string | null
  moneda: 'GTQ' | 'USD'
  tasaCambio: number | null
}

export interface CotizacionDetalleLinea {
  idDetalle: number
  idProducto: number | null
  codigoProducto: string
  descripcion: string
  cantidad: number
  costoUnitario: number
  costoTotal: number
  desarrollo: string | null
  patron: string | null
  tamano: string | null
  deporte: string | null
  cliente: string | null
  precioVenta: number | null
  insumos: InsumoReceta[]
  manoObra: ManoObra | null
  fuente: 'snapshot' | 'receta_actual'
}

export interface CotizacionDetalleCompleto {
  cotizacion: CotizacionListada
  detalle: CotizacionDetalleLinea[]
}

export interface ResumenMaterialInsumo {
  categoria: string
  codigo: string
  descripcion: string
  unidad: string
  cantidadTotal: number
  costoTotal: number
}

export interface ResumenMaterial {
  totalPrendas: number
  insumos: ResumenMaterialInsumo[]
  manoObra: { minutosTotal: number; horasTotal: number; costoTotal: number }
  costoInsumos: number
  costoGeneral: number
  ventaTotalUsd: number
}
