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
  /** El Item. Lo genera el servidor; null en las filas con error. */
  codigoLine: string | null
  productoCodigo: string | null
  idProducto: number | null
  desarrollo: string | null
  impresoraCodigo: string | null
  idImpresora: number | null
  fechaData: string | null
  fechaCliente: string | null
  fechaEntregar: string | null
  estatus: string
  prioridad: string | null
  tallas: FilaTallaCantidad[]
  totalPiezas: number
  error: string | null
}

export interface LineaProduccionDetalle {
  idLineaProduccion: number
  codigoLine: string
  estatus: string
  enguiamientoYd: string
  /** Ya tiene consumo de producción vigente. */
  enviada: boolean
  // Desarrollo↔Producto es biunívoco — se lee del producto, nunca se
  // duplica como campo propio de la línea (evita que se desincronicen).
  producto: { idProducto: number; codigo: string; descripcion: string; desarrollo: string | null }
  tallas: { talla: { nombre: string }; cantidad: number }[]
}

export interface ClienteRef {
  idCliente: number
  codigo: string
  nombre: string
}

/** Catálogo global de tipos de prenda. Sin cliente desde el 2026-10-09. */
export interface LineaProductoDetalle {
  idLineaProducto: number
  nombre: string
  activo: boolean
}

export interface OrdenProduccionDetalle {
  /** El papel en blanco es por ORDEN: yardas fijas, no por prenda. */
  consumoEnBlanco: boolean
  enBlancoYd: number
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

/** Una línea pendiente de imprimir, dentro de su OP. */
export interface LineaPendienteOrden {
  idLineaProduccion: number
  codigoLine: string
  producto: string
  productoDescripcion: string
  impresora: string | null
  fechaCliente: string | null
  fechaEntregar: string | null
  /** Ya tiene consumo de producción vigente, o sea que se imprimió. */
  impresa: boolean
  /** Cantidad por nombre de talla; solo las tallas que la línea usa. */
  cantidades: Record<string, number>
  total: number
}

export interface OrdenPendiente {
  idOrdenProduccion: number
  codigo: string
  cliente: string | null
  lineaProducto: string | null
  ordenCompra: string | null
  fechaCompromiso: string | null
  lineas: LineaPendienteOrden[]
  totalPiezas: number
  lineasImpresas: number
}

/** `todas` incluye impresas y pendientes. */
export type EstadoListadoOrdenes = 'pendientes' | 'impresas' | 'todas'

export interface ListadoOrdenes {
  estado: EstadoListadoOrdenes
  /** Columnas de talla presentes en el resultado, en orden de catálogo. */
  tallas: string[]
  /** Cuántas OP con pendientes hay en total (puede superar a las devueltas). */
  totalOrdenes: number
  ordenes: OrdenPendiente[]
}

