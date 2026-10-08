import { encabezadoMarcaHTML, type MarcaEmpresa } from '@/app/marca-empresa'
import type { ReporteConsumo } from './types'

/**
 * Imprime usando un iframe oculto en la misma página — nunca `window.open`
 * (convención #9 del proyecto, igual que Cotizaciones y Reposiciones). El "PDF"
 * sale del propio diálogo de impresión del navegador ("Guardar como PDF"), que
 * es como ya se generan los otros documentos del ERP: no hace falta una
 * librería de PDF del lado del servidor.
 */
function imprimirHTML(html: string) {
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

const yd = (n: number) =>
  n.toLocaleString('es-GT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

/** Un instante real (cuándo se imprimió), mostrado en hora de Guatemala. */
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' })

/**
 * Un día calendario elegido en los filtros (`yyyy-mm-dd`), no un instante:
 * se reordena tal cual, sin pasar por `Date`, que lo correría un día.
 */
const dia = (d: string) => d.split('-').reverse().join('/')

const esc = (s: string | null) =>
  (s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

/**
 * Consolidado de consumo por OP, en horizontal: son muchas columnas y en
 * vertical el detalle no entra sin achicar la letra hasta volverla ilegible.
 */
export function imprimirReporteConsumo(d: ReporteConsumo, marca: MarcaEmpresa) {
  const filasResumen = d.resumen
    .map(
      (r) => `<tr>
      <td class="mono">${esc(r.codigo)}</td>
      <td>${esc(r.cliente)}</td>
      <td class="n">${yd(r.impresionYd)}</td>
      <td class="n">${yd(r.enguiamientoYd)}</td>
      <td class="n">${yd(r.enBlancoYd)}</td>
      <td class="n">${yd(r.reposicionYd)}</td>
      <td class="n b">${yd(r.totalPapelYd)}</td>
      <td class="n">${yd(r.telaYd)}</td>
    </tr>`,
    )
    .join('')

  const filasImpresion = d.detalleImpresion
    .map(
      (x) => `<tr>
      <td>${fecha(x.fecha)}</td>
      <td class="mono">${esc(x.orden)}</td>
      <td class="mono">${esc(x.codigoLine)}</td>
      <td>${esc(x.producto)}</td>
      <td>${esc(x.talla)}</td>
      <td class="n">${x.cantidad ?? ''}</td>
      <td>${esc(x.impresora)}</td>
      <td class="n">${yd(x.consumoYd)}</td>
      <td class="n">${yd(x.enguiamientoYd)}</td>
      <td class="n b">${yd(x.totalYd)}</td>
    </tr>`,
    )
    .join('')

  const filasRepo = d.detalleReposiciones
    .map(
      (x) => `<tr>
      <td>${fecha(x.fecha)}</td>
      <td class="mono">${esc(x.orden)}</td>
      <td class="mono">${esc(x.codigoRepo)}</td>
      <td>${esc(x.departamento)}</td>
      <td>${esc(x.defecto)}</td>
      <td>${esc(x.impresora)}</td>
      <td class="n">${yd(x.yardasPapel)}</td>
      <td>${esc(x.tela)}</td>
      <td class="n">${yd(x.yardasTela)}</td>
    </tr>`,
    )
    .join('')

  imprimirHTML(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Consumo por orden de producción</title>
<style>
  @page { size: letter landscape; margin: 12mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; font-size: 9.5px; }
  .marca { margin-bottom: 6px; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  h2 { font-size: 11.5px; margin: 14px 0 4px; border-bottom: 1px solid #999; padding-bottom: 2px; }
  .sub { color: #555; font-size: 10px; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #bbb; padding: 3px 4px; text-align: left; vertical-align: top; }
  th { background: #eee; font-size: 9px; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  .b { font-weight: 700; }
  .mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; }
  tfoot td { font-weight: 700; background: #f4f4f4; }
  /* Que una tabla larga no corte una fila a la mitad entre páginas. */
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
</style></head><body>
  <div class="marca">${encabezadoMarcaHTML(marca, 48)}</div>
  <h1>Consumo por orden de producción</h1>
  <div class="sub">${esc(marca.nombre)} · del ${dia(d.filtros.desde)} al ${dia(d.filtros.hasta)}</div>

  <h2>Resumen por orden</h2>
  <table>
    <thead><tr>
      <th>OP</th><th>Cliente</th><th class="n">Impresión</th><th class="n">Enguiamiento</th>
      <th class="n">En blanco</th><th class="n">Reposiciones</th><th class="n">Total papel</th><th class="n">Tela</th>
    </tr></thead>
    <tbody>${filasResumen || '<tr><td colspan="8">Sin consumo en el rango.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="2">TOTAL</td>
      <td class="n">${yd(d.totales.impresionYd)}</td>
      <td class="n">${yd(d.totales.enguiamientoYd)}</td>
      <td class="n">${yd(d.totales.enBlancoYd)}</td>
      <td class="n">${yd(d.totales.reposicionYd)}</td>
      <td class="n">${yd(d.totales.totalPapelYd)}</td>
      <td class="n">${yd(d.totales.telaYd)}</td>
    </tr></tfoot>
  </table>

  <h2>Detalle de impresión</h2>
  <table>
    <thead><tr>
      <th>Fecha</th><th>OP</th><th>Item</th><th>Producto</th><th>Talla</th><th class="n">Cant.</th>
      <th>Impresora</th><th class="n">Consumo</th><th class="n">Enguiam.</th><th class="n">Total</th>
    </tr></thead>
    <tbody>${filasImpresion || '<tr><td colspan="10">Sin impresiones en el rango.</td></tr>'}</tbody>
  </table>

  <h2>Detalle de reposiciones</h2>
  <table>
    <thead><tr>
      <th>Fecha</th><th>OP</th><th>No. repo</th><th>Departamento</th><th>Defecto</th>
      <th>Impresora</th><th class="n">Yd papel</th><th>Tela</th><th class="n">Yd tela</th>
    </tr></thead>
    <tbody>${filasRepo || '<tr><td colspan="9">Sin reposiciones en el rango.</td></tr>'}</tbody>
  </table>
</body></html>`)
}
