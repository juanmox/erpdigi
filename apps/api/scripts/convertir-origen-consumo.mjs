/**
 * Convertidor de un solo uso: "OrigenConsumo DIGITEXSA Mig.xlsx" (hoja
 * DatosOrigen, el formato vivo de Google Sheets) → la plantilla de import de
 * Órdenes de Producción del ERP.
 *
 * Se hace por fuera del ERP a propósito: el import de Órdenes ya existe y está
 * probado, así que conviene traducir el archivo y usarlo, en vez de agregarle
 * al ERP un lector para un formato legacy que va a desaparecer.
 *
 *   node convertir-origen-consumo.mjs <archivo-origen> <archivo-salida>
 */
import ExcelJS from 'exceljs';

const ORIGEN = process.argv[2];
const SALIDA = process.argv[3];
if (!ORIGEN || !SALIDA) {
  console.error('uso: node convertir-origen-consumo.mjs <origen.xlsx> <salida.xlsx>');
  process.exit(1);
}

// Orden EXACTO de la plantilla (plantillaImportarLineas), 17 columnas de
// metadata + una por talla.
const TALLAS = ['YXS','YS','YM','YL','YXL','XS','S','M','L','XL','2XL','3XL','4XL'];
const ENCABEZADOS = [
  'OP (ej. 26OP014154)', 'Cliente (código)', 'Línea de producto (nombre, opcional)',
  'Orden de compra', 'Fecha recibido (OP)', 'Fecha compromiso (OP)', 'Código de línea',
  'Producto (código)', 'Desarrollo', 'Impresora (código, opcional)', 'Enguiamiento (yd)',
  'Fecha data', 'Fecha cliente', 'Fecha entregar', 'Estatus', 'Prioridad (opcional)',
  'Imagen (opcional)', ...TALLAS,
];

// Cliente: el ERP resuelve por CÓDIGO, el archivo trae el nombre.
const CLIENTE = { 'BSN SPORTS': '181', 'UNDER ARMOUR': '411' };

/** Celda que puede ser fórmula: ExcelJS guarda {formula, result}. */
function valor(c) {
  const v = c.value;
  if (v && typeof v === 'object' && 'result' in v) return v.result;
  if (v && typeof v === 'object' && 'text' in v) return v.text;
  return v;
}
const texto = (c) => String(valor(c) ?? '').trim();
function fecha(c) {
  const v = valor(c);
  if (v instanceof Date) return v;
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(ORIGEN);
const ws = wb.getWorksheet('DatosOrigen');

const enc = [];
ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (enc[i] = String(c.value ?? '').trim()));
const IDX_TOTAL = enc.findIndex((v) => v === 'TOTAL');
// Las columnas de talla van de la 17 hasta TOTAL (exclusivo).
const colDeTalla = new Map();
for (let c = 17; c < IDX_TOTAL; c++) if (enc[c]) colDeTalla.set(enc[c], c);

const filas = [];
const avisos = { clienteDesconocido: new Set(), tallaFuera: new Map(), sinPiezas: 0 };

for (let r = 2; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const codigoLine = texto(row.getCell(2));
  if (!codigoLine) continue;

  const nombreCliente = texto(row.getCell(12));
  const codCliente = CLIENTE[nombreCliente];
  if (!codCliente) avisos.clienteDesconocido.add(nombreCliente);

  // Cantidades por talla. Las que la plantilla no maneja se reportan en vez de
  // descartarse en silencio.
  const cant = {};
  let piezas = 0;
  for (let c = 17; c < IDX_TOTAL; c++) {
    const n = Number(valor(row.getCell(c)) ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    const nombre = enc[c];
    if (TALLAS.includes(nombre)) {
      cant[nombre] = (cant[nombre] ?? 0) + n;
      piezas += n;
    } else {
      avisos.tallaFuera.set(nombre, (avisos.tallaFuera.get(nombre) ?? 0) + n);
    }
  }
  if (piezas === 0) avisos.sinPiezas++;

  filas.push([
    texto(row.getCell(11)),            // OP
    codCliente ?? '',                  // Cliente (código)
    // Línea de producto VACÍA: en este archivo la columna Cliente ES el cliente
    // (confirmado con el usuario: Under Armour es cliente aparte, no una línea
    // de BSN). Ponerle el nombre del cliente crearía una línea espuria, y como
    // el import exige que exista para ese cliente, rechazaría las 253 filas.
    '',
    texto(row.getCell(9)),             // Orden de compra
    fecha(row.getCell(15)),            // Fecha recibido (OP)
    null,                              // Fecha compromiso (OP) — no existe en el origen
    codigoLine,                        // Código de línea
    texto(row.getCell(13)),            // Producto
    // Desarrollo VACÍO a propósito: el archivo usa otra notación (3082/25) que
    // la base (2500003082) y el import valida que coincidan. El producto ya
    // tiene su desarrollo registrado, que es la fuente autoritativa.
    '',
    texto(row.getCell(6)),             // Impresora
    Number(valor(row.getCell(3)) ?? 0),// Enguiamiento (yd)
    fecha(row.getCell(5)),             // Fecha data
    fecha(row.getCell(235)),           // Fecha cliente
    fecha(row.getCell(236)),           // Entregar
    texto(row.getCell(237)),           // Estatus
    texto(row.getCell(234)),           // Prioridad
    texto(row.getCell(8)),             // Imagen
    ...TALLAS.map((t) => cant[t] ?? ''),
  ]);
}

// --- salida con el mismo preámbulo de 4 filas que espera el import
const out = new ExcelJS.Workbook();
const o = out.addWorksheet('Líneas de producción');
o.mergeCells(1, 1, 1, ENCABEZADOS.length);
o.getCell('A1').value = 'Digital Textil, S.A. (Digitexsa) — Import de Órdenes de Producción';
o.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF203080' } };
o.mergeCells(2, 1, 2, ENCABEZADOS.length);
o.getCell('A2').value = `Convertido desde OrigenConsumo (DatosOrigen) el ${new Date().toISOString().slice(0, 10)}.`;
o.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };
const h = o.getRow(4);
h.values = ENCABEZADOS;
h.font = { bold: true };
filas.forEach((f, i) => (o.getRow(5 + i).values = f));
await out.xlsx.writeFile(SALIDA);

console.log(`filas convertidas: ${filas.length}`);
console.log(`OP distintas: ${new Set(filas.map((f) => f[0])).size}`);
if (avisos.clienteDesconocido.size)
  console.log(`⚠ clientes sin código: ${[...avisos.clienteDesconocido].join(', ')}`);
if (avisos.tallaFuera.size)
  console.log(`⚠ tallas fuera de la plantilla (piezas perdidas): ${[...avisos.tallaFuera].map(([k, v]) => `${k}=${v}`).join(' ')}`);
else console.log('tallas: todas las usadas caben en la plantilla');
if (avisos.sinPiezas) console.log(`⚠ filas sin ninguna cantidad: ${avisos.sinPiezas}`);
console.log(`escrito: ${SALIDA}`);
