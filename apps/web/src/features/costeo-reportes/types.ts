export interface ResumenOrdenConsumo {
  codigo: string
  cliente: string | null
  impresionYd: number
  enguiamientoYd: number
  enBlancoYd: number
  reposicionYd: number
  /** Suma de los cuatro conceptos de PAPEL. La tela va aparte, no suma acá. */
  totalPapelYd: number
  telaYd: number
}

export interface TotalesConsumo {
  impresionYd: number
  enguiamientoYd: number
  enBlancoYd: number
  reposicionYd: number
  totalPapelYd: number
  telaYd: number
}

export interface DetalleImpresion {
  fecha: string
  orden: string
  codigoLine: string | null
  producto: string | null
  talla: string | null
  cantidad: number | null
  impresora: string
  tipoPapel: string
  /** Incluye el papel en blanco: el detalle ya no tiene columna propia. */
  consumoYd: number
  enguiamientoYd: number
  totalYd: number
}

export interface DetalleReposicion {
  fecha: string
  orden: string
  codigoRepo: string | null
  departamento: string
  defecto: string
  impresora: string | null
  tipoPapel: string | null
  yardasPapel: number
  tela: string | null
  yardasTela: number
}

export interface ReporteConsumo {
  /** Opciones de filtro presentes en el rango — las manda el propio reporte. */
  opciones: {
    clientes: { idCliente: number; nombre: string }[]
    impresoras: { idImpresora: number; codigo: string }[]
  }
  filtros: {
    desde: string
    hasta: string
    idCliente: number | null
    idImpresora: number | null
  }
  resumen: ResumenOrdenConsumo[]
  totales: TotalesConsumo
  detalleImpresion: DetalleImpresion[]
  detalleReposiciones: DetalleReposicion[]
}

export interface FiltrosConsumo {
  desde: string
  hasta: string
  idCliente?: string
  idImpresora?: string
}
