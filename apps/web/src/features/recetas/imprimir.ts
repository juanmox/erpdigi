import type { CotizacionDetalleCompleto, ResumenMaterial } from './types'

const fmt = (n: number) => n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt4 = (n: number) => n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const fmtHoras = (minutosTotales: number) => {
  const total = Math.round(minutosTotales)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h}:${String(m).padStart(2, '0')} h`
}

/**
 * Imprime un documento HTML usando un iframe oculto en la misma página. Evita
 * abrir pestañas nuevas y NO bloquea la ventana principal (a diferencia de
 * window.open + window.print, que congela la página madre).
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
  if (iframe.contentWindow?.document.readyState === 'complete') {
    setTimeout(lanzar, 300)
  } else {
    iframe.onload = () => setTimeout(lanzar, 300)
  }
}

export function imprimirCotizacion(d: CotizacionDetalleCompleto) {
  const c = d.cotizacion
  const usd = c.moneda === 'USD' && !!c.tasaCambio
  const tasa = usd ? (c.tasaCambio as number) : 1
  const sim = usd ? '$' : 'Q'
  const cv = (v: number) => (usd ? v / tasa : v)
  const f = new Date(c.fechaCreacion).toLocaleString('es-GT')

  let bloques = ''
  d.detalle.forEach((linea, idx) => {
    let filasInsumo = ''
    const insumos = [...linea.insumos] as { categoria: string; codigo: string | null; descripcion: string; consumo: number; unidad: string; costoPromedio: number; costoTotal: number }[]
    if (linea.manoObra) insumos.push(linea.manoObra)
    let catActual: string | null = null
    for (const i of insumos) {
      if (i.categoria !== catActual) {
        catActual = i.categoria
        filasInsumo += `<tr class="catp"><td colspan="5">${catActual}</td></tr>`
      }
      filasInsumo += `<tr>
        <td>${i.codigo ?? ''}</td>
        <td class="desc">${i.descripcion}</td>
        <td class="r">${i.consumo.toLocaleString('es-GT', { maximumFractionDigits: 4 })} ${i.unidad ?? ''}</td>
        <td class="r">${sim} ${fmt4(cv(i.costoPromedio))}</td>
        <td class="r">${sim} ${fmt4(cv(i.costoTotal))}</td></tr>`
    }

    let ventaLinea = ''
    if (linea.precioVenta != null && linea.precioVenta > 0) {
      const pvUsd = linea.precioVenta
      const costoUsdUnit = usd ? linea.costoUnitario / tasa : linea.costoUnitario
      const pctC = (costoUsdUnit / pvUsd) * 100
      const pctM = 100 - pctC
      ventaLinea = ` &nbsp;·&nbsp; P. venta: $ ${fmt(pvUsd)} &nbsp;·&nbsp; Costo ${pctC.toLocaleString('es-GT', { maximumFractionDigits: 1 })}% / Margen ${pctM.toLocaleString('es-GT', { maximumFractionDigits: 1 })}%`
    }

    const ficha = [
      linea.cliente ? `Cliente: ${linea.cliente}` : '',
      linea.tamano ? `Tamaño: ${linea.tamano}` : '',
      linea.deporte ? `Deporte: ${linea.deporte}` : '',
      linea.desarrollo ? `Desarrollo: ${linea.desarrollo}` : '',
      linea.patron ? `Patrón: ${linea.patron}` : '',
    ]
      .filter(Boolean)
      .join(' &nbsp;·&nbsp; ')

    bloques += `
      <div class="prod">
        <div class="prod-h">
          <div class="pt">${idx + 1}. ${linea.codigoProducto} — ${linea.descripcion}</div>
          ${ficha ? `<div class="prod-ficha">${ficha}</div>` : ''}
          <div class="prod-cant">Cantidad: ${fmt(linea.cantidad)} &nbsp;·&nbsp; Costo unit.: ${sim} ${fmt4(cv(linea.costoUnitario))} &nbsp;·&nbsp; Subtotal: ${sim} ${fmt(cv(linea.costoTotal))}${ventaLinea}</div>
        </div>
        <table class="ti">
          <colgroup><col class="c-id"><col class="c-desc"><col class="c-con"><col class="c-cp"><col class="c-ct"></colgroup>
          <thead><tr><th>Id</th><th>Insumo</th><th class="r">Consumo</th><th class="r">C. Prom.</th><th class="r">C. Total</th></tr></thead>
          <tbody>${filasInsumo}</tbody>
        </table>
      </div>`
  })

  const totalMostrado = usd ? '$ ' + fmt(c.totalCosto / tasa) : 'Q ' + fmt(c.totalCosto)
  const tasaLinea = usd ? `<div>Tasa de cambio: Q${fmt4(c.tasaCambio as number)} / US$ (Banguat)</div>` : ''

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>${c.folio}</title>
    <style>
      *{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;padding:24px;font-size:11px;}
      .head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #2e3192;padding-bottom:12px;margin-bottom:16px;}
      .head img{height:30px;}
      .empresa{font-size:16px;font-weight:bold;color:#2e3192;}
      .sub{color:#666;font-size:11px;}
      .meta{display:flex;justify-content:space-between;margin-bottom:16px;}
      .folio{font-size:20px;font-weight:bold;color:#2e3192;}
      .prod{margin-bottom:12px;page-break-inside:avoid;}
      .prod-h{background:#2e3192;color:#fff;padding:5px 8px;font-size:11px;}
      .prod-h .pt{font-weight:bold;}
      .prod-ficha{font-size:9.5px;opacity:.9;margin-top:2px;}
      .prod-cant{font-weight:normal;font-size:10px;margin-top:2px;opacity:.95;}
      table{width:100%;border-collapse:collapse;table-layout:fixed;}
      .ti th{background:#e9eaf5;text-align:left;padding:3px 6px;font-size:9.5px;border-bottom:1px solid #ccc;}
      .ti td{padding:2px 6px;border-bottom:1px solid #eee;font-size:9.5px;vertical-align:top;}
      .ti td.desc{white-space:normal;word-break:break-word;}
      .catp td{background:#f3f4fb;font-weight:bold;text-transform:uppercase;font-size:9px;}
      .r{text-align:right;white-space:nowrap;}
      col.c-id{width:9%;} col.c-desc{width:47%;} col.c-con{width:16%;}
      col.c-cp{width:14%;} col.c-ct{width:14%;}
      .total{margin-top:12px;text-align:right;font-size:15px;font-weight:bold;border-top:2px solid #2e3192;padding-top:8px;}
      .foot{margin-top:28px;color:#888;font-size:10px;text-align:center;border-top:1px solid #ddd;padding-top:8px;}
      @media print{ body{padding:0;} }
    </style></head><body>
    <div class="head">
      <img src="/logo.png" onerror="this.style.display='none'">
      <div>
        <div class="empresa">Digital Textil, S.A. (Digitexsa)</div>
        <div class="sub">Cotización de recetas de uniformes deportivos</div>
      </div>
    </div>
    <div class="meta">
      <div>
        <div class="folio">${c.folio}</div>
        <div>Fecha: ${f}</div>
        <div>Moneda: ${c.moneda || 'GTQ'}</div>
        ${tasaLinea}
      </div>
      <div style="text-align:right;">
        <div>Total de piezas: <strong>${fmt(c.totalCantidad)}</strong></div>
        ${c.notas ? `<div>Notas: ${c.notas}</div>` : ''}
      </div>
    </div>
    ${bloques}
    <div class="total">TOTAL: ${totalMostrado}</div>
    <div class="foot">Documento generado el ${new Date().toLocaleString('es-GT')} · Digitexsa ERP</div>
    </body></html>`

  imprimirHTML(html)
}

export function imprimirResumen(
  resumen: ResumenMaterial,
  moneda: 'GTQ' | 'USD',
  tasa: number | null,
  titulo: string,
  productos: { codigo: string; descripcion: string; cantidad: number }[],
) {
  const sim = moneda === 'USD' ? '$' : 'Q'
  const cv = (v: number) => (moneda === 'USD' && tasa ? v / tasa : v)

  let filaPct = ''
  if (resumen.ventaTotalUsd > 0 && tasa) {
    const costoUsd = resumen.costoGeneral / tasa
    const pctCosto = (costoUsd / resumen.ventaTotalUsd) * 100
    const pctMargen = 100 - pctCosto
    filaPct = `<tr><td colspan="3" class="r">Costo ${pctCosto.toLocaleString('es-GT', { maximumFractionDigits: 1 })}% · Margen ${pctMargen.toLocaleString('es-GT', { maximumFractionDigits: 1 })}%</td><td class="r">Venta: $ ${fmt(resumen.ventaTotalUsd)}</td></tr>`
  }

  const grupos: Record<string, typeof resumen.insumos> = {}
  for (const i of resumen.insumos) {
    ;(grupos[i.categoria] ??= []).push(i)
  }
  let filas = ''
  for (const cat of Object.keys(grupos)) {
    filas += `<tr class="catp"><td colspan="4">${cat}</td></tr>`
    for (const i of grupos[cat]) {
      filas += `<tr>
        <td>${i.codigo}</td>
        <td class="desc">${i.descripcion}</td>
        <td class="r">${i.cantidadTotal.toLocaleString('es-GT', { maximumFractionDigits: 3 })} ${i.unidad}</td>
        <td class="r">${sim} ${fmt(cv(i.costoTotal))}</td></tr>`
    }
  }
  const mo = resumen.manoObra
  filas += `<tr class="catp"><td colspan="4">Mano de obra</td></tr>`
  filas += `<tr><td></td><td class="desc">Mano de obra</td>
    <td class="r">${fmt(mo.minutosTotal)} min (${fmtHoras(mo.minutosTotal)})</td>
    <td class="r">${sim} ${fmt(cv(mo.costoTotal))}</td></tr>`

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Resumen de material</title>
    <style>
      *{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;padding:24px;font-size:11px;}
      .head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #2e3192;padding-bottom:12px;margin-bottom:16px;}
      .head img{height:30px;}
      .empresa{font-size:16px;font-weight:bold;color:#2e3192;}
      .sub{color:#666;font-size:11px;}
      .meta{display:flex;justify-content:space-between;margin-bottom:14px;font-size:12px;}
      .titulo{font-size:18px;font-weight:bold;color:#2e3192;}
      .prods{margin-bottom:14px;font-size:10px;}
      .prods .th{font-weight:bold;text-transform:uppercase;color:#2e3192;margin-bottom:3px;font-size:9.5px;}
      .prods ul{margin:0;padding-left:16px;}
      table{width:100%;border-collapse:collapse;table-layout:fixed;}
      col.c-id{width:11%;} col.c-desc{width:53%;} col.c-cant{width:20%;} col.c-costo{width:16%;}
      th{background:#e9eaf5;text-align:left;padding:4px 6px;font-size:10px;border-bottom:1px solid #ccc;}
      td{padding:3px 6px;border-bottom:1px solid #eee;font-size:10px;vertical-align:top;}
      td.desc{white-space:normal;word-break:break-word;}
      .catp td{background:#f3f4fb;font-weight:bold;text-transform:uppercase;font-size:9.5px;}
      .r{text-align:right;white-space:nowrap;}
      tfoot td{border-top:2px solid #2e3192;font-weight:bold;font-size:12px;}
      .foot{margin-top:28px;color:#888;font-size:10px;text-align:center;border-top:1px solid #ddd;padding-top:8px;}
      @media print{ body{padding:0;} }
    </style></head><body>
    <div class="head">
      <img src="/logo.png" onerror="this.style.display='none'">
      <div><div class="empresa">Digital Textil, S.A. (Digitexsa)</div>
      <div class="sub">Resumen de material requerido</div></div>
    </div>
    <div class="meta">
      <div><div class="titulo">Resumen de material</div><div>${titulo}</div></div>
      <div style="text-align:right;">
        <div>Total de prendas: <strong>${fmt(resumen.totalPrendas)}</strong></div>
        <div>Moneda: <strong>${moneda}</strong>${moneda === 'USD' && tasa ? ` · Tasa: Q${fmt4(tasa)}/US$` : ''}</div>
      </div>
    </div>
    ${productos.length ? `<div class="prods"><div class="th">Productos incluidos</div><ul>${productos.map((pr) => `<li><strong>${pr.codigo}</strong> — ${pr.descripcion} (${fmt(pr.cantidad)} u.)</li>`).join('')}</ul></div>` : ''}
    <table>
      <colgroup><col class="c-id"><col class="c-desc"><col class="c-cant"><col class="c-costo"></colgroup>
      <thead><tr><th>Id</th><th>Insumo</th><th class="r">Cantidad total</th><th class="r">Costo total</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot>
        <tr><td colspan="3" class="r">Costo de insumos</td><td class="r">${sim} ${fmt(cv(resumen.costoInsumos))}</td></tr>
        <tr><td colspan="3" class="r">Costo general (con MO)</td><td class="r">${sim} ${fmt(cv(resumen.costoGeneral))}</td></tr>
        ${filaPct}
      </tfoot>
    </table>
    <div class="foot">Documento generado el ${new Date().toLocaleString('es-GT')} · Digitexsa ERP</div>
    </body></html>`

  imprimirHTML(html)
}
