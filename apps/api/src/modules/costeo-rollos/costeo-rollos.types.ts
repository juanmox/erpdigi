/** Una fila de la plantilla de ingreso de rollos, ya validada por el preview. */
export interface FilaPreviewIngresoRollo {
  fila: number;
  numeroFactura: string;
  /** ISO (solo fecha). Vacío si la celda no se pudo interpretar. */
  fecha: string;
  fechaTexto: string;
  tipoPapelCodigo: string;
  /** Resuelto contra el catálogo, solo para mostrarlo en el preview. */
  tipoPapelNombre: string | null;
  cantidadRollos: number | null;
  yardasPorRollo: number | null;
  costoUnitario: number | null;
  error: string | null;
}
