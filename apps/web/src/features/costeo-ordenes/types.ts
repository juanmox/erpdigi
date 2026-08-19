export interface FilaTallaCantidad {
  talla: string
  cantidad: number
}

export interface FilaPreviewLinea {
  fila: number
  opTexto: string
  opAnio: number | null
  opCorrelativo: number | null
  clienteCodigo: string | null
  idCliente: number | null
  lineaProductoNombre: string | null
  idLineaProducto: number | null
  ordenCompraOp: string | null
  fechaRecibidoOp: string | null
  fechaCompromisoOp: string | null
  codigoLine: string
  productoCodigo: string | null
  idProducto: number | null
  desarrollo: string | null
  impresoraCodigo: string | null
  idImpresora: number | null
  enguiamientoYd: number
  fechaData: string | null
  fechaCliente: string | null
  fechaEntregar: string | null
  estatus: string
  prioridad: string | null
  imagen: string | null
  tallas: FilaTallaCantidad[]
  totalPiezas: number
  error: string | null
}

export interface LineaProduccionDetalle {
  idLineaProduccion: number
  codigoLine: string
  estatus: string
  enguiamientoYd: string
  desarrollo: string | null
  consumoEnBlanco: boolean
  producto: { idProducto: number; codigo: string; descripcion: string }
  tallas: { talla: { nombre: string }; cantidad: number }[]
}

export interface ClienteRef {
  idCliente: number
  codigo: string
  nombre: string
}

export interface LineaProductoDetalle {
  idLineaProducto: number
  nombre: string
  activo: boolean
  cliente: ClienteRef
}

export interface OrdenProduccionDetalle {
  idOrdenProduccion: number
  codigo: string
  anio: number
  correlativo: number
  ordenCompra: string | null
  estatus: string
  cliente: { idCliente: number; codigo: string; nombre: string } | null
  lineaProducto: { idLineaProducto: number; nombre: string } | null
  lineasProduccion: LineaProduccionDetalle[]
}
