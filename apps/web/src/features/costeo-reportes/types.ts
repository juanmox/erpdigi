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
  /** La OF vigente de esta OP, si tiene una asignada. null = sin asignar. */
  of: string | null
  fechaOf: string | null
  numeroFactura: string | null
  fechaFactura: string | null
}

export interface ResumenPorOf {
  of: string
  fechaOf: string | null
  cliente: string | null
  numeroFactura: string | null
  fechaFactura: string | null
  cantidadOps: number
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
  /** Marca/división del cliente, tomada del producto de esa fila. */
  subcliente: string | null
  talla: string | null
  cantidad: number | null
  impresora: string
  tipoPapel: string
  /** Incluye el papel en blanco: el detalle ya no tiene columna propia. */
  consumoYd: number
  enguiamientoYd: number
  totalYd: number
}

export interface MaterialRequisado {
  codigo: string
  descripcion: string
  unidad: string
  cantidad: number
}

export interface DetalleReposicion {
  fecha: string
  orden: string
  codigoRepo: string | null
  tipo: 'REIMPRESION' | 'MATERIALES'
  departamento: string
  defecto: string
  impresora: string | null
  tipoPapel: string | null
  yardasPapel: number
  tela: string | null
  yardasTela: number
  /**
   * Lo requisado en una reposición de materiales, cada uno en su unidad.
   *
   * ⚠️ No suma a ningún total de yardas del reporte: no sale del rollo y
   * mezcla unidades, así que un total sería un número sin significado físico.
   */
  materiales: MaterialRequisado[]
}

export interface ReporteConsumo {
  /** Opciones de filtro presentes en el rango — las manda el propio reporte. */
  opciones: {
    clientes: { idCliente: number; nombre: string }[]
    impresoras: { idImpresora: number; codigo: string }[]
    subclientes: { idSubcliente: number; nombre: string }[]
  }
  filtros: {
    desde: string | null
    hasta: string | null
    idCliente: number | null
    idImpresora: number | null
    idSubcliente: number | null
    ofs: string[] | null
    numeroFactura: string | null
  }
  /**
   * Con el filtro de subcliente puesto: las reposiciones que tocan ese
   * subcliente pero caen en órdenes que lo mezclan con prendas directas, así
   * que no se les puede atribuir. Null si no hay filtro o no hay ninguna.
   * Se muestra porque el total queda corto en exactamente esto.
   */
  reposicionesNoAtribuibles: {
    cantidad: number
    papelYd: number
    telaYd: number
  } | null
  resumen: ResumenOrdenConsumo[]
  resumenPorOf: ResumenPorOf[]
  totales: TotalesConsumo
  detalleImpresion: DetalleImpresion[]
  detalleReposiciones: DetalleReposicion[]
}

export interface FiltrosConsumo {
  /**
   * Obligatorios salvo que haya algún filtro de OF/factura puesto — ver la
   * nota del backend: costear una OF completa exige TODO su consumo, aunque
   * se haya impreso meses antes del rango.
   */
  desde?: string
  hasta?: string
  idCliente?: string
  idImpresora?: string
  idSubcliente?: string
  /** Códigos de OF separados por coma, ya normalizados. */
  ofs?: string
  ofDesde?: string
  ofHasta?: string
  numeroFactura?: string
  fechaOfDesde?: string
  fechaOfHasta?: string
  fechaFacturaDesde?: string
  fechaFacturaHasta?: string
}
