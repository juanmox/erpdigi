export interface TallaConsumo {
  idTalla: number
  talla: string
  cantidad: number
  idConsumoEstandar: number | null
  /** null = no hay estándar vigente para ese producto+talla. */
  yardasEstandar: number | null
  consumoYd: number | null
  enguiamientoYd: number
  yaEnviada: boolean
  idConsumoPapel: number | null
}

export interface LineaConsumo {
  idLineaProduccion: number
  codigoLine: string
  producto: { idProducto: number; codigo: string; descripcion: string; desarrollo: string }
  impresora: { idImpresora: number; codigo: string; descripcion: string | null } | null
  tipoPapel: { idTipoPapel: number; nombre: string } | null
  factorEnguiamiento: number
  /** Lo que Diseño tecleó; solo sirve de contraste contra el calculado. */
  enguiamientoCapturadoYd: number
  estatus: string
  tallas: TallaConsumo[]
  totalPiezas: number
  totalConsumoYd: number
  totalEnguiamientoYd: number
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
    /** Papel en blanco de la orden; se gestiona solo desde esta pantalla. */
    consumoEnBlanco: boolean
    enBlancoYd: number
  }
  lineas: LineaConsumo[]
}

/** Una orden con trabajo pendiente en una impresora. */
export interface OrdenPendiente {
  idOrdenProduccion: number
  codigo: string
  cliente: string | null
  ordenCompra: string | null
  fechaCompromiso: string | null
  consumoEnBlanco: boolean
  enBlancoYd: number
  lineas: number
  totalPiezas: number
  /** Lo que se envía al marcarla: sus líneas pendientes EN ESA impresora. */
  idsLineaProduccion: number[]
  /**
   * Yardas que esta orden le va a sacar al rollo (estándar + enguiamiento + el
   * papel en blanco que falte cobrar). Lo calcula el servidor con el mismo
   * estándar que usará la captura, así que no es una aproximación de la pantalla.
   */
  estimadoYd: number
  /** Si trae tallas, el estimado está incompleto y la orden no se puede enviar. */
  tallasSinEstandar: string[]
}

/** El rollo montado ahora en una impresora. */
export interface RolloDelGrupo {
  idMontajeRollo: number
  tipoPapel: string
  codigoRollo: string
  yardasIniciales: number | null
  /** Negativo = el rollo rindió menos de lo que declaraba el fabricante. */
  yardasRestantesEstimadas: number | null
  porcentajeRestante: number | null
}

/** Otro operario viene trabajando en esta impresora. */
export interface OcupacionImpresora {
  idUsuario: number
  usuario: string
  /** ISO. Su último envío, o cuándo montó el rollo. */
  desde: string
  via: 'CONSUMO' | 'MONTAJE'
}

export interface GrupoImpresoraPendiente {
  idImpresora: number | null
  impresora: string
  ordenes: OrdenPendiente[]
  /** null = libre, o la viene usando el que está mirando. */
  ocupadaPor: OcupacionImpresora | null
  /** null = no hay rollo montado, así que no se puede enviar nada a esa máquina. */
  rollo: RolloDelGrupo | null
}

export interface Pendientes {
  grupos: GrupoImpresoraPendiente[]
  lineasDevueltas: number
  /** El tope recortó la cola: la pantalla tiene que decirlo, no callarlo. */
  truncado: boolean
}

/** Resumen de un envío: el backend procesa cada línea por separado. */
export interface ResultadoLote {
  enviadas: { codigoLine: string; tallas: number }[]
  yaEstaban: { codigoLine: string; tallas: string[] }[]
  fallidas: {
    idLineaProduccion: number
    motivo: string
    /** La impresora no tenía rollo montado: tiene arreglo propio (montar o ajustar la fecha). */
    sinRollo?: boolean
    /**
     * Otro operario está usando esa impresora. No tiene "arreglo": se confirma
     * y se reenvía, y queda registrado. Viene agrupable por impresora para no
     * repetir el mismo aviso una vez por línea.
     */
    impresoraOcupada?: { idImpresora: number; impresora: string; usuario: string }
  }[]
}

/** Respuesta de marcar/desmarcar el papel en blanco de una orden. */
export interface EstadoEnBlanco {
  codigo: string
  consumoEnBlanco: boolean
  enBlancoYd: number
  /** Ya descontado de un rollo. Si es false, se descuenta al imprimir. */
  cargado: boolean
  idMontajeRollo: number | null
}
