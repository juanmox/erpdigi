// Las tallas que lleva la plantilla del import de Órdenes. NO son las 155 del
// catálogo: una columna por talla haría la plantilla inusable en Excel, así que
// esta lista se amplía conforme aparecen órdenes que las necesitan (mismo
// criterio ya usado con productos).
//
// Las tallas NUEVAS SIEMPRE VAN AL FINAL. El parser lee desde la columna 18 en
// adelante (`IDX_TALLA_INICIO`) y las tallas son las últimas columnas, así que
// agregar al final deja seguir cargando los archivos ya armados con la
// plantilla vieja: las columnas que les faltan se leen vacías y se saltan.
// Insertar en el medio, en cambio, correría todas las siguientes y haría que
// un archivo viejo cargue cantidades en la talla equivocada, en silencio.
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
  // Combinadas, agregadas el 2026-09-22 a pedido del usuario: son tallas que
  // cubren un rango en una sola prenda, no dos prendas.
  'YS-YM',
  'YL-YXL',
  '2XS-XS',
  'S-M',
  'L-XL',
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
