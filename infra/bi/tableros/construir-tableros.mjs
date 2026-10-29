/**
 * Construye en Superset la primera tanda de tableros del ERP, por la API.
 *
 * Es el PUNTO DE PARTIDA, no una fuente de verdad permanente: el equipo edita los
 * tableros desde Superset. Por eso NUNCA toca un tablero que ya existe (se salta
 * con un aviso); solo `--recrear <clave>` lo borra y lo vuelve a armar, y eso
 * descarta los cambios que alguien le haya hecho.
 *
 * Idempotente y reproducible: sirve igual en local y en el servidor. Al final
 * imprime el JSON de `BI_TABLEROS` (clave → UUID embebido) para el `.env` de la API.
 *
 * Variables (en local salen de infra/bi/.env.local):
 *   SUPERSET_URL, SUPERSET_ADMIN_USER, SUPERSET_ADMIN_PASSWORD, ERP_ORIGEN
 *
 * Uso:
 *   node --env-file=infra/bi/.env.local infra/bi/tableros/construir-tableros.mjs [--recrear clave|todos] [--escribir-env ruta]
 */
const URL_BASE = (process.env.SUPERSET_URL ?? 'http://localhost:8088').replace(/\/+$/, '');
const USUARIO = process.env.SUPERSET_ADMIN_USER;
const CLAVE = process.env.SUPERSET_ADMIN_PASSWORD;
const ORIGEN_ERP = process.env.ERP_ORIGEN ?? 'http://localhost:5173';
const iRec = process.argv.indexOf('--recrear');
const RECREAR = iRec >= 0 ? process.argv[iRec + 1] : null;
if (!USUARIO || !CLAVE) {
  console.error('Faltan SUPERSET_ADMIN_USER / SUPERSET_ADMIN_PASSWORD.');
  process.exit(1);
}

// ── Cliente HTTP mínimo ─────────────────────────────────────────────
let AUTH = {};
async function api(ruta, { m = 'GET', body } = {}) {
  const r = await fetch(URL_BASE + ruta, {
    method: m,
    headers: { 'Content-Type': 'application/json', Referer: URL_BASE, ...AUTH },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { j = { raw: t }; }
  return { ok: r.ok, s: r.status, j, hd: r.headers };
}
const login = await api('/api/v1/security/login', { m: 'POST', body: { username: USUARIO, password: CLAVE, provider: 'db', refresh: false } });
if (!login.ok) throw new Error('Login en Superset falló: ' + JSON.stringify(login.j));
AUTH = { Authorization: `Bearer ${login.j.access_token}` };
const csrf = await api('/api/v1/security/csrf_token/');
AUTH = { ...AUTH, 'X-CSRFToken': csrf.j.result, Cookie: csrf.hd.getSetCookie().map((x) => x.split(';')[0]).join('; ') };

// ── Datasets: por nombre, y con su columna de tiempo principal ──────
const lista = await api('/api/v1/dataset/?q=' + encodeURIComponent(JSON.stringify({ page_size: 200 })));
const DS = {};
for (const d of lista.j.result ?? []) if (d.schema === 'analitica') DS[d.table_name] = d.id;
const COL_TIEMPO = { v_consumo: 'fecha_dia', v_reposiciones: 'fecha_dia', v_reposicion_prendas: 'fecha_dia', v_rollos: 'fecha_factura', v_facturacion: 'fecha', v_costo_op: 'fecha_impresion', v_ordenes: 'fecha_impresion' };
for (const [vista, id] of Object.entries(DS)) {
  await api(`/api/v1/dataset/${id}/refresh`, { m: 'PUT' }); // trae columnas nuevas de la vista
  if (COL_TIEMPO[vista]) await api(`/api/v1/dataset/${id}`, { m: 'PUT', body: { main_dttm_col: COL_TIEMPO[vista] } });
}

// ── Piezas de gráfico ───────────────────────────────────────────────
const PALETA = 'digitexsa';
const sql = (e, label) => ({ expressionType: 'SQL', sqlExpression: e, label });
const SUM = (col, label) => sql(`SUM(${col})`, label);
const FORMATO = ',.0f';

const kpi = (titulo, metrica, w = 3, sub = '', formato = ',.0f') => ({
  w, h: 22, titulo, viz: 'big_number_total',
  params: { metric: metrica, adhoc_filters: [], subheader: sub, header_font_size: 0.42, subheader_font_size: 0.14, y_axis_format: formato, color_picker: { r: 32, g: 48, b: 128, a: 1 } },
});
const barraTiempo = (titulo, metricas, w = 8, { agrupar = [], apilar = true, formato = FORMATO } = {}) => ({
  w, h: 50, titulo, viz: 'echarts_timeseries_bar', tiempo: true,
  params: { x_axis: 'COL_TIEMPO', time_grain_sqla: 'P1M', metrics: metricas, groupby: agrupar, adhoc_filters: [], stack: apilar ? 'Stack' : null, orientation: 'vertical', show_legend: true, legendType: 'scroll', legendOrientation: 'top', y_axis_format: formato, row_limit: 10000, color_scheme: PALETA, rich_tooltip: true, x_axis_title_margin: 15, truncateYAxis: false },
});
const barraCat = (titulo, dim, metrica, w = 6, limite = 10, formato = FORMATO) => ({
  w, h: 50, titulo, viz: 'echarts_timeseries_bar',
  params: { x_axis: dim, metrics: [metrica], groupby: [], adhoc_filters: [], orientation: 'horizontal', row_limit: limite, x_axis_sort: metrica.label, x_axis_sort_asc: false, show_legend: false, show_value: true, y_axis_format: formato, color_scheme: PALETA, rich_tooltip: true },
});
const dona = (titulo, dim, metrica, w = 4, limite = 8) => ({
  w, h: 50, titulo, viz: 'pie',
  params: { groupby: [dim], metric: metrica, adhoc_filters: [], row_limit: limite, sort_by_metric: true, donut: true, innerRadius: 45, outerRadius: 72, show_labels: true, label_type: 'key_percent', show_legend: true, legendType: 'scroll', legendOrientation: 'bottom', number_format: FORMATO, color_scheme: PALETA, show_total: true },
});
const tabla = (titulo, agrupar, metricas, ordenPor, w = 12, limite = 15) => ({
  w, h: 62, titulo, viz: 'table',
  params: { query_mode: 'aggregate', groupby: agrupar, metrics: metricas, all_columns: [], percent_metrics: [], adhoc_filters: [], order_desc: true, timeseries_limit_metric: ordenPor, row_limit: limite, include_time: false, server_page_length: 10, show_cell_bars: true, color_pn: false, allow_render_html: false, table_timestamp_format: 'smart_date' },
});

const filtroSelect = (nombre, vista, col) => ({ tipo: 'select', nombre, vista, col });
const filtroTiempo = () => ({ tipo: 'tiempo', nombre: 'Período' });

// ── Los tableros ────────────────────────────────────────────────────
const yardas = SUM('total_yd', 'Yardas');
const TABLEROS = [
  {
    clave: 'produccion', titulo: 'Producción', vista: 'v_consumo',
    filtros: [filtroTiempo(), filtroSelect('Cliente', 'v_consumo', 'cliente'), filtroSelect('Marca', 'v_consumo', 'marca'), filtroSelect('Estilo', 'v_consumo', 'estilo'), filtroSelect('Impresora', 'v_consumo', 'impresora'), filtroSelect('Tipo de papel', 'v_consumo', 'tipo_papel')],
    filas: [
      [kpi('Piezas impresas', SUM('piezas', 'Piezas'), 3), kpi('Yardas de papel', yardas, 3, 'impresión + enguiamiento + en blanco'), kpi('Órdenes', sql('COUNT(DISTINCT codigo_op)', 'Órdenes'), 3), kpi('Yardas por pieza', sql('SUM(total_yd) FILTER (WHERE NOT es_servicio) / NULLIF(SUM(piezas), 0)', 'Yd/pieza'), 3, 'yardas de papel por pieza (sin servicios por yardas)', ',.2f')],
      [barraTiempo('Yardas por mes y concepto', [SUM('impresion_yd', 'Impresión'), SUM('enguiamiento_yd', 'Enguiamiento'), SUM('en_blanco_yd', 'Papel en blanco')], 8), dona('Yardas por impresora', 'impresora', yardas, 4)],
      [barraCat('Clientes con más consumo', 'cliente', yardas, 6), dona('Por estilo', 'estilo', yardas, 3), dona('Por tipo de papel', 'tipo_papel', yardas, 3)],
      [tabla('Órdenes con más consumo', ['codigo_op', 'cliente'], [SUM('piezas', 'Piezas'), yardas], yardas)],
    ],
  },
  {
    clave: 'calidad', titulo: 'Calidad y reposiciones', vista: 'v_reposiciones',
    filtros: [filtroTiempo(), filtroSelect('Cliente', 'v_reposiciones', 'cliente'), filtroSelect('Departamento', 'v_reposiciones', 'departamento'), filtroSelect('Defecto', 'v_reposiciones', 'defecto'), filtroSelect('Imputable a', 'v_reposiciones', 'imputable_a'), filtroSelect('Tipo', 'v_reposiciones', 'tipo')],
    filas: [
      [kpi('Reposiciones', sql('COUNT(*)', 'Reposiciones'), 3), kpi('Yardas de papel repuestas', SUM('yardas_papel', 'Yardas papel'), 3), kpi('Yardas de tela repuestas', SUM('yardas_tela', 'Yardas tela'), 3, 'aparte, no suma al papel'), kpi('Órdenes con reposición', sql('COUNT(DISTINCT codigo_op)', 'Órdenes'), 3)],
      [barraTiempo('Reposiciones por mes', [sql('COUNT(*)', 'Reposiciones')], 8, { apilar: false }), dona('Por departamento', 'departamento', sql('COUNT(*)', 'Reposiciones'), 4)],
      [barraCat('Defectos más frecuentes', 'defecto', sql('COUNT(*)', 'Reposiciones'), 6, 12), dona('Imputable a', 'imputable_a', sql('COUNT(*)', 'Reposiciones'), 3), dona('Categoría del defecto', 'defecto_categoria', sql('COUNT(*)', 'Reposiciones'), 3)],
      [barraCat('Clientes con más reposiciones', 'cliente', sql('COUNT(*)', 'Reposiciones'), 6), barraCat('Yardas de papel por defecto', 'defecto', SUM('yardas_papel', 'Yardas papel'), 6, 12)],
    ],
  },
  {
    // Dataset aparte de Calidad, a propósito: una fila por PRENDA (sin yardas) y
    // filtros propios. Mezclarlo con v_reposiciones haría filtrar por estilo
    // sobre un dataset que no lo tiene.
    clave: 'prendas', titulo: 'Reposiciones por prenda', vista: 'v_reposicion_prendas',
    filtros: [filtroTiempo(), filtroSelect('Cliente', 'v_reposicion_prendas', 'cliente'), filtroSelect('Marca', 'v_reposicion_prendas', 'marca'), filtroSelect('Estilo', 'v_reposicion_prendas', 'estilo'), filtroSelect('Pieza', 'v_reposicion_prendas', 'pieza'), filtroSelect('Línea', 'v_reposicion_prendas', 'linea'), filtroSelect('Género', 'v_reposicion_prendas', 'genero'), filtroSelect('Deporte', 'v_reposicion_prendas', 'deporte'), filtroSelect('Departamento', 'v_reposicion_prendas', 'departamento'), filtroSelect('Defecto', 'v_reposicion_prendas', 'defecto')],
    filas: [
      [kpi('Piezas repuestas', SUM('piezas', 'Piezas'), 3), kpi('Reposiciones con prendas', sql("COUNT(DISTINCT codigo_op || '-' || codigo_repo)", 'Reposiciones'), 3), kpi('Productos distintos', sql('COUNT(DISTINCT producto)', 'Productos'), 3), kpi('Órdenes', sql('COUNT(DISTINCT codigo_op)', 'Órdenes'), 3)],
      [barraTiempo('Piezas repuestas por mes', [SUM('piezas', 'Piezas')], 8, { apilar: false }), dona('Por estilo', 'estilo', SUM('piezas', 'Piezas'), 4)],
      [barraCat('Piezas por talla', 'talla', SUM('piezas', 'Piezas'), 6, 12), barraCat('Piezas por defecto', 'defecto', SUM('piezas', 'Piezas'), 6, 12)],
      // `pieza` es QUÉ parte de la prenda (cuello, manga…); `piezas` es la cantidad.
      [barraCat('Cantidad por pieza (cuello, manga…)', 'pieza', SUM('piezas', 'Piezas'), 12, 12)],
      [dona('Por deporte', 'deporte', SUM('piezas', 'Piezas'), 4), dona('Por línea', 'linea', SUM('piezas', 'Piezas'), 4), dona('Por género', 'genero', SUM('piezas', 'Piezas'), 4)],
      [tabla('Productos con más piezas repuestas', ['producto', 'estilo', 'cliente'], [SUM('piezas', 'Piezas')], SUM('piezas', 'Piezas'))],
    ],
  },
  {
    clave: 'papel', titulo: 'Papel e inventario', vista: 'v_rollos',
    filtros: [filtroSelect('Tipo de papel', 'v_rollos', 'tipo_papel'), filtroSelect('Estado', 'v_rollos', 'estado'), filtroSelect('Ubicación', 'v_rollos', 'ubicacion')],
    filas: [
      [kpi('Rollos en bodega', sql("COUNT(*) FILTER (WHERE estado = 'EN_BODEGA')", 'En bodega'), 3), kpi('Rollos montados', sql("COUNT(*) FILTER (WHERE estado = 'MONTADO')", 'Montados'), 3), kpi('Yardas disponibles', sql("SUM(restante_yd) FILTER (WHERE estado IN ('EN_BODEGA','MONTADO'))", 'Yardas'), 3, 'bodega + montados'), kpi('Antigüedad promedio (días)', sql("AVG(antiguedad_dias) FILTER (WHERE estado = 'EN_BODEGA')", 'Días'), 3, 'rollos en bodega', ',.0f')],
      [dona('Rollos por estado', 'estado', sql('COUNT(*)', 'Rollos'), 4), barraCat('Yardas disponibles por tipo de papel', 'tipo_papel', sql("SUM(restante_yd) FILTER (WHERE estado IN ('EN_BODEGA','MONTADO'))", 'Yardas'), 8, 12)],
      [barraCat('Antigüedad del papel en bodega', 'tramo_antiguedad', sql("COUNT(*) FILTER (WHERE estado = 'EN_BODEGA')", 'Rollos'), 6, 10), dona('Rollos en bodega por ubicación', 'ubicacion', sql("COUNT(*) FILTER (WHERE estado = 'EN_BODEGA')", 'Rollos'), 6)],
      [tabla('Rollos en uso ahora', ['impresora_actual', 'rollo', 'tipo_papel'], [sql('MAX(restante_yd)', 'Restante (yd)')], sql('MAX(restante_yd)', 'Restante (yd)'), 12, 20)],
    ],
  },
  {
    clave: 'facturacion', titulo: 'Facturación', vista: 'v_facturacion',
    filtros: [filtroTiempo(), filtroSelect('Cliente', 'v_facturacion', 'cliente'), filtroSelect('Tipo de servicio', 'v_facturacion', 'tipo_servicio')],
    filas: [
      [kpi('Órdenes de facturación', sql('COUNT(*)', 'OF'), 3), kpi('Cerradas', sql('COUNT(*) FILTER (WHERE cerrada_en IS NOT NULL)', 'Cerradas'), 3), kpi('Piezas', SUM('piezas', 'Piezas'), 3), kpi('Yardas de papel', SUM('total_yd', 'Yardas'), 3)],
      [barraTiempo('Órdenes de facturación por mes', [sql('COUNT(*)', 'OF')], 8, { apilar: false }), dona('Por tipo de servicio', 'tipo_servicio', sql('COUNT(*)', 'OF'), 4)],
      [barraCat('Clientes con más yardas facturadas', 'cliente', SUM('total_yd', 'Yardas'), 12)],
      [tabla('Órdenes de facturación', ['codigo_of', 'numero_factura', 'cliente'], [SUM('ordenes', 'Órdenes'), SUM('piezas', 'Piezas'), SUM('total_yd', 'Yardas')], SUM('total_yd', 'Yardas'))],
    ],
  },
  {
    clave: 'costos', titulo: 'Costos por orden', vista: 'v_costo_op',
    filtros: [filtroTiempo(), filtroSelect('Cliente', 'v_costo_op', 'cliente')],
    filas: [
      [kpi('Costo estándar de insumos', SUM('costo_estandar_insumos', 'Insumos (Q)'), 3, 'receta × piezas'), kpi('Costo estándar de mano de obra', SUM('costo_estandar_mano_obra', 'Mano de obra (Q)'), 3, 'minutos × costo por minuto'), kpi('Yardas reales de papel', SUM('total_yd', 'Yardas'), 3), kpi('Costo estándar por yarda', sql('(SUM(costo_estandar_insumos) + SUM(costo_estandar_mano_obra)) / NULLIF(SUM(total_yd), 0)', 'Q/yd'), 3, 'referencia, no costo real', ',.2f')],
      [barraTiempo('Costo estándar por mes', [SUM('costo_estandar_insumos', 'Insumos'), SUM('costo_estandar_mano_obra', 'Mano de obra')], 6, { formato: 'SMART_NUMBER' }), barraCat('Clientes con más costo estándar', 'cliente', sql('SUM(costo_estandar_insumos) + SUM(costo_estandar_mano_obra)', 'Costo (Q)'), 6, 10, 'SMART_NUMBER')],
      [tabla('Órdenes con más costo estándar', ['codigo_op', 'cliente'], [SUM('piezas', 'Piezas'), SUM('total_yd', 'Yardas'), SUM('costo_estandar_insumos', 'Insumos (Q)'), SUM('costo_estandar_mano_obra', 'Mano de obra (Q)')], sql('SUM(costo_estandar_insumos) + SUM(costo_estandar_mano_obra)', 'Costo (Q)'))],
    ],
  },
];

// ── Armado ──────────────────────────────────────────────────────────
function posicion(titulo, filas, idsPorFila) {
  const pos = {
    DASHBOARD_VERSION_KEY: 'v2',
    ROOT_ID: { type: 'ROOT', id: 'ROOT_ID', children: ['GRID_ID'] },
    GRID_ID: { type: 'GRID', id: 'GRID_ID', children: [], parents: ['ROOT_ID'] },
    HEADER_ID: { id: 'HEADER_ID', type: 'HEADER', meta: { text: titulo } },
  };
  filas.forEach((fila, i) => {
    const rid = `ROW-${i + 1}`;
    pos.GRID_ID.children.push(rid);
    pos[rid] = { type: 'ROW', id: rid, children: [], parents: ['ROOT_ID', 'GRID_ID'], meta: { background: 'BACKGROUND_TRANSPARENT' } };
    fila.forEach((g, j) => {
      const cid = `CHART-${i + 1}-${j + 1}`;
      pos[rid].children.push(cid);
      pos[cid] = { type: 'CHART', id: cid, children: [], parents: ['ROOT_ID', 'GRID_ID', rid], meta: { width: g.w, height: g.h, chartId: idsPorFila[i][j], sliceName: g.titulo, sliceNameOverride: g.titulo } };
    });
  });
  return pos;
}

function filtrosNativos(def, chartIds) {
  return def.filtros.map((f, i) => {
    const base = { id: `NATIVE_FILTER-${def.clave}-${i + 1}`, name: f.nombre, type: 'NATIVE_FILTER', description: '', cascadeParentIds: [], scope: { rootPath: ['ROOT_ID'], excluded: [] }, chartsInScope: chartIds, tabsInScope: [], defaultDataMask: { extraFormData: {}, filterState: {}, ownState: {} } };
    if (f.tipo === 'tiempo') return { ...base, filterType: 'filter_time', targets: [{}], controlValues: {} };
    return { ...base, filterType: 'filter_select', targets: [{ datasetId: DS[f.vista], column: { name: f.col } }], controlValues: { multiSelect: true, enableEmptyFilter: false, defaultToFirstItem: false, inverseSelection: false, searchAllOptions: false } };
  });
}

const resultado = {};
for (const def of TABLEROS) {
  const dsId = DS[def.vista];
  if (!dsId) throw new Error(`Falta el dataset ${def.vista}: corré configurar-superset.mjs primero.`);
  let existente = await api(`/api/v1/dashboard/${def.clave}`);
  if (existente.ok && (RECREAR === def.clave || RECREAR === 'todos')) {
    const idViejo = existente.j.result.id;
    const charts = await api(`/api/v1/dashboard/${idViejo}/charts`);
    for (const c of charts.j.result ?? []) await api(`/api/v1/chart/${c.id}`, { m: 'DELETE' });
    await api(`/api/v1/dashboard/${idViejo}`, { m: 'DELETE' });
    existente = { ok: false };
    console.log(`${def.clave}: borrado para recrear`);
  }
  if (existente.ok) {
    console.log(`${def.clave}: ya existe (id ${existente.j.result.id}) — no se toca`);
    resultado[def.clave] = existente.j.result.id;
    continue;
  }
  const dash = await api('/api/v1/dashboard/', { m: 'POST', body: { dashboard_title: def.titulo, slug: def.clave, published: true } });
  if (!dash.ok) throw new Error(`No se pudo crear ${def.clave}: ${JSON.stringify(dash.j)}`);
  const idDash = dash.j.id;
  const idsPorFila = [];
  const todos = [];
  for (const fila of def.filas) {
    const ids = [];
    for (const g of fila) {
      const params = JSON.parse(JSON.stringify(g.params).replace(/"COL_TIEMPO"/g, JSON.stringify(COL_TIEMPO[def.vista])));
      if (g.tiempo) params.granularity_sqla = COL_TIEMPO[def.vista];
      const r = await api('/api/v1/chart/', { m: 'POST', body: { slice_name: `${def.titulo} · ${g.titulo}`, viz_type: g.viz, datasource_id: dsId, datasource_type: 'table', params: JSON.stringify({ viz_type: g.viz, datasource: `${dsId}__table`, ...params }), dashboards: [idDash] } });
      if (!r.ok) throw new Error(`Gráfico "${g.titulo}" (${def.clave}): ${JSON.stringify(r.j)}`);
      ids.push(r.j.id);
      todos.push(r.j.id);
    }
    idsPorFila.push(ids);
  }
  const meta = { native_filter_configuration: filtrosNativos(def, todos), color_scheme: PALETA, refresh_frequency: 0, timed_refresh_immune_slices: [], expanded_slices: {}, label_colors: {}, shared_label_colors: [], map_label_colors: {}, default_filters: '{}', chart_configuration: {}, global_chart_configuration: { scope: { rootPath: ['ROOT_ID'], excluded: [] }, chartsInScope: todos } };
  const up = await api(`/api/v1/dashboard/${idDash}`, { m: 'PUT', body: { position_json: JSON.stringify(posicion(def.titulo, def.filas, idsPorFila)), json_metadata: JSON.stringify(meta) } });
  if (!up.ok) throw new Error(`Diseño de ${def.clave}: ${JSON.stringify(up.j)}`);
  resultado[def.clave] = idDash;
  console.log(`${def.clave}: creado (id ${idDash}, ${todos.length} gráficos, ${def.filtros.length} filtros)`);
}

// ── Incrustación: un UUID por tablero ───────────────────────────────
const uuids = {};
for (const def of TABLEROS) {
  const e = await api(`/api/v1/dashboard/${resultado[def.clave]}/embedded`, { m: 'POST', body: { allowed_domains: [ORIGEN_ERP] } });
  if (!e.ok) throw new Error(`Incrustación de ${def.clave}: ${JSON.stringify(e.j)}`);
  uuids[def.clave] = e.j.result.uuid;
}
console.log('\nBI_TABLEROS=' + JSON.stringify(uuids));

// Opcional: dejar BI_TABLEROS escrito en el .env de la API (reemplaza la línea si existe).
//   --escribir-env apps/api/.env
const iEnv = process.argv.indexOf('--escribir-env');
if (iEnv >= 0) {
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const ruta = process.argv[iEnv + 1];
  const linea = 'BI_TABLEROS=' + JSON.stringify(uuids);
  const actual = existsSync(ruta) ? readFileSync(ruta, 'utf8') : '';
  writeFileSync(ruta, /^BI_TABLEROS=.*$/m.test(actual) ? actual.replace(/^BI_TABLEROS=.*$/m, () => linea) : actual.replace(/\s*$/, '\n') + linea + '\n');
  console.log(`escrito en ${ruta}`);
}
