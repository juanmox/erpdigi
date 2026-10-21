import { encabezadoMarcaHTML, type MarcaEmpresa } from '@/app/marca-empresa'
import { esc, imprimirHTML } from '@/lib/imprimir'
import type { Inventario, RolloInventario } from './types'

const yd = (n: number | null) =>
  n == null
    ? '—'
    : n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const q = (n: number | null) =>
  n == null ? '—' : 'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const instante = (iso: string) =>
  new Date(iso).toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'short',
    timeStyle: 'short',
  })

/** Los estados, con el nombre que entiende quien hace el conteo. */
const ETIQUETA_ESTADO: Record<string, string> = {
  EN_BODEGA: 'En bodega',
  MONTADO: 'Montado en impresora',
  AGOTADO: 'Agotado',
  DESCARTADO: 'Descartado',
  CONSUMIDO_FUERA: 'Consumido fuera del ERP',
}

const ESTILOS = `
  *{box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;padding:22px;font-size:10.5px;}
  .head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #203080;padding-bottom:10px;margin-bottom:12px;}
  .empresa{font-size:15px;font-weight:bold;color:#203080;}
  .sub{color:#666;font-size:10.5px;}
  .meta{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px;}
  .titulo{font-size:17px;font-weight:bold;color:#203080;}
  h2{font-size:11.5px;color:#203080;text-transform:uppercase;letter-spacing:.04em;
     margin:16px 0 5px;border-bottom:1px solid #cfd3e8;padding-bottom:3px;}
  table{width:100%;border-collapse:collapse;}
  th{background:#e9eaf5;text-align:left;padding:3px 5px;font-size:9.5px;border-bottom:1px solid #ccc;}
  td{padding:2.5px 5px;border-bottom:1px solid #eee;font-size:9.5px;vertical-align:top;}
  .r{text-align:right;white-space:nowrap;}
  .c{text-align:center;}
  .mono{font-family:"Courier New",monospace;}
  .grupo td{background:#f3f4fb;font-weight:bold;text-transform:uppercase;font-size:9px;}
  .ubicacion td{background:#203080;color:#fff;font-weight:bold;font-size:10.5px;padding-top:6px;padding-bottom:6px;}
  .cajita{display:inline-block;width:9px;height:9px;border:1px solid #666;}
  .anotar{background:#fcfcfc;}
  .tot td{border-top:2px solid #203080;font-weight:bold;}
  .nota{color:#666;font-size:9px;margin-top:3px;}
  .aviso{border-left:3px solid #c08a25;background:#fdf8ee;padding:5px 8px;margin:6px 0;font-size:9.5px;}
  .firmas{display:flex;gap:40px;margin-top:26px;}
  .firma{flex:1;border-top:1px solid #666;padding-top:4px;font-size:9.5px;color:#555;}
  .foot{margin-top:20px;color:#888;font-size:9px;text-align:center;border-top:1px solid #ddd;padding-top:6px;}
  section{page-break-inside:avoid;}
  @media print{ body{padding:0;} }
`

/** Hoja de conteo: los rollos en bodega, agrupados por tipo de papel. */
/**
 * Agrupada primero por UBICACIÓN y adentro por tipo de papel — no solo por
 * tipo como antes. Es la razón de ser de esta hoja ahora: quien cuenta en
 * Digitexsa no tiene por qué ver las filas de DigitalPro mezcladas en medio.
 * Lo "sin clasificar" va en su propio grupo y nunca se mete en ninguna de
 * las dos ubicaciones conocidas por adivinanza.
 */
function hojaDeConteo(enBodega: RolloInventario[], incluyeCostos: boolean): string {
  if (enBodega.length === 0)
    return '<p class="nota">No hay rollos en bodega.</p>'

  const SIN_CLASIFICAR = 'Sin clasificar'
  const porUbicacion = new Map<string, RolloInventario[]>()
  for (const r of enBodega) {
    const clave = r.ubicacion ?? SIN_CLASIFICAR
    const xs = porUbicacion.get(clave) ?? []
    xs.push(r)
    porUbicacion.set(clave, xs)
  }
  const ubicacionesOrdenadas = [...porUbicacion.keys()].sort((a, b) =>
    a === SIN_CLASIFICAR ? 1 : b === SIN_CLASIFICAR ? -1 : a.localeCompare(b, 'es'),
  )

  let filas = ''
  for (const ubic of ubicacionesOrdenadas) {
    const enUbic = porUbicacion.get(ubic)!
    const totalUbic = enUbic.reduce((t, r) => t + (r.restante ?? 0), 0)
    filas += `<tr class="ubicacion"><td colspan="${incluyeCostos ? 8 : 7}">${esc(ubic)} — ${enUbic.length} rollo(s) · ${yd(totalUbic)} yd</td></tr>`

    const porTipo = new Map<string, RolloInventario[]>()
    for (const r of enUbic) {
      const xs = porTipo.get(r.tipoPapel) ?? []
      xs.push(r)
      porTipo.set(r.tipoPapel, xs)
    }
    for (const tipo of [...porTipo.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
      const xs = porTipo.get(tipo)!
      const total = xs.reduce((t, r) => t + (r.restante ?? 0), 0)
      filas += `<tr class="grupo"><td colspan="${incluyeCostos ? 8 : 7}">${esc(tipo)} — ${xs.length} rollo(s) · ${yd(total)} yd</td></tr>`
      for (const r of xs) {
        filas += `<tr>
          <td class="c"><span class="cajita"></span></td>
          <td class="mono">${esc(r.codigo)}</td>
          <td>${esc(r.numeroFactura)}</td>
          <td class="r">${r.diasDesdeFactura}</td>
          <td class="r">${yd(r.restante)}</td>
          ${incluyeCostos ? `<td class="r">${q(r.valor)}</td>` : ''}
          <td class="anotar"></td>
          <td class="anotar"></td>
        </tr>`
      }
    }
  }

  return `<table>
    <thead><tr>
      <th class="c" style="width:22px">✓</th>
      <th style="width:19%">Rollo (etiqueta)</th>
      <th style="width:13%">Factura</th>
      <th class="r" style="width:7%">Días</th>
      <th class="r" style="width:11%">Yd. sistema</th>
      ${incluyeCostos ? '<th class="r" style="width:11%">Valor</th>' : ''}
      <th style="width:13%">Yd. contadas</th>
      <th>Observaciones</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <p class="nota">"Yd. sistema" es lo que el ERP calcula como restante (yardas declaradas al ingresar
  menos el consumo registrado). Anotá lo contado solo cuando difiera.</p>`
}

/**
 * Informe de inventario de rollos, para hacer el conteo físico en bodega y
 * para auditar que lo registrado cuadre con lo real.
 *
 * `soloConteo` imprime únicamente la hoja de conteo: es lo que se lleva a
 * caminar la bodega, y el resto del informe ahí sería papel de más.
 */
export function imprimirInventarioRollos(
  d: Inventario,
  marca: MarcaEmpresa,
  generadoPor: string,
  soloConteo = false,
) {
  const r = d.resumen
  const s = d.senales

  const filasEstado = r.porEstado
    .filter((e) => e.rollos > 0)
    .map(
      (e) =>
        `<tr><td>${ETIQUETA_ESTADO[e.estado] ?? e.estado}</td>
         <td class="r">${e.rollos}</td>
         <td class="r">${yd(e.yardasRestantes)}</td></tr>`,
    )
    .join('')

  const filasUbicacion = d.porUbicacion
    .map(
      (u) =>
        `<tr><td>${esc(u.nombre)}</td>
         <td class="r">${u.rollos}</td>
         <td class="r">${yd(u.yardas)}</td></tr>`,
    )
    .join('')

  const filasTipo = d.porTipoPapel
    .map(
      (t) =>
        `<tr><td>${esc(t.nombre)}</td>
         <td class="r">${t.rollosEnBodega}</td>
         <td class="r">${yd(t.yardasEnBodega)}</td>
         <td class="r">${t.rollosMontados}</td>
         <td class="r">${yd(t.yardasMontadas)}</td>
         ${d.incluyeCostos ? `<td class="r">${q(t.valorEnBodega)}</td>` : ''}</tr>`,
    )
    .join('')

  const filasImpresoras = d.enImpresoras.length
    ? d.enImpresoras
        .map(
          (m) =>
            `<tr><td class="mono">${esc(m.impresora)}</td>
             <td class="mono">${esc(m.codigo)}</td>
             <td>${esc(m.tipoPapel ?? '—')}</td>
             <td>${instante(m.montadoEn)}</td>
             <td class="r">${m.diasMontado}</td>
             <td>${esc(m.montadoPor ?? '—')}</td>
             <td class="r">${yd(m.consumidoEsteMontaje)}</td>
             <td class="r">${yd(m.restante)}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="8" class="nota">Ninguna impresora tiene rollo montado.</td></tr>`

  // El balance es el invariante que hace auditable todo lo demás: lo comprado
  // tiene que repartirse entre lo consumido y lo que sigue existiendo.
  const balance = `
    <table>
      <tbody>
        <tr><td>Yardas compradas (declaradas al ingresar)</td><td class="r">${yd(r.yardasCompradas)}</td></tr>
        <tr><td>− Consumidas y registradas (impresión + enguiamiento + en blanco + reposiciones)</td><td class="r">${yd(r.yardasConsumidas)}</td></tr>
        <tr class="tot"><td>= Papel que todavía existe en libros</td><td class="r">${yd(r.yardasCompradas - r.yardasConsumidas)}</td></tr>
        <tr><td style="padding-left:18px">de eso, disponible en bodega</td><td class="r">${yd(r.yardasEnBodega)}</td></tr>
        <tr><td style="padding-left:18px">de eso, montado en impresoras</td><td class="r">${yd(r.yardasEnImpresoras)}</td></tr>
      </tbody>
    </table>
    ${
      r.rollosSinYardas > 0
        ? `<div class="aviso"><strong>${r.rollosSinYardas} rollo(s) sin yardas declaradas</strong> no suman en ningún total de arriba: se cargaron sin ese dato. Hay que medirlos y corregirlos desde "Corregir ingreso".</div>`
        : ''
    }`

  const senales = `
    <section>
      <h2>Antigüedad del papel en bodega</h2>
      <table><thead><tr><th>Desde la fecha de la factura</th><th class="r">Rollos</th></tr></thead>
      <tbody>${s.antiguedad.map((a) => `<tr><td>${esc(a.etiqueta)}</td><td class="r">${a.rollos}</td></tr>`).join('')}</tbody></table>
      <p class="nota">Papel parado es dinero parado, y el papel se maltrata con el tiempo.</p>
    </section>

    <section>
      <h2>Rollos empezados que siguen en bodega (${s.parciales.length})</h2>
      ${
        s.parciales.length
          ? `<table><thead><tr><th>Rollo</th><th>Tipo</th><th class="r">Ya usadas</th><th class="r">Restante</th></tr></thead>
             <tbody>${s.parciales
               .map(
                 (p) =>
                   `<tr><td class="mono">${esc(p.codigo)}</td><td>${esc(p.tipoPapel)}</td>
                    <td class="r">${yd(p.consumidas)}</td><td class="r">${yd(p.restante)}</td></tr>`,
               )
               .join('')}</tbody></table>
             <p class="nota">Son los que hay que gastar primero. En el conteo son los más fáciles de
             pasar por alto, porque físicamente no parecen un rollo nuevo.</p>`
          : '<p class="nota">Ninguno: todos los rollos en bodega están sin empezar.</p>'
      }
    </section>

    <section>
      <h2>Montajes abiertos hace mucho (${s.montajesLargos.length})</h2>
      ${
        s.montajesLargos.length
          ? `<table><thead><tr><th>Impresora</th><th>Rollo</th><th class="r">Días</th><th>Montado por</th></tr></thead>
             <tbody>${s.montajesLargos
               .map(
                 (m) =>
                   `<tr><td class="mono">${esc(m.impresora)}</td><td class="mono">${esc(m.codigo)}</td>
                    <td class="r">${m.diasMontado}</td><td>${esc(m.montadoPor ?? '—')}</td></tr>`,
               )
               .join('')}</tbody></table>
             <p class="nota">O el rollo se terminó y nadie lo desmontó, o el registro quedó colgado.
             Lo segundo importa más: un montaje abierto sigue recibiendo consumo.</p>`
          : '<p class="nota">Ninguno.</p>'
      }
    </section>

    <section>
      <h2>Papel usado que nadie registró (${s.agotadosConSaldo.length})</h2>
      ${
        s.agotadosConSaldo.length
          ? `<table><thead><tr><th>Rollo</th><th>Tipo</th><th class="r">Declaradas</th><th class="r">Registradas</th><th class="r">Sin registrar</th></tr></thead>
             <tbody>${s.agotadosConSaldo
               .map(
                 (a) =>
                   `<tr><td class="mono">${esc(a.codigo)}</td><td>${esc(a.tipoPapel)}</td>
                    <td class="r">${yd(a.yardasIniciales)}</td><td class="r">${yd(a.consumidas)}</td>
                    <td class="r">${yd(a.restante)}</td></tr>`,
               )
               .join('')}</tbody></table>
             <div class="aviso">Estos rollos se declararon <strong>agotados</strong> pero les quedan
             yardas en libros. No es desperdicio: es papel que se usó sin que su consumo se registrara,
             casi siempre órdenes impresas que no se enviaron desde "Impresión de OPs".</div>`
          : '<p class="nota">Ninguno: todo el papel agotado tiene su consumo registrado.</p>'
      }
    </section>

    ${
      s.consumidoFuera.rollos > 0
        ? `<section>
            <h2>Consumido fuera del ERP</h2>
            <p class="nota"><strong>${s.consumidoFuera.rollos} rollo(s)</strong> · ${yd(s.consumidoFuera.yardas)} yd.
            Se gastaron antes de usar este sistema (se registraron en el WebApp anterior), así que su
            consumo no está acá. Van aparte a propósito: contarlos con los agotados los haría ver
            como papel perdido.</p>
          </section>`
        : ''
    }`

  const cuerpo = soloConteo
    ? `<section><h2>Hoja de conteo — rollos en bodega (${d.enBodega.length})</h2>
        ${hojaDeConteo(d.enBodega, d.incluyeCostos)}</section>`
    : `<section>
        <h2>Resumen por estado</h2>
        <table><thead><tr><th>Estado</th><th class="r">Rollos</th><th class="r">Yardas en libros</th></tr></thead>
        <tbody>${filasEstado}
          <tr class="tot"><td>Total</td><td class="r">${r.rollosTotales}</td><td class="r"></td></tr>
        </tbody></table>
        <p class="nota">Las yardas de "Agotado", "Descartado" y "Consumido fuera del ERP" son saldo en
        libros de papel que ya no está en bodega — no son papel disponible.</p>
      </section>

      <section><h2>Balance de papel</h2>${balance}</section>

      <section>
        <h2>Por ubicación</h2>
        <table><thead><tr><th>Ubicación</th><th class="r">Rollos</th><th class="r">Yardas restantes</th></tr></thead>
        <tbody>${filasUbicacion}</tbody></table>
        <p class="nota">Sobre todos los rollos, no solo bodega. "Sin clasificar" se asigna desde
        "Corregir ingreso".</p>
      </section>

      <section>
        <h2>Por tipo de papel</h2>
        <table><thead><tr>
          <th>Tipo de papel</th>
          <th class="r">Rollos en bodega</th><th class="r">Yd. en bodega</th>
          <th class="r">Rollos montados</th><th class="r">Yd. montadas</th>
          ${d.incluyeCostos ? '<th class="r">Valor en bodega</th>' : ''}
        </tr></thead><tbody>${filasTipo}</tbody></table>
        ${
          d.incluyeCostos && (r.rollosSinCosto ?? 0) > 0
            ? `<div class="aviso">La valorización cubre solo los rollos con costo declarado:
               <strong>${r.rollosSinCosto} de ${r.porEstado.find((e) => e.estado === 'EN_BODEGA')?.rollos ?? 0}</strong>
               rollos en bodega no lo traen, así que el total es un piso y no el valor del inventario.</div>`
            : ''
        }
      </section>

      <section>
        <h2>Rollos montados en impresoras (${d.enImpresoras.length})</h2>
        <table><thead><tr>
          <th>Impresora</th><th>Rollo</th><th>Tipo</th><th>Montado</th>
          <th class="r">Días</th><th>Por</th><th class="r">Consumo</th><th class="r">Restante</th>
        </tr></thead><tbody>${filasImpresoras}</tbody></table>
      </section>

      <section><h2>Hoja de conteo — rollos en bodega (${d.enBodega.length})</h2>
        ${hojaDeConteo(d.enBodega, d.incluyeCostos)}</section>

      ${senales}`

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Inventario de rollos</title><style>${ESTILOS}</style></head><body>
    <div class="head">
      ${encabezadoMarcaHTML(marca, 44, 170)}
      <div>
        <div class="empresa">${esc(marca.razonSocial)}</div>
        <div class="sub">Inventario de rollos de papel${d.incluyeCostos ? '' : ' · sin valorización'}</div>
      </div>
    </div>
    <div class="meta">
      <div>
        <div class="titulo">${soloConteo ? 'Hoja de conteo de bodega' : 'Inventario de rollos'}</div>
        <div>Generado: ${instante(d.generadoEn)}</div>
        <div>Por: ${esc(generadoPor)}</div>
      </div>
      <div style="text-align:right">
        <div>Rollos en bodega: <strong>${r.porEstado.find((e) => e.estado === 'EN_BODEGA')?.rollos ?? 0}</strong></div>
        <div>Yardas disponibles: <strong>${yd(r.yardasEnBodega)}</strong></div>
        ${d.incluyeCostos && r.valorEnBodega != null ? `<div>Valor en bodega: <strong>${q(r.valorEnBodega)}</strong></div>` : ''}
      </div>
    </div>
    ${cuerpo}
    <div class="firmas">
      <div class="firma">Contado por</div>
      <div class="firma">Revisado por</div>
      <div class="firma">Fecha del conteo</div>
    </div>
    <div class="foot">Digitexsa ERP · Los datos salen del sistema al momento de generar este informe
    (${instante(d.generadoEn)}); cualquier movimiento posterior no está incluido.</div>
    </body></html>`

  imprimirHTML(html)
}
