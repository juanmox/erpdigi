export interface FilaPreviewOfOp {
  fila: number
  opTexto: string
  ofTexto: string
  fechaOfTexto: string
  numeroFacturaTexto: string
  fechaFacturaTexto: string
  codigoOp: string | null
  clienteOp: string | null
  codigoOf: string | null
  fechaOf: string | null
  numeroFactura: string | null
  fechaFactura: string | null
  estado: 'nueva' | 'ya_cargada' | null
  error: string | null
}

export interface OrdenFacturacionListado {
  idOrdenFacturacion: number
  codigo: string
  fecha: string
  cliente: string
  numeroFactura: string | null
  fechaFactura: string | null
  cantidadOps: number
  anuladaEn: string | null
  origen: 'PLANTILLA' | 'MODULO'
}

export interface OfDetalleOp {
  idOfOp: number
  codigoOp: string
  estatusOp: string
  asignadoEn: string
  asignadoPor: string | null
}

export interface OfDetalleOpHistorial extends OfDetalleOp {
  anuladoEn: string
  anuladoPor: string | null
  motivoAnulacion: string | null
}

export interface OrdenFacturacionDetalle {
  idOrdenFacturacion: number
  codigo: string
  fecha: string
  cliente: string
  idCliente: number
  tipoServicio: string | null
  numeroFactura: string | null
  fechaFactura: string | null
  origen: 'PLANTILLA' | 'MODULO'
  creadoEn: string
  creadoPor: string | null
  anuladaEn: string | null
  anuladaPor: string | null
  motivoAnulacion: string | null
  ops: OfDetalleOp[]
  opsHistorial: OfDetalleOpHistorial[]
}

export interface FiltrosListadoOf {
  idCliente?: number
  codigos?: string
  codigoDesde?: string
  codigoHasta?: string
  numeroFactura?: string
  fechaOfDesde?: string
  fechaOfHasta?: string
  fechaFacturaDesde?: string
  fechaFacturaHasta?: string
  estado?: 'sin_factura' | 'facturada' | 'anulada'
}
