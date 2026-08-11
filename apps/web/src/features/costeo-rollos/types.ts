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
  consumoAcumulado: number
  yardasUsadasFisicas: number | null
  merma: number | null
}

export interface PanelItem {
  impresora: Impresora
  montaje: {
    idMontajeRollo: number
    idRolloPapel: number
    montadoEn: string
    rolloPapel: RolloPapel
    consumoAcumulado: number
    yardasRestantesEstimadas: number | null
    porcentajeRestante: number | null
  } | null
}
