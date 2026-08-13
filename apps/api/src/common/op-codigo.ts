const REGEX_OP = /^(\d{2})OP(\d{1,6})$/i;

/** Parsea un código de OP como "26OP014154" a {anio, correlativo}, o null si el formato no coincide. */
export function parsearCodigoOp(
  texto: string,
): { anio: number; correlativo: number } | null {
  const m = REGEX_OP.exec(texto.trim());
  if (!m) return null;
  return { anio: Number(m[1]), correlativo: Number(m[2]) };
}
