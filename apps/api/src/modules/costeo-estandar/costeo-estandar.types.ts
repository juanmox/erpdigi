export interface FilaPreviewConsumoEstandar {
  fila: number;
  productoCodigo: string;
  idProducto: number | null;
  tallaNombre: string;
  idTalla: number | null;
  pulgadasPapel: number;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  reemplazaId: number | null;
  corrigeId: number | null;
  error: string | null;
}
