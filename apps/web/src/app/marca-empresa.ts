import { useAuth } from '@/features/auth/auth-context'

export interface MarcaEmpresa {
  /** Nombre comercial — el de uso diario, para encabezados en pantalla. */
  nombre: string
  /**
   * Nombre legal. Los documentos impresos llevan éste y no el comercial: una
   * Requisición de Bodega decía "DIGITAL TEXTIL, S. A." fijo en el código, y
   * reemplazarlo por el comercial habría degradado el formulario de Digitexsa
   * mientras se lo arreglaba para Digitalpro.
   */
  razonSocial: string
  /** Data URI del logo, o `null` si esa empresa todavía no tiene uno cargado. */
  logo: string | null
}

/**
 * La marca de la empresa activa, para encabezar lo que sale impreso.
 *
 * Con dos empresas conviviendo, un documento sin marca —o peor, con la marca de
 * la otra— es exactamente la confusión que la separación por empresa vino a
 * evitar. El logo viaja en la sesión como data URI: ver `core.empresas.logo`.
 */
export function useMarcaEmpresa(): MarcaEmpresa {
  const { empresasDisponibles, idEmpresa } = useAuth()
  const empresa = empresasDisponibles.find((e) => e.idEmpresa === idEmpresa)
  return {
    nombre: empresa?.nombreComercial ?? empresa?.codigo ?? '',
    razonSocial: empresa?.razonSocial ?? empresa?.nombreComercial ?? '',
    logo: empresa?.logo ?? null,
  }
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * El encabezado de marca de un documento impreso.
 *
 * Devuelve el logo como `<img>` con el data URI embebido, y cae al nombre de la
 * empresa en texto cuando no hay logo cargado — así un documento de Digitalpro
 * nunca sale en blanco ni, peor, con el logo de Digitexsa.
 *
 * ⚠️ El data URI no es un capricho: hasta hoy estos documentos traían
 * `<img src="/logo.png">`, que devuelve **404** porque el frontend se sirve bajo
 * `/erp` (base de Vite y prefijo de Nginx). El `onerror` que lo acompañaba lo
 * ocultaba en silencio, así que el logo no se vio nunca en ningún PDF. Un data
 * URI no depende de ninguna ruta y se imprime igual en cualquier ambiente.
 */
export function encabezadoMarcaHTML(
  marca: MarcaEmpresa,
  alturaPx = 52,
  anchoMaxPx = 200,
): string {
  if (!marca.logo)
    return `<strong style="font-size:${Math.round(alturaPx * 0.45)}px">${esc(marca.nombre)}</strong>`
  // Caja con tope de alto Y de ancho, no una altura fija: los logos de las dos
  // empresas tienen proporciones muy distintas (digiTEXSA es apaisado ~5.8:1,
  // digitalPRO casi 2:1). Fijando solo el alto, el apaisado se desborda a lo
  // ancho; fijando solo el ancho, el otro queda enorme. Con `object-fit:
  // contain` cada uno entra en la caja conservando su proporción.
  //
  // El tope de ALTO es holgado a propósito. Para el logo apaisado manda el
  // ancho igual, y el alto sobrante es lo que deja al cuadrado llegar a un
  // tamaño comparable: medido con los dos reales, una caja de 38px dejaba a
  // digitalPRO en 82x38 —con su bajada "your source for sublimation"
  // ilegible— al lado de un digiTEXSA de 190x33.
  return `<img src="${marca.logo}" alt="${esc(marca.nombre)}" style="max-height:${alturaPx}px;max-width:${anchoMaxPx}px;width:auto;height:auto;object-fit:contain">`
}
