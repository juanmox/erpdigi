/**
 * Convierte una entrada abreviada ("159") al código completo del año activo
 * ("26OP000159") — evita que el operario teclee el año y los ceros a la
 * izquierda cada vez. Si ya viene un código completo (cualquier año, no solo
 * el activo — por si hace falta buscar una OP de un año anterior), se
 * respeta tal cual.
 */
export function normalizarCodigoCosteo(input: string, prefijo: 'OP' | 'OF'): string {
  const texto = input.trim().toUpperCase()
  if (!texto) return texto

  const regexCompleto = new RegExp(`^\\d{2}${prefijo}\\d+$`)
  if (regexCompleto.test(texto)) return texto

  if (/^\d+$/.test(texto)) {
    const anioActivo = String(new Date().getFullYear() % 100).padStart(2, '0')
    return `${anioActivo}${prefijo}${texto.padStart(6, '0')}`
  }

  return texto
}
