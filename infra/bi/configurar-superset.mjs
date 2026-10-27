/**
 * Configura una instalación nueva de Superset para los tableros del ERP:
 *   1. la conexión a la base del ERP con el rol de solo lectura `bi_lector`;
 *   2. un dataset por cada vista del schema `analitica`.
 *
 * Idempotente: lo que ya existe se deja como está, así que se puede correr de
 * nuevo (por ejemplo, después de agregar una vista). Sirve igual en local que en
 * el servidor — solo cambian las variables.
 *
 * Variables (en local salen de infra/bi/.env.local):
 *   SUPERSET_URL             http://localhost:8088
 *   SUPERSET_ADMIN_USER / SUPERSET_ADMIN_PASSWORD
 *   BI_LECTOR_PASSWORD       contraseña del rol bi_lector
 *   BI_DB_HOST / BI_DB_PORT / BI_DB_NAME   cómo llega SUPERSET (no esta máquina) a la base
 *                            local: host.docker.internal / 5433 / digitexsa_erp_dev
 *
 * Uso:  node --env-file=infra/bi/.env.local infra/bi/configurar-superset.mjs
 */
const URL_BASE = (process.env.SUPERSET_URL ?? 'http://localhost:8088').replace(/\/+$/, '');
const USUARIO = process.env.SUPERSET_ADMIN_USER;
const CLAVE = process.env.SUPERSET_ADMIN_PASSWORD;
const CLAVE_BI = process.env.BI_LECTOR_PASSWORD;
const DB_HOST = process.env.BI_DB_HOST ?? 'host.docker.internal';
const DB_PORT = process.env.BI_DB_PORT ?? '5433';
const DB_NAME = process.env.BI_DB_NAME ?? 'digitexsa_erp_dev';
const NOMBRE_CONEXION = 'ERP · analitica';

const VISTAS = [
  'v_consumo',
  'v_reposiciones',
  'v_reposicion_prendas',
  'v_ordenes',
  'v_rollos',
  'v_rollos_costo',
  'v_facturacion',
  'v_facturacion_costo',
  'v_costo_op',
];

if (!USUARIO || !CLAVE || !CLAVE_BI) {
  console.error('Faltan SUPERSET_ADMIN_USER, SUPERSET_ADMIN_PASSWORD o BI_LECTOR_PASSWORD.');
  process.exit(1);
}

async function api(ruta, { metodo = 'GET', cuerpo, bearer, csrf, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (csrf) headers['X-CSRFToken'] = csrf;
  if (cookie) headers.Cookie = cookie;
  headers.Referer = URL_BASE;
  const r = await fetch(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    json = { raw: texto };
  }
  return { ok: r.ok, estado: r.status, json, headers: r.headers };
}

const login = await api('/api/v1/security/login', {
  metodo: 'POST',
  cuerpo: { username: USUARIO, password: CLAVE, provider: 'db', refresh: false },
});
if (!login.ok) throw new Error(`Login en Superset falló (${login.estado}): ${JSON.stringify(login.json)}`);
const bearer = login.json.access_token;

const c = await api('/api/v1/security/csrf_token/', { bearer });
const csrf = c.json.result;
const cookie = c.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
const opc = { bearer, csrf, cookie };

// ── 1. Conexión a la base ───────────────────────────────────────────
const lista = await api('/api/v1/database/?q=' + encodeURIComponent(JSON.stringify({ page_size: 100 })), opc);
let conexion = (lista.json.result ?? []).find((d) => d.database_name === NOMBRE_CONEXION);
if (conexion) {
  console.log(`conexión "${NOMBRE_CONEXION}": ya existe (id ${conexion.id})`);
} else {
  const uri = `postgresql+psycopg2://bi_lector:${encodeURIComponent(CLAVE_BI)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
  const r = await api('/api/v1/database/', {
    ...opc,
    metodo: 'POST',
    cuerpo: {
      database_name: NOMBRE_CONEXION,
      sqlalchemy_uri: uri,
      expose_in_sqllab: true,
      allow_dml: false, // solo lectura también de este lado
      allow_file_upload: false,
      extra: JSON.stringify({ schemas_allowed_for_file_upload: [] }),
    },
  });
  if (!r.ok) throw new Error(`No se pudo crear la conexión (${r.estado}): ${JSON.stringify(r.json)}`);
  conexion = { id: r.json.id };
  console.log(`conexión "${NOMBRE_CONEXION}": creada (id ${conexion.id})`);
}

// ── 2. Un dataset por vista ─────────────────────────────────────────
const ds = await api('/api/v1/dataset/?q=' + encodeURIComponent(JSON.stringify({ page_size: 200 })), opc);
const existentes = new Set((ds.json.result ?? []).filter((d) => d.schema === 'analitica').map((d) => d.table_name));
for (const vista of VISTAS) {
  if (existentes.has(vista)) {
    console.log(`dataset ${vista}: ya existe`);
    continue;
  }
  const r = await api('/api/v1/dataset/', {
    ...opc,
    metodo: 'POST',
    cuerpo: { database: conexion.id, schema: 'analitica', table_name: vista },
  });
  console.log(r.ok ? `dataset ${vista}: creado (id ${r.json.id})` : `dataset ${vista}: FALLÓ ${r.estado} ${JSON.stringify(r.json)}`);
}
