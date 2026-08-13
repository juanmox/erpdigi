import type { Reposicion } from './types'

/**
 * Imprime un documento HTML usando un iframe oculto en la misma página. Evita
 * abrir pestañas nuevas y NO bloquea la ventana principal (mismo patrón que
 * features/recetas/imprimir.ts — nunca window.open).
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

const fmt = (n: number) => n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Réplica impresa de la "Requisición de Bodega" física que ya usan (media
 * carta) — mismo layout: número arriba a la derecha, tabla de una fila con
 * el insumo/papel repuesto, observaciones, solicitado/autorizado por.
 */
export function imprimirReposicion(r: Reposicion, nombreSolicitante: string) {
  const f = new Date(r.fecha)
  const fechaFmt = `${String(f.getDate()).padStart(2, '0')}.${String(f.getMonth() + 1).padStart(2, '0')}.${String(f.getFullYear()).slice(-2)}`

  // Una reposición puede consumir papel Y tela a la vez — se imprime una fila
  // por cada material presente, nunca se descarta uno a favor del otro.
  const filas: { codigo: string; descripcion: string; cantidad: number }[] = []
  if (Number(r.yardasPapel) > 0) {
    filas.push({
      codigo: '',
      descripcion: `${r.tipoPapel?.nombre ?? 'Papel'} — cargar a la OP ${r.ordenProduccion.codigo}`,
      cantidad: Number(r.yardasPapel),
    })
  }
  if (Number(r.yardasTela) > 0) {
    filas.push({
      codigo: r.insumoTela?.codigo ?? '',
      descripcion: `${r.insumoTela?.descripcion ?? 'Tela'} — cargar a la OP ${r.ordenProduccion.codigo}`,
      cantidad: Number(r.yardasTela),
    })
  }
  const totalCantidad = filas.reduce((acc, x) => acc + x.cantidad, 0)
  const primerMaterial = filas[0]?.descripcion.split(' — ')[0] ?? ''
  const descripcionCabecera = [r.ordenProduccion.cliente?.nombre, primerMaterial].filter(Boolean).join(' - ')

  const observaciones = [
    `Reposición por: ${r.defecto.nombre}.`,
    r.empleado ? `Responsable: ${r.empleado.nombres}.` : '',
    r.comentario ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>${r.codigoRepo}</title>
    <style>
      @page { size: 5.5in 8.5in; margin: 0.35in; }
      *{box-sizing:border-box;}
      body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;padding:0;font-size:11px;}
      .head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;}
      .head img{height:26px;}
      .empresa{font-size:16px;font-weight:bold;color:#1e3a8a;text-align:center;}
      .sub{font-size:11px;font-weight:bold;text-align:center;color:#1e3a8a;letter-spacing:.03em;}
      .titulos{flex:1;text-align:center;}
      .num{color:#b91c1c;font-weight:bold;font-size:13px;white-space:nowrap;}
      .campo{margin-bottom:6px;}
      .campo b{display:inline-block;min-width:78px;}
      table{width:100%;border-collapse:collapse;margin:10px 0;}
      th,td{border:1px solid #999;padding:4px 6px;font-size:10px;vertical-align:top;}
      th{background:#eef1fb;text-align:left;}
      .r{text-align:right;white-space:nowrap;}
      tfoot td{font-weight:bold;background:#f7f7f7;}
      .obs{margin-top:8px;font-size:10px;}
      .obs b{display:block;margin-bottom:2px;}
      .firmas{display:flex;justify-content:space-between;margin-top:36px;font-size:10px;}
      .firma{width:46%;text-align:center;border-top:1px solid #333;padding-top:4px;}
      @media print{ body{padding:0;} }
    </style></head><body>
    <div class="head">
      <img src="/logo.png" onerror="this.style.display='none'">
      <div class="titulos">
        <div class="empresa">DIGITAL TEXTIL, S. A.</div>
        <div class="sub">REQUISICIÓN DE BODEGA — REPOSICIÓN</div>
      </div>
      <div class="num">Nº ${r.codigoRepo}</div>
    </div>

    <div class="campo"><b>Fecha:</b> ${fechaFmt}</div>
    <div class="campo"><b>Descripción:</b> ${descripcionCabecera}</div>
    <div class="campo"><b>Orden de Producción:</b> ${r.ordenProduccion.codigo}</div>

    <table>
      <thead>
        <tr><th>Código</th><th>Descripción</th><th>Unidad</th><th class="r">Cantidad</th><th>OP</th></tr>
      </thead>
      <tbody>
        ${filas
          .map(
            (fila) => `<tr>
          <td>${fila.codigo}</td>
          <td>${fila.descripcion}</td>
          <td>yds.</td>
          <td class="r">${fmt(fila.cantidad)}</td>
          <td>${r.ordenProduccion.codigo}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="3">TOTAL</td><td class="r">${fmt(totalCantidad)}</td><td>yds.</td></tr>
      </tfoot>
    </table>

    <div class="obs">
      <b>OBSERVACIONES:</b>
      ${observaciones}
    </div>

    <div class="firmas">
      <div class="firma">Solicitado por: ${nombreSolicitante}</div>
      <div class="firma">Autorizado por:</div>
    </div>
    </body></html>`

  imprimirHTML(html)
}
