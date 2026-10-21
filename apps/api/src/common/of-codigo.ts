const REGEX_OF = /^(\d{2})OF(\d{1,6})$/i;

/** Parsea un código de OF como "26OF000159" a {anio, correlativo}, o null si el formato no coincide. */
export function parsearCodigoOf(
  texto: string,
): { anio: number; correlativo: number } | null {
  const m = REGEX_OF.exec(texto.trim());
  if (!m) return null;
  return { anio: Number(m[1]), correlativo: Number(m[2]) };
}
