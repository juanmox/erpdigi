import type { CellValue } from 'exceljs';

/** Convierte el valor crudo de una celda de ExcelJS a una fecha, o null si está vacía/no es fecha. */
export function fechaCelda(valor: CellValue): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) return valor;
  if (typeof valor === 'object' && 'result' in valor) {
    const resultado = valor.result;
    if (resultado instanceof Date) return resultado;
  }
  const texto = textoCelda(valor);
  if (!texto) return null;
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Convierte el valor crudo de una celda de ExcelJS (string, number, Date, fórmula, rich text) a texto plano. */
export function textoCelda(valor: CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') {
    if (valor instanceof Date) return valor.toISOString();
    if ('richText' in valor) return valor.richText.map((r) => r.text).join('');
    if ('result' in valor) {
      const resultado = valor.result;
      if (resultado === undefined) return '';
      if (resultado instanceof Date) return resultado.toISOString();
      if (typeof resultado === 'object') return '';
      return String(resultado);
    }
    if ('text' in valor) return String(valor.text);
    return '';
  }
  return String(valor);
}
