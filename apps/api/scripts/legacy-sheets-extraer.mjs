/**
 * Paso 1 de la migración del legacy: lee los dos libros de Google Sheets
 * exportados a .xlsx y produce TSV normalizado para `legacy-sheets-cargar.mjs`.
 *
 * Va en dos pasos porque los .xlsx viven en la máquina del usuario y la base de
 * producción solo escucha en localhost del servidor — mismo patrón que se usó
 * con los arm sleeves y con el logo por empresa.
 *
 *   node scripts/legacy-sheets-extraer.mjs \
 *        --origen "C:\...\Migracion DATA GoogleSheets" \
 *        --salida ./tmp-migracion \
 *        --desde 2026-09-01 --hasta 2026-10-11
 *
 * NO toca ninguna base de datos. Solo lee los .xlsx y escribe TSV.
 *
 * Decisiones de negocio que aplica (ver docs/03-MIGRACION-LEGACY-SHEETS.md):
 *  - Las reposiciones salen SOLO de `Registro` (es el único con defecto, tela y
 *    comentario). De `Datos` se toman SOLO las filas sin `REPO`, porque ese libro
 *    ya trae las reposiciones espejadas y contarlas dos veces duplicaría el papel.
 *  - D2: `PAPEL DIGITAL PROTECT 100 GSM 64"` es el mismo papel que
 *    `DIGITAL PROTECT 100`.
 */
import ExcelJS from 'exceljs';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// ─────────────────────────── argumentos ───────────────────────────
function arg(nombre, obligatorio = true) {
  const i = process.argv.indexOf('--' + nombre);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (obligatorio && !v) {
    console.error(`Falta --${nombre}`);
    process.exit(1);
  }
  return v;
}

const ORIGEN = arg('origen');
const SALIDA = arg('salida');
const DESDE = arg('desde');
const HASTA = arg('hasta');

const DIA = /^\d{4}-\d{2}-\d{2}$/;
if (!DIA.test(DESDE) || !DIA.test(HASTA)) {
  console.error('--desde y --hasta deben ser aaaa-mm-dd');
  process.exit(1);
}

const ARCHIVO_REPOS = 'DataREPOSMig hasta121026.xlsx';
const ARCHIVO_CONSUMOS = 'ConsumosFinal DIGITEXSAMig hasta121026.xlsx';

/**
 * Columna P de `ConsumosFinal`: filas que el usuario marcó para excluir.
 *
 * Se lee **por posición y no por encabezado** porque la hoja tiene encabezado
 * solo hasta la O (`NRollo`) — la P es una columna libre que se usó para marcar.
 * Cualquier contenido en esa celda excluye la fila; el usuario usó `*`.
 *
 * Estas filas ya se quitaron del Google Sheet vivo, pero esta copia descargada
 * todavía las trae. Si una descarga futura viene sin marcas, acá no se excluye
 * nada y el script se comporta igual que antes.
 */
const COL_MARCA_EXCLUIR = 16;

// ─────────────────────────── normalizaciones ───────────────────────────

/**
 * ⚠️ Guatemala es UTC-6 fijo y SIN horario de verano. Las horas del legacy son
 * locales; si se guardaran como UTC todo se correría 6 horas y los cortes por
 * día quedarían mal — es el mismo bug que rompió el reporte de consumo (ver
 * `common/dia-guatemala.ts`). ExcelJS devuelve la fecha del Excel con sus
 * componentes en UTC, así que se re-sellan tal cual con el desfase de Guatemala.
 */
function instanteGT(v) {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) return null;
  const p = (n, a = 2) => String(n).padStart(a, '0');
  return (
    `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}` +
    `T${p(v.getUTCHours())}:${p(v.getUTCMinutes())}:${p(v.getUTCSeconds())}` +
    `.${p(v.getUTCMilliseconds(), 3)}-06:00`
  );
}

/** El día calendario (aaaa-mm-dd) tal como lo escribió el operario. */
function diaDe(v) {
  const iso = instanteGT(v);
  return iso ? iso.slice(0, 10) : null;
}

function txt(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    // ExcelJS devuelve {richText:[...]} o {text, hyperlink} en algunas celdas.
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if (typeof v.text === 'string') return v.text.trim();
    if (typeof v.result !== 'undefined') return String(v.result).trim();
  }
  return String(v).trim();
}

function num(v) {
  const s = txt(v).replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * ⚠️ El 37% de los LINE vienen como `7013272651.0`: artefacto de Excel al pasar
 * un número a texto. Sin quitarlo se crearían dos líneas distintas para el mismo
 * código (`7013272651` y `7013272651.0`).
 */
function limpiarLine(v) {
  return txt(v).replace(/\.0$/, '');
}

/** `MS3` y `MS5` del legacy son `MS 3` y `MS 5`; les falta el espacio. */
function normalizarImpresora(v) {
  const s = txt(v);
  const m = /^(MS|MP|MK)\s*(\d+)$/i.exec(s);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : s;
}

/**
 * D2: el legacy escribe el mismo papel con dos nombres. El de la derecha es el
 * que usa el catálogo del ERP.
 */
const PAPEL_LEGACY = new Map([
  ['PAPEL DIGITAL PROTECT 100 GSM 64"', 'DIGITAL PROTECT 100'],
]);
function normalizarPapel(v) {
  const s = txt(v);
  return PAPEL_LEGACY.get(s) ?? s;
}

/**
 * La TELA viene como `174026 _ INTERLOK POLY 140 GM...` o `BSNUA-1004_Interlock...`.
 * Devuelve {codigo, descripcion}; el código es lo único resoluble contra insumos.
 */
function partirTela(v) {
  const s = txt(v);
  if (!s) return { codigo: '', descripcion: '' };
  const m = /^([A-Za-z0-9-]+)\s*[_-]\s*(.*)$/.exec(s);
  return m
    ? { codigo: m[1].trim(), descripcion: m[2].trim() }
    : { codigo: '', descripcion: s };
}

/** `R01` → 1. El ERP guarda el número, no el texto. */
function numeroRepo(v) {
  const m = /(\d+)/.exec(txt(v));
  return m ? Number(m[1]) : null;
}

/** El código de OP que el ERP puede representar: `26OP012345`. */
const COD_OP = /^(\d{2})OP(\d{6})$/;

// ─────────────────────────── escritura de TSV ───────────────────────────
function abrirTsv(ruta, columnas) {
  const fh = createWriteStream(ruta, { encoding: 'utf8' });
  fh.write(columnas.join('\t') + '\n');
  let filas = 0;
  return {
    escribir(obj) {
      fh.write(columnas.map((c) => String(obj[c] ?? '').replace(/[\t\r\n]/g, ' ')).join('\t') + '\n');
      filas += 1;
    },
    get filas() {
      return filas;
    },
    cerrar() {
      return new Promise((res) => fh.end(res));
    },
  };
}

// ─────────────────────────── lectura en streaming ───────────────────────────
/**
 * El libro de consumos pesa 34 MB y 452,107 filas, así que se lee en streaming:
 * cargarlo entero en memoria no hace falta y es frágil.
 */
async function* filasDe(ruta, hojaBuscada) {
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(ruta, {
    sharedStrings: 'cache',
    worksheets: 'emit',
    entries: 'emit',
    styles: 'cache',
  });
  for await (const hoja of wb) {
    if (hoja.name !== hojaBuscada) {
      // Hay que drenar la hoja igual, o el stream se traba.
      for await (const _ of hoja) { /* descartar */ }
      continue;
    }
    for await (const fila of hoja) yield fila;
  }
}

function indicePorEncabezado(fila) {
  const idx = new Map();
  fila.eachCell({ includeEmpty: true }, (celda, n) => {
    const h = txt(celda.value);
    if (h) idx.set(h, n);
  });
  return idx;
}

const val = (fila, idx, col) => (idx.has(col) ? fila.getCell(idx.get(col)).value : null);

// ─────────────────────────── proceso ───────────────────────────
await mkdir(SALIDA, { recursive: true });

const COLS_CONSUMO = [
  'fecha', 'op', 'line', 'item', 'talla', 'cantidad',
  'enguiamiento_yd', 'consumo_yd', 'impresora', 'tipo_papel', 'nrollo', 'cliente',
];
const COLS_REPO = [
  'fecha', 'op', 'numero_repo_legacy', 'departamento', 'defecto', 'yardas_papel',
  'tipo_papel', 'tela_codigo', 'tela_descripcion', 'yardas_tela', 'cliente',
  'impresora', 'calandra', 'nrollo', 'comentario',
];
const COLS_DESCARTE = ['origen_archivo', 'motivo', 'fecha', 'op', 'detalle'];

const tsvConsumos = abrirTsv(path.join(SALIDA, 'consumos.tsv'), COLS_CONSUMO);
const tsvRepos = abrirTsv(path.join(SALIDA, 'reposiciones.tsv'), COLS_REPO);
const tsvDescartes = abrirTsv(path.join(SALIDA, 'descartes.tsv'), COLS_DESCARTE);

const resumen = {
  consumos: { leidas: 0, enVentana: 0, espejadas: 0, excluidas: 0, escritas: 0, descartadas: 0, yardas: 0 },
  repos: { leidas: 0, enVentana: 0, escritas: 0, descartadas: 0, papel: 0, tela: 0 },
};

// ── consumos de producción ──
{
  let idx = null;
  for await (const fila of filasDe(path.join(ORIGEN, ARCHIVO_CONSUMOS), 'Datos')) {
    if (!idx) {
      idx = indicePorEncabezado(fila);
      continue;
    }
    resumen.consumos.leidas += 1;
    const fecha = val(fila, idx, 'FECHA');
    const dia = diaDe(fecha);
    if (!dia || dia < DESDE || dia > HASTA) continue;
    resumen.consumos.enVentana += 1;

    // Marcadas a mano para excluir (ver COL_MARCA_EXCLUIR). Va antes que todo lo
    // demás: una fila marcada no entra, sea del tipo que sea. Queda registrada
    // en descartes.tsv para que la exclusión sea auditable y no silenciosa.
    if (txt(fila.getCell(COL_MARCA_EXCLUIR).value)) {
      resumen.consumos.excluidas += 1;
      tsvDescartes.escribir({
        origen_archivo: 'ConsumosFinal',
        motivo: 'marcada para excluir en la columna P',
        fecha: dia,
        op: txt(val(fila, idx, 'OP')),
        detalle: `LINE=${txt(val(fila, idx, 'LINE'))} ITEM=${txt(val(fila, idx, 'ITEM'))} TALLA=${txt(val(fila, idx, 'TALLA'))} CONSUMO=${txt(val(fila, idx, 'CONSUMO YDS'))}`,
      });
      continue;
    }

    // Las filas con REPO son reposiciones espejadas: su detalle sale de
    // `Registro`, y tomarlas acá duplicaría el papel.
    if (txt(val(fila, idx, 'REPO'))) {
      resumen.consumos.espejadas += 1;
      continue;
    }

    const op = txt(val(fila, idx, 'OP'));
    const descarta = (motivo, detalle) => {
      resumen.consumos.descartadas += 1;
      tsvDescartes.escribir({ origen_archivo: 'ConsumosFinal', motivo, fecha: dia, op, detalle });
    };

    if (!COD_OP.test(op)) {
      descarta('OP con formato que el ERP no puede representar', `OP="${op}"`);
      continue;
    }
    const consumo = num(val(fila, idx, 'CONSUMO YDS'));
    if (consumo == null || consumo < 0) {
      descarta('CONSUMO YDS vacío o negativo', `valor="${txt(val(fila, idx, 'CONSUMO YDS'))}"`);
      continue;
    }
    const line = limpiarLine(val(fila, idx, 'LINE'));
    const item = txt(val(fila, idx, 'ITEM'));
    if (!item) {
      descarta('sin ITEM (no se puede resolver el producto de la línea)', `LINE="${line}"`);
      continue;
    }

    tsvConsumos.escribir({
      fecha: instanteGT(fecha),
      op,
      line,
      item,
      talla: txt(val(fila, idx, 'TALLA')),
      cantidad: num(val(fila, idx, 'CANT')) ?? '',
      enguiamiento_yd: num(val(fila, idx, 'ENGUIAMIENTO')) ?? 0,
      consumo_yd: consumo,
      impresora: normalizarImpresora(val(fila, idx, 'IMPRESORA')),
      tipo_papel: normalizarPapel(val(fila, idx, 'TIPO DE PAPEL')),
      nrollo: txt(val(fila, idx, 'NRollo')),
      cliente: txt(val(fila, idx, 'CLIENTE')),
    });
    resumen.consumos.escritas += 1;
    resumen.consumos.yardas += consumo;
  }
}

// ── reposiciones ──
{
  let idx = null;
  for await (const fila of filasDe(path.join(ORIGEN, ARCHIVO_REPOS), 'Registro')) {
    if (!idx) {
      idx = indicePorEncabezado(fila);
      continue;
    }
    resumen.repos.leidas += 1;
    const fecha = val(fila, idx, 'FECHA');
    const dia = diaDe(fecha);
    if (!dia || dia < DESDE || dia > HASTA) continue;
    resumen.repos.enVentana += 1;

    const op = txt(val(fila, idx, 'ORDEN'));
    const descarta = (motivo, detalle) => {
      resumen.repos.descartadas += 1;
      tsvDescartes.escribir({ origen_archivo: 'DataREPOS', motivo, fecha: dia, op, detalle });
    };

    if (!COD_OP.test(op)) {
      descarta('OP con formato que el ERP no puede representar', `ORDEN="${op}"`);
      continue;
    }
    const nrepo = numeroRepo(val(fila, idx, 'No. REPO'));
    if (nrepo == null) {
      descarta('No. REPO ilegible', `valor="${txt(val(fila, idx, 'No. REPO'))}"`);
      continue;
    }
    const depto = txt(val(fila, idx, 'DEPARTAMENTO'));
    const defecto = txt(val(fila, idx, 'DEFECTO'));
    if (!depto || !defecto) {
      // id_departamento e id_defecto son NOT NULL en el ERP.
      descarta('sin departamento o sin defecto', `depto="${depto}" defecto="${defecto}"`);
      continue;
    }
    const tela = partirTela(val(fila, idx, 'TELA'));
    const papel = num(val(fila, idx, 'YARDAS PAPEL')) ?? 0;
    const telaYd = num(val(fila, idx, 'YARDAS TELA')) ?? 0;

    tsvRepos.escribir({
      fecha: instanteGT(fecha),
      op,
      numero_repo_legacy: nrepo,
      departamento: depto,
      defecto,
      yardas_papel: papel < 0 ? 0 : papel,
      tipo_papel: normalizarPapel(val(fila, idx, 'TIPO PAPEL')),
      tela_codigo: tela.codigo,
      tela_descripcion: tela.descripcion,
      yardas_tela: telaYd < 0 ? 0 : telaYd,
      cliente: txt(val(fila, idx, 'CLIENTE')),
      impresora: normalizarImpresora(val(fila, idx, 'EQUIPO')),
      calandra: txt(val(fila, idx, 'CALANDRA')),
      nrollo: txt(val(fila, idx, 'NRollo')),
      comentario: txt(val(fila, idx, 'Comentario')),
    });
    resumen.repos.escritas += 1;
    resumen.repos.papel += papel > 0 ? papel : 0;
    resumen.repos.tela += telaYd > 0 ? telaYd : 0;
  }
}

await Promise.all([tsvConsumos.cerrar(), tsvRepos.cerrar(), tsvDescartes.cerrar()]);

const f = (n) => n.toLocaleString('es-GT');
const y = (n) => n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log('');
console.log('VENTANA: %s .. %s', DESDE, HASTA);
console.log('');
console.log('ConsumosFinal / Datos');
console.log('   filas leídas            %s', f(resumen.consumos.leidas));
console.log('   en la ventana           %s', f(resumen.consumos.enVentana));
console.log('   reposiciones espejadas  %s  (se ignoran: su detalle sale de Registro)', f(resumen.consumos.espejadas));
console.log('   excluidas a mano        %s  (marcadas en la columna P)', f(resumen.consumos.excluidas));
console.log('   descartadas             %s', f(resumen.consumos.descartadas));
console.log('   -> consumos.tsv         %s filas · %s yd', f(resumen.consumos.escritas), y(resumen.consumos.yardas));
console.log('');
console.log('DataREPOSMig / Registro');
console.log('   filas leídas            %s', f(resumen.repos.leidas));
console.log('   en la ventana           %s', f(resumen.repos.enVentana));
console.log('   descartadas             %s', f(resumen.repos.descartadas));
console.log('   -> reposiciones.tsv     %s filas · papel %s yd · tela %s yd',
  f(resumen.repos.escritas), y(resumen.repos.papel), y(resumen.repos.tela));
console.log('');
console.log('   -> descartes.tsv        %s filas', f(tsvDescartes.filas));
console.log('');
console.log('Archivos en %s', SALIDA);
