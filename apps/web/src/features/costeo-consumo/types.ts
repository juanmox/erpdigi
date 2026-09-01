export interface TallaConsumo {
  idTalla: number
  talla: string
  cantidad: number
  idConsumoEstandar: number | null
  /** null = no hay estándar vigente para ese producto+talla. */
  yardasEstandar: number | null
  consumoYd: number | null
  enguiamientoYd: number
  enBlancoYd: number
  yaEnviada: boolean
  idConsumoPapel: number | null
}

export interface LineaConsumo {
  idLineaProduccion: number
  codigoLine: string
  producto: { idProducto: number; codigo: string; descripcion: string; desarrollo: string }
  impresora: { idImpresora: number; codigo: string; descripcion: string | null } | null
  tipoPapel: { idTipoPapel: number; nombre: string } | null
  consumoEnBlanco: boolean
  factorEnBlanco: number
  factorEnguiamiento: number
  /** Lo que Diseño tecleó; solo sirve de contraste contra el calculado. */
  enguiamientoCapturadoYd: number
  estatus: string
  tallas: TallaConsumo[]
  totalPiezas: number
  totalConsumoYd: number
  totalEnguiamientoYd: number
  totalEnBlancoYd: number
  /** Todas sus tallas ya se enviaron. */
  completa: boolean
  /** Nombres de las tallas sin estándar cargado; si hay alguna, no se envía. */
  sinEstandar: string[]
  enviable: boolean
}

export interface OrdenConsumo {
  orden: {
    idOrdenProduccion: number
    codigo: string
    ordenCompra: string | null
    cliente: { idCliente: number; codigo: string; nombre: string } | null
    lineaProducto: { idLineaProducto: number; nombre: string } | null
  }
  lineas: LineaConsumo[]
}
