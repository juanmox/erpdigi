import { encabezadoMarcaHTML, type MarcaEmpresa } from '@/app/marca-empresa'
import { esc, imprimirHTML } from '@/lib/imprimir'
import { resumirPrendas } from '@/lib/prendas'
import { fechaHoraGT } from './flujo'
import type { Reposicion, ReposicionParaImprimir } from './types'

const fmt = (n: number) => n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ESTILOS = `
  @page { size: 5.5in 8.5in; margin: 0.35in; }
  *{box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;padding:0;font-size:11px;}
  .hoja{position:relative;page-break-after:always;}
  .hoja:last-child{page-break-after:auto;}
  .head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;gap:6px;}
  .empresa{font-size:15px;font-weight:bold;color:#1e3a8a;text-align:center;}
  .sub{font-size:10.5px;font-weight:bold;text-align:center;color:#1e3a8a;letter-spacing:.03em;}
  .titulos{flex:1;text-align:center;}
  .num{color:#b91c1c;font-weight:bold;font-size:15px;white-space:nowrap;text-align:right;}
  .num small{display:block;font-size:10px;color:#444;font-weight:normal;}
  .campo{margin-bottom:4px;}
  .fila{display:flex;justify-content:space-between;align-items:baseline;gap:32px;}
  .fila .cli{min-width:0;text-align:right;overflow-wrap:anywhere;}
  .campo b{display:inline-block;min-width:78px;}
  table{width:100%;border-collapse:collapse;margin:8px 0;}
  th,td{border:1px solid #999;padding:3px 5px;font-size:9.5px;vertical-align:top;}
  th{background:#eef1fb;text-align:left;}
  .r{text-align:right;white-space:nowrap;}
  tfoot td{font-weight:bold;background:#f7f7f7;}
  .obs{margin-top:6px;font-size:9.5px;}
  .obs b{display:block;margin-bottom:2px;}
  .cadena th,.cadena td{font-size:8.5px;padding:2px 4px;}
  .talonario{margin-top:6px;font-size:10px;}
  .talonario span{display:inline-block;min-width:130px;border-bottom:1px solid #333;}
  .firmas{display:flex;justify-content:space-between;flex-wrap:wrap;gap:22px 0;margin-top:26px;font-size:9.5px;}
  .firma{width:46%;text-align:center;border-top:1px solid #333;padding-top:3px;}
  .copia{position:absolute;top:38%;left:0;right:0;text-align:center;font-size:60px;font-weight:bold;
    color:rgba(185,28,28,.13);transform:rotate(-24deg);pointer-events:none;letter-spacing:.1em;}
  @media print{ body{padding:0;} }
`

function filasMateriales(r: Reposicion) {
  // Una reposición puede consumir papel Y tela a la vez — se imprime una fila
  // por cada material presente. Una de MATERIALES lleva sus N insumos.
  const filas: { codigo: string; descripcion: string; unidad: string; cantidad: number }[] = []
  if (Number(r.yardasPapel) > 0)
    filas.push({
      codigo: '',
      descripcion: `${r.tipoPapel?.nombre ?? 'Papel'} — cargar a la OP ${r.ordenProduccion.codigo}`,
      unidad: 'yds.',
      cantidad: Number(r.yardasPapel),
    })
  if (Number(r.yardasTela) > 0)
    filas.push({
      codigo: r.insumoTela?.codigo ?? '',
      descripcion: `${r.insumoTela?.descripcion ?? 'Tela'} — cargar a la OP ${r.ordenProduccion.codigo}`,
      unidad: 'yds.',
      cantidad: Number(r.yardasTela),
    })
  for (const m of r.reposicionInsumos)
    filas.push({
      codigo: m.insumo.codigo,
      descripcion: `${m.insumo.descripcion} — cargar a la OP ${r.ordenProduccion.codigo}`,
      unidad: m.insumo.unidad.nombre.toLowerCase(),
      cantidad: Number(m.cantidad),
    })
  return filas
}

function hoja(r: Reposicion | ReposicionParaImprimir, nombreSolicitante: string, marca: MarcaEmpresa) {
  const f = new Date(r.fecha)
  const fechaFmt = `${String(f.getDate()).padStart(2, '0')}.${String(f.getMonth() + 1).padStart(2, '0')}.${String(f.getFullYear()).slice(-2)}`
  const filas = filasMateriales(r)
  // El total solo tiene sentido si todas las filas comparten unidad.
  const unidades = new Set(filas.map((x) => x.unidad))
  const unidadComun = unidades.size === 1 ? [...unidades][0] : null
  const totalCantidad = filas.reduce((acc, x) => acc + x.cantidad, 0)
  const prendasTexto = resumirPrendas(
    (r.prendas ?? []).map((p) => ({ producto: p.producto.codigo, talla: p.talla.nombre, pieza: p.pieza.nombre, cantidad: p.cantidad })),
  )
  const observaciones = [
    `Reposición por: ${r.defecto.nombre}.`,
    r.empleado ? `Responsable: ${r.empleado.nombres}.` : '',
    r.comentario ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  // Con requisición (flujo de validaciones): número único RQ, cadena de firmas y
  // marca COPIA desde la segunda impresión. Sin ella (las HISTORICA, anteriores al
  // flujo) sale como siempre, con el número de reposición.
  const conFlujo = 'validaciones' in r && !!r.requisicion
  const req = r.requisicion
  const numero = conFlujo
    ? `Nº RQ-${String(req!.numero).padStart(6, '0')}`
    : `Nº ${esc(r.codigoRepo)}`
  const validaciones = conFlujo ? (r as ReposicionParaImprimir).validaciones : []
  const solicitante = conFlujo ? ((r as ReposicionParaImprimir).creadoPorNombre ?? '') : nombreSolicitante

  return `<div class="hoja">
    ${conFlujo && (req?.impresiones ?? 1) > 1 ? '<div class="copia">COPIA</div>' : ''}
    <div class="head">
      ${encabezadoMarcaHTML(marca, 20, 75)}
      <div class="titulos">
        <div class="empresa">${esc(marca.razonSocial.toUpperCase())}</div>
        <div class="sub">REQUISICIÓN DE BODEGA — REPOSICIÓN</div>
      </div>
      <div class="num">${numero}</div>
    </div>

    <div class="campo fila"><span><b>Fecha:</b> ${fechaFmt}</span><span class="cli"><b>Cliente:</b> ${esc(r.ordenProduccion.cliente?.nombre ?? '—')}</span></div>
    <div class="campo"><b>OP-REPO:</b> ${esc(r.ordenProduccion.codigo)}-${esc(r.codigoRepo)}${
      conFlujo && r.corteEn ? ` &nbsp;·&nbsp; <b>Corte:</b> ${esc(fechaHoraGT(r.corteEn))}` : ''
    }</div>
    ${prendasTexto ? `<div class="campo"><b>Prendas:</b> ${esc(prendasTexto)}</div>` : ''}

    <table>
      <thead><tr><th>Código</th><th>Descripción</th><th>Unidad</th><th class="r">Cantidad</th><th>OP</th></tr></thead>
      <tbody>
        ${filas
          .map(
            (fila) => `<tr>
          <td>${esc(fila.codigo)}</td>
          <td>${esc(fila.descripcion)}</td>
          <td>${esc(fila.unidad)}</td>
          <td class="r">${fmt(fila.cantidad)}</td>
          <td>${esc(r.ordenProduccion.codigo)}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="3">TOTAL</td><td class="r">${unidadComun ? fmt(totalCantidad) : '—'}</td><td>${unidadComun ?? ''}</td></tr>
      </tfoot>
    </table>

    <div class="obs"><b>OBSERVACIONES:</b>${esc(observaciones)}</div>

    ${
      conFlujo
        ? `<table class="cadena">
            <thead><tr><th>Paso</th><th>Validó</th><th>Fecha</th></tr></thead>
            <tbody><tr><td>1. Solicitó</td><td>${esc(solicitante)}</td><td>${fechaHoraGT(r.creadoEn)}</td></tr>${validaciones
              .map((v) => `<tr><td>${v.paso}. ${esc(v.nombrePaso)}</td><td>${esc(v.usuario)}</td><td>${fechaHoraGT(v.fecha)}</td></tr>`)
              .join('')}</tbody>
          </table>
          <div class="talonario">Nº de talonario: <span>${esc(req?.numeroTalonario ?? '')}&nbsp;</span></div>`
        : ''
    }

    <div class="firmas">
      ${
        conFlujo
          ? // Quién solicitó y quién autorizó ya constan en la cadena de arriba.
            '<div class="firma">Entregado por (bodega)</div><div class="firma">Recibido por</div>'
          : `<div class="firma">Solicitado por: ${esc(solicitante)}</div><div class="firma">Autorizado por</div>`
      }
    </div>
  </div>`
}

/**
 * Réplica impresa de la "Requisición de Bodega" física (media carta). Varias por
 * documento, una por página. Las del flujo de validaciones llevan su número RQ
 * único y la cadena de quién validó; las anteriores al flujo, el layout de siempre.
 */
export function imprimirRequisiciones(
  rs: (Reposicion | ReposicionParaImprimir)[],
  nombreSolicitante: string,
  marca: MarcaEmpresa,
) {
  if (rs.length === 0) return
  const titulo = rs.length === 1 ? (rs[0].requisicion ? `RQ-${rs[0].requisicion.numero}` : rs[0].codigoRepo) : `${rs.length} requisiciones`
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>${esc(titulo)}</title><style>${ESTILOS}</style></head><body>
    ${rs.map((r) => hoja(r, nombreSolicitante, marca)).join('')}
    </body></html>`
  imprimirHTML(html)
}

/** Una sola (atajo, para las anteriores al flujo). */
export function imprimirReposicion(r: Reposicion, nombreSolicitante: string, marca: MarcaEmpresa) {
  imprimirRequisiciones([r], nombreSolicitante, marca)
}
