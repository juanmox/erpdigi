/**
 * Imprime un documento HTML usando un **iframe oculto** en la misma página
 * (convención #9 del proyecto) — nunca `window.open`, que congela la ventana
 * madre mientras el diálogo de impresión está abierto.
 *
 * El "PDF" sale del propio diálogo del navegador ("Guardar como PDF"), que es
 * como se generan todos los documentos del ERP: no hace falta una librería de
 * PDF del lado del servidor.
 *
 * ⚠️ El iframe **se autodestruye al segundo**, así que si hay que inspeccionarlo
 * en una prueba automatizada hay que hacerlo antes de ese plazo.
 *
 * Vive acá y no repetido en cada feature: estaba idéntico en Cotizaciones,
 * Reposiciones y el Reporte de consumo, y el inventario de rollos habría sido
 * la cuarta copia.
 */
export function imprimirHTML(html: string) {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  doc?.open()
  doc?.write(html)
  doc?.close()

  const lanzar = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } catch (e) {
      console.error('Error al imprimir:', e)
    }
    setTimeout(() => iframe.remove(), 1000)
  }
  if (iframe.contentWindow?.document.readyState === 'complete') setTimeout(lanzar, 300)
  else iframe.onload = () => setTimeout(lanzar, 300)
}

/** Escapa lo que va dentro del HTML del documento impreso. */
export function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  )
}
