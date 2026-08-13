// Las 13 tallas hoy en recetas.tallas — alcance confirmado con el usuario
// para esta primera carga (ver CLAUDE.md, sesión F3). DataDisev3 real usa
// más (WOMEN, MEN, LADIES FIT, PANT, numéricas...) que quedan fuera por
// ahora, conforme se vayan necesitando — mismo criterio ya usado con
// productos.
export const TALLAS_IMPORT_LINEAS = [
  'YXS',
  'YS',
  'YM',
  'YL',
  'YXL',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  '4XL',
] as const;

export interface FilaTallaCantidad {
  talla: string;
  cantidad: number;
}

export interface FilaPreviewLinea {
  fila: number;
  opTexto: string;
  opAnio: number | null;
  opCorrelativo: number | null;
  clienteCodigo: string | null;
  idCliente: number | null;
  lineaProductoNombre: string | null;
  idLineaProducto: number | null;
  ordenCompraOp: string | null;
  fechaRecibidoOp: string | null;
  fechaCompromisoOp: string | null;
  codigoLine: string;
  productoCodigo: string | null;
  idProducto: number | null;
  desarrollo: string | null;
  impresoraCodigo: string | null;
  idImpresora: number | null;
  enguiamientoYd: number;
  fechaData: string | null;
  fechaCliente: string | null;
  fechaEntregar: string | null;
  estatus: string;
  prioridad: string | null;
  imagen: string | null;
  tallas: FilaTallaCantidad[];
  totalPiezas: number;
  error: string | null;
}
