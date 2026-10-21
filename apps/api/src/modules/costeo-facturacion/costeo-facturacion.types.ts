/**
 * Una fila del import de OP → OF por plantilla (fase transitoria mientras no
 * existe el módulo de facturación — ver la migración 20261021150000).
 *
 * Los campos resueltos (`codigoOp`, `clienteOp`, etc.) son solo para mostrar
 * en el preview. El `aplicar` NO los recibe de vuelta — los re-resuelve
 * server-side dentro de la transacción (convención #1: nunca confiar en lo
 * que ya pasó por el navegador).
 */
export interface FilaPreviewOfOp {
  fila: number;
  opTexto: string;
  ofTexto: string;
  fechaOfTexto: string;
  numeroFacturaTexto: string;
  fechaFacturaTexto: string;

  codigoOp: string | null;
  clienteOp: string | null;
  codigoOf: string | null;
  /** yyyy-mm-dd */
  fechaOf: string | null;
  numeroFactura: string | null;
  /** yyyy-mm-dd */
  fechaFactura: string | null;

  /**
   * 'nueva' = esta asignación OP→OF se va a crear.
   * 'ya_cargada' = esa OP ya está vigente en esa misma OF — no se duplica, no
   * es un error.
   */
  estado: 'nueva' | 'ya_cargada' | null;
  error: string | null;
}
