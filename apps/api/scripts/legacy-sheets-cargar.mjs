/**
 * Paso 2 de la migración del legacy: carga a `costeo` los TSV que produjo
 * `legacy-sheets-extraer.mjs`. Corre EN EL SERVIDOR, contra localhost.
 *
 *   node scripts/legacy-sheets-cargar.mjs --datos /tmp/migracion --dry-run
 *   node scripts/legacy-sheets-cargar.mjs --datos /tmp/migracion
 *
 * ⚠️ `--dry-run` NO simula: hace todos los INSERT de verdad dentro de una
 * transacción y al final hace ROLLBACK. Así se ejercitan los CHECK, las FK y los
 * índices únicos reales — una simulación en memoria no probaría nada de eso.
 *
 * ⚠️ Va por SQL y no por la API a propósito (ver docs/03-MIGRACION-LEGACY-SHEETS.md):
 * `capturarUna()` exige un rollo montado y tiraría 409 en las 33 mil filas, y el
 * espejo a Google Sheets reescribiría en los mismos libros de los que salieron
 * estos datos, duplicando lo que leen los Dashboards.
 *
 * Todo se resuelve POR NOMBRE O CÓDIGO, nunca por id: los ids difieren entre
 * local y producción (la talla `2XS-XS` es 440 en una y 298 en la otra).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
// ⚠️ Relativo al propio script, no al directorio donde se invoca: el script del
// logo falló así cuando se corrió desde la raíz del repo en vez de apps/api.
process.loadEnvFile(path.resolve(AQUI, '..', '.env'));

function arg(nombre, def = undefined) {
  const i = process.argv.indexOf('--' + nombre);
  return i >= 0 ? process.argv[i + 1] : def;
}
const bandera = (n) => process.argv.includes('--' + n);

const DATOS = arg('datos');
const DRY = bandera('dry-run');
const EMPRESA = arg('empresa', 'DIGITEXSA');
if (!DATOS) {
  console.error('Falta --datos <carpeta con los .tsv>');
  process.exit(1);
}

// ─────────────────────────── utilidades ───────────────────────────
const f = (n) => Number(n).toLocaleString('es-GT');
const yd = (n) => Number(n).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Las columnas son numeric(12,4); redondear acá evita el ruido del float de JS. */
const r4 = (n) => Math.round(Number(n) * 10000) / 10000;

function leerTsv(archivo) {
  const texto = readFileSync(path.join(DATOS, archivo), 'utf8');
  const lineas = texto.split('\n').filter((l) => l.length > 0);
  const cols = lineas[0].split('\t');
  return lineas.slice(1).map((l) => {
    const partes = l.split('\t');
    const o = {};
    cols.forEach((c, i) => { o[c] = (partes[i] ?? '').trim(); });
    return o;
  });
}

const problemas = [];
const anotar = (fase, motivo, detalle) => problemas.push({ fase, motivo, detalle });

/**
 * El NRollo del legacy solo sirve si de verdad tiene forma de código de rollo
 * (`factura-total-secuencia`). En las reposiciones, 2,260 de 3,613 traen el
 * resultado fallido de la heurística (`No encontrado`, `Buscando...`, `Error`) —
 * justamente lo que el ERP reemplazó resolviéndolo con `fn_rollo_en()`.
 * Guardar esos literales sería ruido que después nadie puede distinguir de un
 * dato real.
 */
const nrolloUtil = (v) => (v && /^[0-9A-Za-z-]+-\d+-\d+$/.test(v) ? v : null);

/** INSERT en lotes: Postgres topa en 65535 parámetros por sentencia. */
async function insertarEnLotes(cli, sql, filas, porFila, tamano = 400) {
  let afectadas = 0;
  for (let i = 0; i < filas.length; i += tamano) {
    const lote = filas.slice(i, i + tamano);
    const valores = [];
    const marcadores = lote.map((fila) => {
      const vs = porFila(fila);
      const inicio = valores.length;
      valores.push(...vs);
      return '(' + vs.map((_, k) => `$${inicio + k + 1}`).join(',') + ')';
    });
    const res = await cli.query(sql.replace('%VALUES%', marcadores.join(',')), valores);
    afectadas += res.rowCount;
  }
  return afectadas;
}

async function mapaDe(cli, sql, claveFn = (r) => r.clave) {
  const { rows } = await cli.query(sql);
  const m = new Map();
  for (const row of rows) m.set(claveFn(row), row.id);
  return m;
}

// ─────────────────────────── proceso ───────────────────────────
const cli = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cli.connect();

const consumos = leerTsv('consumos.tsv');
const reposiciones = leerTsv('reposiciones.tsv');

console.log('');
console.log('%s', DRY ? '*** CORRIDA EN SECO: todo se inserta y al final se revierte ***' : '*** CARGA REAL ***');
console.log('datos: %s', DATOS);
console.log('leídos: %s consumos · %s reposiciones', f(consumos.length), f(reposiciones.length));
console.log('');

await cli.query('BEGIN');
try {
  // ══════════ FASE 1 · catálogos ══════════
  const { rows: [emp] } = await cli.query(
    'SELECT id_empresa AS id FROM core.empresas WHERE codigo=$1', [EMPRESA]);
  if (!emp) throw new Error(`No existe la empresa ${EMPRESA}`);
  const idEmpresa = emp.id;

  // Usuario de la migración: existe para dar autoría, NO para entrar al sistema.
  // Va inactivo y sin hash válido de bcrypt, así que no puede iniciar sesión, y
  // sin rol en ninguna empresa no aparece en ningún selector.
  let { rows: [usr] } = await cli.query(
    "SELECT id_usuario AS id FROM core.usuarios WHERE username='migracion'");
  if (!usr) {
    ({ rows: [usr] } = await cli.query(
      `INSERT INTO core.usuarios (username, nombre_completo, password_hash, activo)
       VALUES ('migracion','Migración de datos legacy','!sin-acceso', false)
       RETURNING id_usuario AS id`));
  }
  const idUsuario = usr.id;

  // Cliente del servicio de sublimado (D3d).
  await cli.query(
    `INSERT INTO recetas.clientes (codigo, nombre)
     SELECT '900', 'MANUFACTURAS DEL SOL, S.A.'
     WHERE NOT EXISTS (SELECT 1 FROM recetas.clientes WHERE upper(nombre) LIKE 'MANUFACTURAS DEL SOL%')`);

  // Telas faltantes (D5): se crean con el código y la descripción del legacy y
  // costo 0, igual que los 1,281 productos sin receta que ya conviven ahí.
  // Categoría y unidad se resuelven por NOMBRE y por lo que usan las telas que
  // ya existen, nunca por id.
  const { rows: [cat] } = await cli.query(
    "SELECT id_categoria AS id FROM recetas.categorias_insumo WHERE nombre='Telas'");
  const { rows: [uni] } = await cli.query(
    `SELECT i.id_unidad AS id FROM recetas.insumos i
     WHERE i.id_categoria=$1 GROUP BY i.id_unidad ORDER BY count(*) DESC LIMIT 1`, [cat.id]);
  if (!cat || !uni) throw new Error('No se pudo resolver la categoría/unidad de telas');

  const telas = new Map();
  for (const rp of reposiciones) {
    if (rp.tela_codigo && !telas.has(rp.tela_codigo)) telas.set(rp.tela_codigo, rp.tela_descripcion);
  }
  const telasNuevas = await insertarEnLotes(cli,
    `INSERT INTO recetas.insumos (codigo, descripcion, id_categoria, id_unidad, costo_promedio, activo)
     VALUES %VALUES% ON CONFLICT (codigo) DO NOTHING`,
    [...telas.entries()],
    ([codigo, desc]) => [codigo, desc || codigo, cat.id, uni.id, 0, true]);

  // Productos que faltan, con su desarrollo (la FK productos.desarrollo es NOT NULL).
  // Se aprueban por SQL porque la API exige al menos una línea de receta, y estos
  // no la tienen — igual que los 1,281 desarrollos del backfill.
  const nuevosProductos = [
    { des: '1800002182', desDesc: 'WOMEN BOARD SHORT (LINNER BLACK)',
      cod: 'SWBRDS', desc: '95/5% POLY SPANDEX WOMEN BOARD SHORT',
      patron: 'DPW-240008-CK', tamano: 'L', cliente: 'CLIFF KEEN ATHLETIC' },
    { des: '2600SUBMDS', desDesc: 'SERVICIO DE SUBLIMADO',
      cod: 'SERV-SUBLIMADO', desc: 'SERVICIO DE SUBLIMADO',
      patron: 'NO APLICA', tamano: 'L', cliente: 'MANUFACTURAS DEL SOL, S.A.' },
  ];
  let prodNuevos = 0;
  for (const p of nuevosProductos) {
    const { rows: [ya] } = await cli.query(
      'SELECT 1 FROM recetas.productos WHERE codigo=$1', [p.cod]);
    if (ya) continue;
    await cli.query(
      `INSERT INTO recetas.desarrollos (codigo, descripcion, estado, aprobado_en, aprobado_por, creado_por, activo)
       VALUES ($1,$2,'APROBADO', now(), $3, $3, true) ON CONFLICT (codigo) DO NOTHING`,
      [p.des, p.desDesc, idUsuario]);
    await cli.query(
      `INSERT INTO recetas.productos (codigo, desarrollo, descripcion, patron, tamano, id_cliente, precio_venta, minutos_mo, costo_mo_minuto, activo)
       VALUES ($1,$2,$3,$4,$5,(SELECT id_cliente FROM recetas.clientes WHERE upper(nombre) LIKE upper($6)||'%' LIMIT 1),0,0,0,true)`,
      [p.cod, p.des, p.desc, p.patron, p.tamano, p.cliente]);
    prodNuevos += 1;
  }
  console.log('F1 catálogos · telas nuevas %s · productos nuevos %s · usuario id %s',
    f(telasNuevas), f(prodNuevos), idUsuario);

  // ══════════ mapas de resolución ══════════
  const mProducto = await mapaDe(cli, 'SELECT codigo AS clave, id_producto AS id FROM recetas.productos');
  const mTalla = await mapaDe(cli, 'SELECT upper(nombre) AS clave, id_talla AS id FROM recetas.tallas');
  const mPapel = await mapaDe(cli, 'SELECT upper(nombre) AS clave, id_tipo_papel AS id FROM costeo.tipo_papel');
  const mImpresora = await mapaDe(cli, 'SELECT upper(codigo) AS clave, id_impresora AS id FROM costeo.impresora');
  const mDepto = await mapaDe(cli, 'SELECT upper(nombre) AS clave, id_departamento AS id FROM costeo.departamento');
  const mDefecto = await mapaDe(cli, 'SELECT upper(nombre) AS clave, id_defecto AS id FROM costeo.defecto');
  const mCalandra = await mapaDe(cli, 'SELECT upper(codigo) AS clave, id_calandra AS id FROM costeo.calandra');
  const mInsumo = await mapaDe(cli, 'SELECT codigo AS clave, id_insumo AS id FROM recetas.insumos');
  const mCliente = await mapaDe(cli, 'SELECT upper(nombre) AS clave, id_cliente AS id FROM recetas.clientes');

  /**
   * D3c: el legacy guardó el GRUPO (`MK's`), no la máquina. El usuario pidió
   * repartir entre MK3 y MK5. ⚠️ Es una aproximación que el dato no respalda,
   * por eso cada fila afectada lo dice en su `observacion`.
   */
  const opsMK = [...new Set(consumos.filter((c) => c.impresora === "MK's").map((c) => c.op))].sort();
  const mkDeOp = new Map(opsMK.map((op, i) => [op, i % 2 === 0 ? 'MK3' : 'MK5']));
  const NOTA_MK = 'Impresora aproximada: el legacy registró solo el grupo MK\'s, no la máquina.';

  const impresoraDe = (fila) =>
    fila.impresora === "MK's" ? mImpresora.get(mkDeOp.get(fila.op)) : mImpresora.get(fila.impresora.toUpperCase());

  // ══════════ FASE 2 · órdenes ══════════
  const codigosOp = [...new Set([...consumos.map((c) => c.op), ...reposiciones.map((r) => r.op)])];

  /**
   * La orden de compra NO viene como columna en ningún libro del legacy, pero
   * sí se deduce: el LINE es `<orden de compra>` o `<orden de compra>-<n>`, que
   * es exactamente la regla con la que el ERP genera el Item desde 2026-10-08.
   * Se resuelve por OP y no por LINE suelto, tomando el candidato más largo que
   * explique TODOS los LINE de esa orden.
   *
   * ⚠️ Hacerlo por LINE suelto con un `-\d+$` da mal: en `RECLAMO-7012107575`
   * el sufijo es todo dígitos y se lo comería, dejando la OC en `RECLAMO`.
   * Mirando el conjunto, el candidato `RECLAMO-7012107575` explica las dos
   * líneas y `RECLAMO` no, así que gana el correcto.
   */
  const ocDeLineas = (lineas) => {
    const cand = new Set();
    for (const l of lineas) {
      cand.add(l);
      const m = /^(.*)-\d+$/.exec(l);
      if (m) cand.add(m[1]);
    }
    const sirve = [...cand].filter((c) =>
      lineas.every((l) => l === c || new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+$`).test(l)));
    return sirve.sort((a, b) => b.length - a.length)[0] ?? null;
  };

  /**
   * El cliente sí viene, pero en dos formatos distintos según el libro:
   * `ConsumosFinal` lo trae limpio (4 valores: BSN SPORTS, UNDER ARMOUR,
   * CLIFF KEEN ATHLETIC, MANUFACTURAS DEL SOL), mientras que `Registro` lo trae
   * mezclado con la línea de producto (`BSN Soccer`, `UA-Exclusive - Football
   * Jersey`) — el hallazgo de ANEXO_A §2.3 que motivó modelar la línea como
   * catálogo aparte. Por eso el limpio manda, y el mezclado se usa solo para
   * las órdenes que únicamente tienen reposición.
   */
  const clientePorTextoMezclado = (txt) => {
    const t = txt.trim().toUpperCase();
    if (t.startsWith('UA')) return mCliente.get('UNDER ARMOUR');
    if (t.startsWith('BSN')) return mCliente.get('BSN SPORTS');
    if (t.startsWith('CLIFF')) return mCliente.get('CLIFF KEEN ATHLETIC');
    if (t.startsWith('SHERRY')) return mCliente.get('SHERRY MANUFACTURING CO. INC');
    return null;
  };

  const clienteRepoPorOp = new Map();
  for (const r of reposiciones)
    if (!clienteRepoPorOp.has(r.op)) clienteRepoPorOp.set(r.op, r.cliente);

  const lineasPorOp = new Map();
  const clientesPorOp = new Map();
  for (const c of consumos) {
    if (c.line) {
      if (!lineasPorOp.has(c.op)) lineasPorOp.set(c.op, new Set());
      lineasPorOp.get(c.op).add(c.line);
    }
    if (!clientesPorOp.has(c.op)) clientesPorOp.set(c.op, new Set());
    clientesPorOp.get(c.op).add(c.cliente.trim());
  }

  let conOc = 0, conCliente = 0, clienteAmbiguo = 0;
  const datosOp = new Map();
  for (const cod of codigosOp) {
    const lineas = [...(lineasPorOp.get(cod) ?? [])];
    const oc = lineas.length ? ocDeLineas(lineas) : null;

    let idCliente = null;
    const nombres = clientesPorOp.get(cod);
    if (nombres && nombres.size === 1) {
      idCliente = mCliente.get([...nombres][0].toUpperCase()) ?? null;
    } else if (nombres && nombres.size > 1) {
      // Una OP con dos clientes distintos no se puede representar: `id_cliente`
      // es uno solo. Queda en NULL en vez de elegir uno a dedo — y como son
      // empates (12/12, 1/1…), ni siquiera habría mayoría que desempatara.
      clienteAmbiguo += 1;
    } else {
      // Solo tiene reposición: el único cliente disponible es el mezclado.
      const txt = clienteRepoPorOp.get(cod);
      if (txt) idCliente = clientePorTextoMezclado(txt) ?? null;
    }
    if (oc) conOc += 1;
    if (idCliente) conCliente += 1;
    datosOp.set(cod, { oc, idCliente });
  }

  const opsNuevas = await insertarEnLotes(cli,
    `INSERT INTO costeo.orden_produccion
       (anio, correlativo, id_empresa, id_cliente, orden_compra, creado_por, creado_en)
     VALUES %VALUES% ON CONFLICT (id_empresa, anio, correlativo) DO NOTHING`,
    codigosOp,
    (cod) => [Number(cod.slice(0, 2)), Number(cod.slice(4)), idEmpresa,
      datosOp.get(cod).idCliente, datosOp.get(cod).oc, idUsuario, new Date()]);
  const mOp = await mapaDe(cli,
    `SELECT codigo AS clave, id_orden_produccion AS id FROM costeo.orden_produccion WHERE id_empresa=${idEmpresa}`);
  console.log('F2 órdenes   · del legacy %s · creadas %s · ya existían %s',
    f(codigosOp.length), f(opsNuevas), f(codigosOp.length - opsNuevas));
  console.log('             · con orden de compra %s · con cliente %s · cliente ambiguo (queda vacío) %s',
    f(conOc), f(conCliente), f(clienteAmbiguo));

  // ══════════ FASE 3 · líneas ══════════
  // Una línea por LINE. Las 86 filas de servicio vienen sin LINE, así que se les
  // sintetiza `<OP>-SERV`: `codigo_line` es NOT NULL y único.
  const lineas = new Map();
  for (const c of consumos) {
    const codigo = c.line || `${c.op}-SERV`;
    if (lineas.has(codigo)) continue;
    const idProd = mProducto.get(c.item);
    if (!idProd) { anotar('F3', 'producto no existe', `${c.item} (LINE ${codigo})`); continue; }
    lineas.set(codigo, { codigo, idOp: mOp.get(c.op), idProd, op: c.op });
  }
  const porCrear = [...lineas.values()].filter((l) => l.idOp);
  const lineasNuevas = await insertarEnLotes(cli,
    `INSERT INTO costeo.linea_produccion (codigo_line, id_orden_produccion, id_producto, id_empresa, creado_por, creado_en)
     VALUES %VALUES% ON CONFLICT (id_empresa, codigo_line) DO NOTHING`,
    porCrear,
    (l) => [l.codigo, l.idOp, l.idProd, idEmpresa, idUsuario, new Date()]);
  const mLinea = await mapaDe(cli,
    `SELECT codigo_line AS clave, id_linea_produccion AS id FROM costeo.linea_produccion WHERE id_empresa=${idEmpresa}`);
  console.log('F3 líneas    · del legacy %s · creadas %s · ya existían %s',
    f(lineas.size), f(lineasNuevas), f(porCrear.length - lineasNuevas));

  // ══════════ FASE 3b · cantidades por talla de la línea ══════════
  // Sin esto la matriz de tallas de la pantalla de Órdenes sale vacía y el total
  // en 0 para todas las OP migradas, como si no hubieran cargado.
  // La `CANT` del legacy es lo que se IMPRIMIÓ de esa talla; en una OP que ya se
  // imprimió completa, eso es también lo planificado. Es un 1:1 con la fila de
  // consumo, no una suma: los reenvíos ya se descartaron más abajo con el mismo
  // criterio de "gana el primero por fecha".
  const tallasDeLinea = new Map();
  for (const c of [...consumos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const idLinea = mLinea.get(c.line || `${c.op}-SERV`);
    const idTalla = c.talla ? mTalla.get(c.talla.toUpperCase()) : null;
    if (!idLinea || !idTalla || !c.cantidad) continue;
    const k = `${idLinea}|${idTalla}`;
    if (!tallasDeLinea.has(k)) tallasDeLinea.set(k, [idLinea, idTalla, Number(c.cantidad)]);
  }
  const tallasNuevas = await insertarEnLotes(cli,
    `INSERT INTO costeo.linea_produccion_talla (id_linea_produccion, id_talla, cantidad)
     VALUES %VALUES% ON CONFLICT (id_linea_produccion, id_talla) DO NOTHING`,
    [...tallasDeLinea.values()], (v) => v);
  const piezas = [...tallasDeLinea.values()].reduce((t, v) => t + v[2], 0);
  console.log('F3b tallas   · combinaciones %s · creadas %s · piezas %s',
    f(tallasDeLinea.size), f(tallasNuevas), f(piezas));

  // ══════════ FASE 4 · consumo de producción ══════════
  // El legacy no protegía contra el reenvío: hay 35 pares (LINE, talla) con la
  // MISMA cantidad repetida el 29-30/09. El ERP los habría deduplicado solo
  // (`capturarUna()` saltea las tallas ya registradas), así que gana la primera
  // por fecha y la repetida se reporta.
  // ⚠️ Las 86 filas de servicio tienen `id_talla` NULL, y en un índice único NULL
  // nunca choca: el `ON CONFLICT` de abajo no las atrapa, así que una segunda
  // corrida las duplicaría (3,582 yd de consumo fantasma). Y no tienen llave
  // natural — `26OP025662` trae `cant=11` dos veces y `cant=2` tres veces en la
  // misma fecha, y son entradas de servicio distintas, no duplicados. Así que la
  // idempotencia va por BLOQUE: la migración carga de una vez todas las filas de
  // una línea, en una sola transacción, así que si la línea ya tiene consumo de
  // servicio, su bloque completo ya entró.
  const { rows: servicioYa } = await cli.query(
    `SELECT DISTINCT id_linea_produccion AS id FROM costeo.consumo_papel
     WHERE id_talla IS NULL AND origen='PRODUCCION' AND anulado_en IS NULL`);
  const lineasServicioCargadas = new Set(servicioYa.map((r) => r.id));

  const vistos = new Set();
  const aInsertar = [];
  let repetidas = 0, ydRepetidas = 0, servicioYaEstaba = 0;
  for (const c of [...consumos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const codigoLinea = c.line || `${c.op}-SERV`;
    const idLinea = mLinea.get(codigoLinea);
    if (!idLinea) { anotar('F4', 'sin línea (producto inexistente)', `${c.op} / ${codigoLinea} / ${c.item}`); continue; }
    const idTalla = c.talla ? mTalla.get(c.talla.toUpperCase()) ?? null : null;
    if (c.talla && !idTalla && c.talla.toUpperCase() !== 'YDS') {
      anotar('F4', 'talla no existe', `${c.talla} (${c.op})`);
    }
    if (idTalla != null) {
      const k = `${idLinea}|${idTalla}`;
      if (vistos.has(k)) { repetidas += 1; ydRepetidas += Number(c.consumo_yd); continue; }
      vistos.add(k);
    } else if (lineasServicioCargadas.has(idLinea)) {
      servicioYaEstaba += 1;
      continue;
    }
    const idImp = impresoraDe(c);
    const idPapel = mPapel.get(c.tipo_papel.toUpperCase());
    if (!idImp || !idPapel) {
      anotar('F4', !idImp ? 'impresora no existe' : 'tipo de papel no existe', `${c.impresora} / ${c.tipo_papel}`);
      continue;
    }
    const nr = nrolloUtil(c.nrollo);
    const obs = [nr ? `NRollo legacy: ${nr}` : '', c.impresora === "MK's" ? NOTA_MK : '']
      .filter(Boolean).join(' · ') || null;
    aInsertar.push([
      c.fecha, 'PRODUCCION', mOp.get(c.op), idLinea, mProducto.get(c.item) ?? null, idTalla,
      idImp, idPapel, c.cantidad === '' ? null : Number(c.cantidad),
      r4(c.enguiamiento_yd), r4(c.consumo_yd), obs, idUsuario,
    ]);
  }
  const consumosNuevos = await insertarEnLotes(cli,
    `INSERT INTO costeo.consumo_papel
       (fecha, origen, id_orden_produccion, id_linea_produccion, id_producto, id_talla,
        id_impresora, id_tipo_papel, cantidad, enguiamiento_yd, consumo_yd, observacion, creado_por)
     VALUES %VALUES%
     ON CONFLICT (id_linea_produccion, id_talla) WHERE origen='PRODUCCION' AND anulado_en IS NULL DO NOTHING`,
    aInsertar, (v) => v, 300);
  const ydInsertadas = aInsertar.reduce((t, v) => t + Number(v[10]), 0);
  console.log('F4 consumos  · a insertar %s · insertados %s · ya existían %s · reenvíos descartados %s (%s yd)',
    f(aInsertar.length), f(consumosNuevos),
    f(aInsertar.length - consumosNuevos + servicioYaEstaba), f(repetidas), yd(ydRepetidas));
  if (servicioYaEstaba) console.log('             · filas de servicio ya migradas: %s', f(servicioYaEstaba));
  console.log('             · yardas de lo insertado: %s', yd(ydInsertadas));

  // ══════════ FASE 5 · reposiciones ══════════
  // D1: el número del legacy se repite dentro de una misma orden, así que se
  // renumera por fecha y el original queda en `numero_repo_legacy`.
  const porOp = new Map();
  for (const rp of [...reposiciones].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!porOp.has(rp.op)) porOp.set(rp.op, []);
    porOp.get(rp.op).push(rp);
  }
  const { rows: maxRepo } = await cli.query(
    `SELECT id_orden_produccion AS id, max(numero_repo) AS n FROM costeo.reposicion GROUP BY 1`);
  const mMax = new Map(maxRepo.map((r) => [r.id, Number(r.n)]));

  // ⚠️ Acá el `ON CONFLICT (orden, numero_repo)` NO alcanza para ser idempotente:
  // al renumerar desde MAX+1, una segunda corrida elegiría números libres y
  // duplicaría las 3,612 filas en vez de saltearlas. La llave natural de una
  // reposición del legacy es (orden, número que traía, fecha) — el número solo no
  // sirve porque el legacy lo repetía dentro de la misma orden, que es justamente
  // el motivo de la renumeración.
  const { rows: yaMigradas } = await cli.query(
    `SELECT id_orden_produccion AS op, numero_repo_legacy AS n, fecha
     FROM costeo.reposicion WHERE numero_repo_legacy IS NOT NULL`);
  const existentes = new Set(yaMigradas.map((r) => `${r.op}|${r.n}|${r.fecha.toISOString()}`));

  const repoInsert = [];
  let sinEspacio = 0, yaEstaban = 0;
  for (const [op, filas] of porOp) {
    const idOp = mOp.get(op);
    if (!idOp) { anotar('F5', 'orden no resuelta', op); continue; }
    let n = (mMax.get(idOp) ?? 0) + 1;
    for (const rp of filas) {
      if (existentes.has(`${idOp}|${Number(rp.numero_repo_legacy)}|${new Date(rp.fecha).toISOString()}`)) {
        yaEstaban += 1;
        continue;
      }
      if (n > 99) { sinEspacio += 1; anotar('F5', 'más de 99 reposiciones en la orden', op); continue; }
      const idDepto = mDepto.get(rp.departamento.toUpperCase());
      const idDefecto = mDefecto.get(rp.defecto.toUpperCase());
      if (!idDepto || !idDefecto) {
        anotar('F5', !idDepto ? 'departamento no existe' : 'defecto no existe', `${rp.departamento} / ${rp.defecto}`);
        continue;
      }
      // `reposicion` no tiene columna `observacion` (a diferencia de
      // `consumo_papel`), así que el NRollo rastreable se anexa al comentario
      // del operario, después de su texto y con etiqueta, para que se distinga
      // de lo que él escribió.
      const nr = nrolloUtil(rp.nrollo);
      const comentario = [rp.comentario, nr ? `NRollo legacy: ${nr}` : '']
        .filter(Boolean).join(' · ') || null;
      repoInsert.push([
        rp.fecha, idOp, n, idDepto, idDefecto,
        mImpresora.get(rp.impresora.toUpperCase()) ?? null,
        rp.calandra ? mCalandra.get(rp.calandra.toUpperCase()) ?? null : null,
        rp.tipo_papel ? mPapel.get(rp.tipo_papel.toUpperCase()) ?? null : null,
        r4(rp.yardas_papel),
        rp.tela_codigo ? mInsumo.get(rp.tela_codigo) ?? null : null,
        r4(rp.yardas_tela),
        comentario,
        Number(rp.numero_repo_legacy),
        idUsuario,
      ]);
      n += 1;
    }
  }
  const reposNuevas = await insertarEnLotes(cli,
    `INSERT INTO costeo.reposicion
       (fecha, id_orden_produccion, numero_repo, id_departamento, id_defecto, id_impresora,
        id_calandra, id_tipo_papel, yardas_papel, id_insumo_tela, yardas_tela, comentario,
        numero_repo_legacy, creado_por)
     VALUES %VALUES% ON CONFLICT (id_orden_produccion, numero_repo) DO NOTHING`,
    repoInsert, (v) => v, 300);
  const papelRepo = repoInsert.reduce((t, v) => t + Number(v[8]), 0);
  const telaRepo = repoInsert.reduce((t, v) => t + Number(v[10]), 0);
  const conTela = repoInsert.filter((v) => v[9] != null).length;
  console.log('F5 reposic.  · a insertar %s · insertadas %s · ya migradas %s · sin espacio %s',
    f(repoInsert.length), f(reposNuevas), f(yaEstaban), f(sinEspacio));
  console.log('             · papel %s yd · tela %s yd · con tela identificada %s de %s',
    yd(papelRepo), yd(telaRepo), f(conTela), f(repoInsert.length));

  // ══════════ FASE 6 · una sola entrada en la bitácora ══════════
  // Una, no 37,000: la bitácora narra acciones de personas, y un volcado masivo
  // la volvería ilegible.
  await cli.query(
    `INSERT INTO core.auditoria (id_empresa, id_usuario, usuario_nombre, entidad, id_entidad, accion, datos_nuevos)
     VALUES ($1,$2,'migracion','costeo.migracion_legacy','sheets','CREATE',$3)`,
    [idEmpresa, idUsuario, JSON.stringify({
      origen: 'Google Sheets legacy (DataREPOSMig + ConsumosFinal)',
      ordenes: opsNuevas, lineas: lineasNuevas, tallas: tallasNuevas,
      consumos: consumosNuevos, reposiciones: reposNuevas,
      telas: telasNuevas, productos: prodNuevos,
    })]);

  // ══════════ problemas ══════════
  if (problemas.length) {
    const agrupados = new Map();
    for (const p of problemas) {
      const k = `${p.fase} · ${p.motivo}`;
      if (!agrupados.has(k)) agrupados.set(k, []);
      agrupados.get(k).push(p.detalle);
    }
    console.log('');
    console.log('FILAS QUE NO ENTRARON:');
    for (const [k, ds] of [...agrupados].sort()) {
      // console.log no entiende el ancho de printf (%-46s), hay que padear a mano.
      console.log('   %s %s', k.padEnd(46), f(ds.length));
      console.log('      ej: %s', [...new Set(ds)].slice(0, 3).join(' | '));
    }
  }

  if (DRY) {
    await cli.query('ROLLBACK');
    console.log('');
    console.log('*** ROLLBACK: no se escribió nada. Todas las restricciones se ejercitaron de verdad. ***');
  } else {
    await cli.query('COMMIT');
    console.log('');
    console.log('*** COMMIT: datos cargados. ***');
  }
} catch (e) {
  await cli.query('ROLLBACK');
  console.error('');
  console.error('FALLÓ, se revirtió todo:', e.message);
  if (e.detail) console.error('detalle:', e.detail);
  if (e.constraint) console.error('restricción:', e.constraint);
  process.exitCode = 1;
} finally {
  await cli.end();
}
