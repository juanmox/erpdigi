import { encabezadoMarcaHTML, type MarcaEmpresa } from '@/app/marca-empresa'
import { imprimirHTML } from '@/lib/imprimir'
import { resumirMateriales } from '@/lib/materiales'
import { resumirPrendas } from '@/lib/prendas'
import type { ReporteConsumo } from './types'

const yd = (n: number) =>
  n.toLocaleString('es-GT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

const q = (n: number) =>
  `Q ${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
 * Tope de filas por tabla, igual que en la pantalla.
 *
 * Un PDF de las 43,833 filas de la ventana completa no es un documento que
 * alguien pueda usar, y armarlo en el iframe cuelga el navegador. Pero una hoja
 * impresa a la que le faltan filas **en silencio** es peor que no imprimirla:
 * por eso cada tabla topada lleva el aviso impreso, y los totales siguen siendo
 * los del servidor —de todas las filas, no de las mostradas—.
 */
const TOPE_FILAS = 200

/** Aviso dentro del documento cuando una tabla se topó. */
const avisoTope = (total: number, cols: number) =>
  total > TOPE_FILAS
    ? `<tr><td colspan="${cols}" style="background:#fff8e1">
        Se imprimen los primeros ${TOPE_FILAS} de ${total.toLocaleString('es-GT')} registros.
        El Excel trae todos. Los totales de abajo sí incluyen el rango completo.
      </td></tr>`
    : ''

/**
 * Consolidado de consumo por OP, en horizontal: son muchas columnas y en
 * vertical el detalle no entra sin achicar la letra hasta volverla ilegible.
 */
export function imprimirReporteConsumo(d: ReporteConsumo, marca: MarcaEmpresa) {
  // El dinero solo viaja con el permiso financiero: sin él `materialesQ` es null
  // y las columnas de costo ni se dibujan.
  const conDinero = d.totales.materialesQ != null
  const celdaMateriales = (items: number, sinCosto: number) =>
    `${items}${sinCosto > 0 ? ` <span style="color:#777">(${sinCosto} sin costo)</span>` : ''}`
  const columnasResumen = 11 + (conDinero ? 1 : 0)

  const filasResumen = d.resumen
    .slice(0, TOPE_FILAS)
    .map(
      (r) => `<tr>
      <td class="mono">${esc(r.codigo)}</td>
      <td>${esc(r.cliente)}</td>
      <td class="mono">${esc(r.of)}</td>
      <td class="mono">${esc(r.numeroFactura)}</td>
      <td class="n">${yd(r.impresionYd)}</td>
      <td class="n">${yd(r.enguiamientoYd)}</td>
      <td class="n">${yd(r.enBlancoYd)}</td>
      <td class="n">${yd(r.reposicionYd)}</td>
      <td class="n b">${yd(r.totalPapelYd)}</td>
      <td class="n">${yd(r.telaYd)}</td>
      <td class="n">${celdaMateriales(r.materialesItems, r.materialesSinCosto)}</td>
      ${conDinero ? `<td class="n">${q(r.materialesQ ?? 0)}</td>` : ''}
    </tr>`,
    )
    .join('')

  const filasMateriales = d.detalleMateriales
    .slice(0, TOPE_FILAS)
    .map(
      (x) => `<tr>
      <td class="mono">${esc(x.orden)}</td>
      <td class="mono">${esc(x.ordenPlanificacion)}</td>
      <td>${dia(x.fechaPlanificador)}</td>
      <td><span class="mono">${esc(x.insumo)}</span> ${esc(x.descripcion)}</td>
      <td class="n">${x.cantidad.toLocaleString('es-GT', { maximumFractionDigits: 4 })} ${esc(x.unidad)}</td>
      ${conDinero ? `<td class="n">${x.sinCosto ? 'sin costo' : q(x.costoUnitario ?? 0)}</td><td class="n">${x.sinCosto ? '—' : q(x.costoTotal ?? 0)}</td>` : ''}
      <td class="mono">${esc(x.salidaSac)}</td>
      <td>${x.fechaEntrega ? dia(x.fechaEntrega) : ''}</td>
      <td>${x.entregado ? 'Entregado' : 'Pendiente'}</td>
    </tr>`,
    )
    .join('')
  const columnasMateriales = 8 + (conDinero ? 2 : 0)

  const filasPorOf = d.resumenPorOf
    .map(
      (r) => `<tr>
      <td class="mono">${esc(r.of)}</td>
      <td>${r.fechaOf ? dia(r.fechaOf) : ''}</td>
      <td>${esc(r.cliente)}</td>
      <td class="mono">${esc(r.numeroFactura)}</td>
      <td>${r.fechaFactura ? dia(r.fechaFactura) : ''}</td>
      <td class="n">${r.cantidadOps}</td>
      <td class="n b">${yd(r.totalPapelYd)}</td>
      <td class="n">${yd(r.telaYd)}</td>
    </tr>`,
    )
    .join('')

  const filasImpresion = d.detalleImpresion
    .slice(0, TOPE_FILAS)
    .map(
      (x) => `<tr>
      <td>${fecha(x.fecha)}</td>
      <td class="mono">${esc(x.orden)}</td>
      <td class="mono">${esc(x.codigoLine)}</td>
      <td>${esc(x.producto)}</td>
      <td>${esc(x.subcliente)}</td>
      <td>${esc(x.talla)}</td>
      <td class="n">${x.cantidad ?? ''}</td>
      <td>${esc(x.impresora)}</td>
      <td class="mono">${esc(x.rollo)}</td>
      <td class="n">${yd(x.consumoYd)}</td>
      <td class="n">${yd(x.enguiamientoYd)}</td>
      <td class="n b">${yd(x.totalYd)}</td>
    </tr>`,
    )
    .join('')

  const filasRepo = d.detalleReposiciones
    .slice(0, TOPE_FILAS)
    .map(
      (x) => `<tr>
      <td>${fecha(x.fecha)}</td>
      <td class="mono">${esc(x.orden)}</td>
      <td class="mono">${esc(x.codigoRepo)}</td>
      <td>${x.tipo === 'MATERIALES' ? 'Materiales' : 'Reimpresión'}</td>
      <td>${esc(x.departamento)}</td>
      <td>${esc(x.defecto)}</td>
      <td>${esc(x.impresora)}</td>
      <td class="mono">${esc(x.rollo)}</td>
      <td class="n">${yd(x.yardasPapel)}</td>
      <td>${esc(x.tela)}</td>
      <td class="n">${yd(x.yardasTela)}</td>
      <td>${esc(resumirMateriales(x.materiales))}</td>
      <td>${esc(resumirPrendas(x.prendas))}</td>
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
  <div class="sub">${esc(marca.nombre)}
    ${d.filtros.desde && d.filtros.hasta ? `· del ${dia(d.filtros.desde)} al ${dia(d.filtros.hasta)}` : ''}
    ${d.filtros.ofs?.length ? `· OF: ${esc(d.filtros.ofs.join(', '))}` : ''}
    ${d.filtros.numeroFactura ? `· Factura: ${esc(d.filtros.numeroFactura)}` : ''}</div>

  <h2>Resumen por orden</h2>
  <table>
    <thead><tr>
      <th>OP</th><th>Cliente</th><th>OF</th><th>Factura</th><th class="n">Impresión</th><th class="n">Enguiamiento</th>
      <th class="n">En blanco</th><th class="n">Reposiciones</th><th class="n">Total papel</th><th class="n">Tela</th>
      <th class="n">Materiales</th>${conDinero ? '<th class="n">Materiales Q</th>' : ''}
    </tr></thead>
    <tbody>${filasResumen || `<tr><td colspan="${columnasResumen}">Sin consumo en el rango.</td></tr>`}${avisoTope(d.resumen.length, columnasResumen)}</tbody>
    <tfoot><tr>
      <td colspan="4">TOTAL</td>
      <td class="n">${yd(d.totales.impresionYd)}</td>
      <td class="n">${yd(d.totales.enguiamientoYd)}</td>
      <td class="n">${yd(d.totales.enBlancoYd)}</td>
      <td class="n">${yd(d.totales.reposicionYd)}</td>
      <td class="n">${yd(d.totales.totalPapelYd)}</td>
      <td class="n">${yd(d.totales.telaYd)}</td>
      <td class="n">${celdaMateriales(d.totales.materialesItems, d.totales.materialesSinCosto)}</td>
      ${conDinero ? `<td class="n">${q(d.totales.materialesQ ?? 0)}</td>` : ''}
    </tr></tfoot>
  </table>

  <h2>Resumen por OF</h2>
  <table>
    <thead><tr>
      <th>OF</th><th>Fecha OF</th><th>Cliente</th><th>Factura</th><th>Fecha factura</th>
      <th class="n">OP</th><th class="n">Total papel</th><th class="n">Tela</th>
    </tr></thead>
    <tbody>${filasPorOf || '<tr><td colspan="8">Sin OF en el rango.</td></tr>'}</tbody>
  </table>

  <h2>Detalle de impresión</h2>
  <table>
    <thead><tr>
      <th>Fecha</th><th>OP</th><th>Item</th><th>Producto</th><th>Subcliente</th><th>Talla</th><th class="n">Cant.</th>
      <th>Impresora</th><th>Rollo</th><th class="n">Consumo</th><th class="n">Enguiam.</th><th class="n">Total</th>
    </tr></thead>
    <tbody>${filasImpresion || '<tr><td colspan="12">Sin impresiones en el rango.</td></tr>'}${avisoTope(d.detalleImpresion.length, 12)}</tbody>
  </table>

  <h2>Detalle de reposiciones</h2>
  <table>
    <thead><tr>
      <th>Fecha</th><th>OP</th><th>No. repo</th><th>Tipo</th><th>Departamento</th><th>Defecto</th>
      <th>Impresora</th><th>Rollo</th><th class="n">Yd papel</th><th>Tela</th><th class="n">Yd tela</th><th>Materiales</th><th>Prendas</th>
    </tr></thead>
    <tbody>${filasRepo || '<tr><td colspan="13">Sin reposiciones en el rango.</td></tr>'}${avisoTope(d.detalleReposiciones.length, 13)}</tbody>
  </table>

  <h2>Materiales de las órdenes</h2>
  <table>
    <thead><tr>
      <th>OP</th><th>Orden plan.</th><th>Fecha plan.</th><th>Insumo</th><th class="n">Cantidad</th>
      ${conDinero ? '<th class="n">Costo unit.</th><th class="n">Costo total</th>' : ''}
      <th>Salida</th><th>Entrega</th><th>Estado</th>
    </tr></thead>
    <tbody>${filasMateriales || `<tr><td colspan="${columnasMateriales + 1}">Ninguna de estas órdenes tiene materiales cargados.</td></tr>`}${avisoTope(d.detalleMateriales.length, columnasMateriales + 1)}</tbody>
  </table>
</body></html>`)
}
