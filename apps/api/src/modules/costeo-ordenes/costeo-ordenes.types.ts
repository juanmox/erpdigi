// Las tallas que lleva la plantilla del import de Órdenes. NO son las 155 del
// catálogo: una columna por talla haría la plantilla inusable en Excel, así que
// esta lista se amplía conforme aparecen órdenes que las necesitan (mismo
// criterio ya usado con productos).
//
// El ORDEN de esta lista ya NO afecta la lectura: desde el 2026-10-07 el parser
// ubica cada talla por su nombre de encabezado (`resolverColumnas`), así que
// agregar, quitar o reordenar no desalinea ningún archivo ya armado. Lo único
// que define es el orden de las columnas en la plantilla que se descarga.
//
// (La advertencia anterior —"siempre al final, porque el parser lee desde
// `IDX_TALLA_INICIO`"— quedó desactualizada con ese cambio. Se deja dicho
// porque guiarse por ella llevaría a evitar un riesgo que ya no existe.)
//
// ⚠️ Una talla que NO esté acá y aparezca como columna en un archivo hace que
// esa fila se rechace con un error que la nombra — antes se ignoraba en
// silencio y las piezas desaparecían (caso real: `2XS` en la 26OP031793, que
// cargaba 18 de 22 sin decir nada).
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
  // Agregada el 2026-10-15: existía en el catálogo (grupo ADULT) pero no en la
  // plantilla, que solo traía `XS` y la combinada `2XS-XS`.
  '2XS',
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
  /**
   * El Item, `<orden de compra>-<n>`. Lo GENERA el servidor desde 2026-10-08
   * (antes era una columna de la plantilla). Null en las filas con error: esas
   * no se importan, así que no consumen correlativo.
   */
  codigoLine: string | null;
  productoCodigo: string | null;
  idProducto: number | null;
  desarrollo: string | null;
  impresoraCodigo: string | null;
  idImpresora: number | null;
  fechaData: string | null;
  fechaCliente: string | null;
  fechaEntregar: string | null;
  estatus: string;
  prioridad: string | null;
  tallas: FilaTallaCantidad[];
  totalPiezas: number;
  /** Columna "En blanco" de la plantilla; false si el archivo no la trae. */
  consumoEnBlanco: boolean;
  error: string | null;
}
