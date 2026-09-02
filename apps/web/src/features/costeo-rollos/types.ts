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

export interface FacturaPapel {
  idFacturaPapel: number
  numeroFactura: string
  fecha: string
  totalRollos: number
  creadoEn: string
}

export type EstadoRollo = 'EN_BODEGA' | 'MONTADO' | 'AGOTADO' | 'DESCARTADO'

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
  yardasUsadasFisicas: number | null
  merma: number | null
}

export interface RolloDeFactura {
  idRolloPapel: number
  secuencia: number
  idTipoPapel: number
  yardasIniciales: string | null
  costoUnitario: string | null
  estado: EstadoRollo
  tipoPapel: TipoPapel
}

export interface FacturaConRollos extends FacturaPapel {
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
