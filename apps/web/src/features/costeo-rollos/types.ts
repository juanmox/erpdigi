export interface TipoPapel {
  idTipoPapel: number
  codigo: string
  nombre: string
  gramaje: string | null
  anchoPulgadas: string | null
  activo: boolean
}

export interface Impresora {
  idImpresora: number
  codigo: string
  descripcion: string | null
  marcaModelo: string | null
  anchoPulgadas: string | null
  idTipoPapelDefault: number | null
  activo: boolean
  tipoPapelDefault: TipoPapel | null
  orden: number
  grupo: string | null
}

/**
 * Es la factura POR TIPO DE PAPEL, o sea el ARTÍCULO: una factura del
 * proveedor puede traer varios, y cada uno tiene sus rollos numerados desde 1.
 */
export interface FacturaPapel {
  idFacturaPapel: number
  numeroFactura: string
  idTipoPapel: number
  fecha: string
  totalRollos: number
  creadoEn: string
}

export type EstadoRollo =
  | 'EN_BODEGA'
  | 'MONTADO'
  | 'AGOTADO'
  | 'DESCARTADO'
  /** Se gastó, pero NO en este ERP (típicamente antes de arrancarlo). */
  | 'CONSUMIDO_FUERA'

export interface RolloPapel {
  idRolloPapel: number
  idFacturaPapel: number
  secuencia: number
  idTipoPapel: number
  yardasIniciales: string | null
  costoUnitario: string | null
  estado: EstadoRollo
  creadoEn: string
  tipoPapel: TipoPapel
  facturaPapel: FacturaPapel
}

export interface MontajeDetalle {
  idMontajeRollo: number
  idRolloPapel: number
  idImpresora: number
  montadoEn: string
  desmontadoEn: string | null
  yardasFinales: string | null
  rolloPapel: RolloPapel
  impresora: Impresora
  /** Consumo registrado solo durante esta sesión de montaje. */
  consumoEsteMontaje: number
  /** Consumo del rollo a través de TODOS sus montajes (incluye este). */
  consumoTotalHistoricoRollo: number
  /** Lo que quedaba en el rollo al iniciar este montaje (yardas_iniciales si es el primer montaje del rollo). */
  yardasAlIniciarEsteMontaje: number | null
  /** Restante real del rollo físico ahora mismo (yardas_iniciales − consumo histórico total). */
  yardasRestantesRollo: number | null
  /** Quién montó. Se resuelve en el servidor: la columna guarda solo el id. */
  montadoPorUsuario: { idUsuario: number; username: string; nombreCompleto: string } | null
  /** Quién desmontó. null mientras el montaje siga vigente. */
  desmontadoPorUsuario: { idUsuario: number; username: string; nombreCompleto: string } | null
}

export interface RolloDeFactura {
  idRolloPapel: number
  secuencia: number
  idTipoPapel: number
  yardasIniciales: string | null
  costoUnitario: string | null
  estado: EstadoRollo
  /** Por qué está fuera de circulación. Solo cuando estado = CONSUMIDO_FUERA. */
  consumidoFueraMotivo: string | null
  tipoPapel: TipoPapel
}

export interface FacturaConRollos extends FacturaPapel {
  tipoPapel: TipoPapel
  rollos: RolloDeFactura[]
  /** false si algún rollo de esta factura ya se montó alguna vez — ver corrección de F3. */
  editable: boolean
}

export interface PanelItem {
  impresora: Impresora
  montaje: {
    idMontajeRollo: number
    idRolloPapel: number
    montadoEn: string
    rolloPapel: RolloPapel
    consumoEsteMontaje: number
    consumoTotalHistoricoRollo: number
    yardasRestantesEstimadas: number | null
    porcentajeRestante: number | null
  } | null
}

/** Una fila de la plantilla de ingreso de rollos, ya validada por el servidor. */
export interface FilaPreviewIngresoRollo {
  fila: number
  numeroFactura: string
  fecha: string
  fechaTexto: string
  tipoPapelCodigo: string
  tipoPapelNombre: string | null
  cantidadRollos: number | null
  yardasPorRollo: number | null
  costoUnitario: number | null
  error: string | null
}

interface ActorMontaje {
  idUsuario: number
  username: string
  nombreCompleto: string
}

/** Una fila del historial de montajes (pestaña Historial). */
export interface MontajeHistorial {
  idMontajeRollo: number
  impresora: { idImpresora: number; codigo: string }
  rollo: { idRolloPapel: number; codigo: string; tipoPapel: string }
  montadoEn: string
  montadoPor: ActorMontaje | null
  desmontadoEn: string | null
  desmontadoPor: ActorMontaje | null
  yardasFinales: number | null
  consumoEsteMontaje: number
  /** Lo cerró alguien distinto de quien lo montó. */
  cambioDeTurno: boolean
}

// ── Historial de ingresos a bodega ───────────────────────────────────
/** Un ARTÍCULO cargado: una fila de `factura_papel` (número + tipo de papel). */
export interface ArticuloIngresado {
  idFacturaPapel: number
  tipoPapel: { codigo: string; nombre: string }
  totalRollos: number
  /** null cuando los rollos no comparten el mismo valor (se pueden editar uno por uno). */
  yardasPorRollo: number | null
  yardasTotales: number
  costoUnitario: number | null
  creadoEn: string
  creadoPor: string | null
  /** Cuántos rollos hay en cada estado: `{ EN_BODEGA: 5, MONTADO: 1 }`. */
  estados: Record<string, number>
  /** false si algún rollo ya se montó alguna vez — ya no se puede corregir. */
  editable: boolean
}

/** Los artículos de un mismo número de factura, agrupados. */
export interface FacturaIngresada {
  numeroFactura: string
  fecha: string
  totalRollos: number
  articulos: ArticuloIngresado[]
}

export interface HistorialIngresos {
  facturas: FacturaIngresada[]
  articulos: number
  truncado: boolean
  limite: number
}

// ── Inventario de rollos ─────────────────────────────────────────────
export interface RolloInventario {
  idRolloPapel: number
  /** Mismo formato que la etiqueta física y que el NRollo de los Sheets. */
  codigo: string
  numeroFactura: string
  secuencia: number
  tipoPapel: string
  tipoPapelCodigo: string
  estado: EstadoRollo
  yardasIniciales: number | null
  consumidas: number
  restante: number | null
  /** null sin `costeo.dashboard.ver_financiero`, o si el rollo no trae costo. */
  costoUnitario: number | null
  valor: number | null
  /** Días desde la FECHA DE LA FACTURA, no desde que se tecleó. */
  diasDesdeFactura: number
  consumidoFueraMotivo: string | null
}

export interface MontajeInventario {
  impresora: string
  codigo: string
  tipoPapel: string | null
  montadoEn: string
  diasMontado: number
  montadoPor: string | null
  consumidoEsteMontaje: number
  restante: number | null
}

export interface Inventario {
  generadoEn: string
  /** false = el usuario no tiene el permiso financiero; todo el dinero viene null. */
  incluyeCostos: boolean
  resumen: {
    rollosTotales: number
    porEstado: { estado: EstadoRollo; rollos: number; yardasRestantes: number }[]
    yardasCompradas: number
    yardasConsumidas: number
    yardasEnBodega: number
    yardasEnImpresoras: number
    /** Rollos sin yardas declaradas: NO suman en los totales de arriba. */
    rollosSinYardas: number
    valorEnBodega: number | null
    /** Rollos en bodega sin costo declarado: quedan fuera de la valorización. */
    rollosSinCosto: number | null
  }
  porTipoPapel: {
    codigo: string
    nombre: string
    rollosEnBodega: number
    yardasEnBodega: number
    rollosMontados: number
    yardasMontadas: number
    valorEnBodega: number | null
  }[]
  enBodega: RolloInventario[]
  enImpresoras: MontajeInventario[]
  senales: {
    antiguedad: { etiqueta: string; rollos: number }[]
    /** En bodega pero ya usados en parte: hay que gastarlos primero. */
    parciales: RolloInventario[]
    montajesLargos: MontajeInventario[]
    /** Declarados agotados con yardas en libros = consumo que nadie registró. */
    agotadosConSaldo: RolloInventario[]
    consumidoFuera: { rollos: number; yardas: number }
  }
}
