export interface ConsumoEstandarDetalle {
  idConsumoEstandar: number
  idProducto: number
  idTalla: number
  pulgadasPapel: string
  yardas: string | null
  vigenteDesde: string
  vigenteHasta: string | null
  producto: { idProducto: number; codigo: string; descripcion: string }
  talla: { idTalla: number; nombre: string }
}

export interface FilaPreviewConsumoEstandar {
  fila: number
  productoCodigo: string
  idProducto: number | null
  tallaNombre: string
  idTalla: number | null
  pulgadasPapel: number
  vigenteDesde: string | null
  vigenteHasta: string | null
  reemplazaId: number | null
  corrigeId: number | null
  error: string | null
}
