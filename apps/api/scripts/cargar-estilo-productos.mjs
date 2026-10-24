/**
 * Carga el ESTILO (tipo de prenda: Jersey, Short, T-Shirt…) de cada producto
 * desde el libro "Recetas" del Google Sheets legacy, columna LINEA — que en el
 * legacy es lo que el ERP llama Estilo desde el 2026-10-23.
 *
 * Qué escribe, y nada más que eso:
 *   `recetas.productos.id_estilo`, SOLO donde está vacío.
 *
 * ⚠️ No crea estilos: el catálogo ya los trae (`recetas.estilos`). Un valor del
 * archivo que no esté ahí se REPORTA y esa fila se salta — así un typo del
 * Excel no inventa un estilo nuevo en silencio. Darlo de alta es una decisión
 * (Gestión de datos → Productos → Catálogos de producto).
 *
 * ⚠️ No pisa: si el producto ya tiene OTRO estilo, se reporta como conflicto y
 * se deja como está. Quien lo cargó a mano a propósito no pierde su dato.
 *
 * ⚠️ El producto se resuelve por DESARROLLO y no por código, igual que en
 * `catalogos-deporte-linea.mjs`: el desarrollo es la llave 1:1 autoritativa
 * (FK real desde 2026-08-31) y los códigos del archivo traen el truncamiento
 * conocido de los paréntesis.
 *
 * ⚠️ NO toca `costeo.orden_produccion.id_estilo`: es histórico y se conserva
 * tal cual.
 *
 * Uso:
 *   node --env-file=.env scripts/cargar-estilo-productos.mjs <archivo.xlsx> [--hoja "Recetas nuevas"] [--dry-run]
 *
 * `--dry-run` hace las escrituras de verdad dentro de una transacción y después
 * la revierte: informa exactamente lo que va a pasar, sin dejar nada.
 *
 * Sin `--hoja` se elige sola: la hoja con más filas que tenga las columnas
 * Desarrollo y LINEA en la primera fila (el libro trae "Recetas" y "Recetas
 * nuevas", y la segunda es la vigente).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// El .env vive en apps/api; resolverlo contra el propio script permite correr
// esto desde cualquier directorio.
const aqui = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) process.loadEnvFile(path.join(aqui, '..', '.env'));

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const iHoja = args.indexOf('--hoja');
const hojaPedida = iHoja >= 0 ? args[iHoja + 1] : null;
// El valor de --hoja no es el archivo.
const archivo = args.find((a, i) => !a.startsWith('--') && i !== (iHoja >= 0 ? iHoja + 1 : -1));
if (!archivo) {
  console.error('Uso: node scripts/cargar-estilo-productos.mjs <archivo.xlsx> [--hoja "nombre"] [--dry-run]');
  process.exit(1);
}

const texto = (v) =>
  v == null ? '' : String(typeof v === 'object' && v.text != null ? v.text : (v.result ?? v)).trim();
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Columnas de la primera fila por nombre → índice (1-based). */
function columnas(ws) {
  const m = new Map();
  ws.getRow(1).eachCell((c, i) => m.set(norm(texto(c.value)), i));
  return m;
}

function elegirHoja(wb) {
  if (hojaPedida) {
    const ws = wb.getWorksheet(hojaPedida);
    if (!ws) throw new Error(`No existe la hoja "${hojaPedida}". Hojas: ${wb.worksheets.map((w) => w.name).join(', ')}`);
    return ws;
  }
  const candidatas = wb.worksheets.filter((w) => {
    const c = columnas(w);
    return c.has('desarrollo') && c.has('linea');
  });
  if (candidatas.length === 0)
    throw new Error('Ninguna hoja tiene las columnas Desarrollo y LINEA en la primera fila.');
  return candidatas.sort((a, b) => b.rowCount - a.rowCount)[0];
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = elegirHoja(wb);
  const col = columnas(ws);

  const filas = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const g = (nombre) => texto(ws.getRow(r).getCell(col.get(nombre)).value);
    const f = { fila: r, desarrollo: g('desarrollo'), estilo: g('linea') };
    if (f.desarrollo) filas.push(f);
  }
  console.log('Archivo: %s', path.basename(archivo));
  console.log('  hoja "%s" · %s filas con desarrollo\n', ws.name, filas.length);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const [productos, estilos] = await Promise.all([
      prisma.producto.findMany({
        select: { idProducto: true, codigo: true, desarrollo: true, idEstilo: true },
      }),
      prisma.estilo.findMany(),
    ]);
    const productoPorDesarrollo = new Map(productos.map((p) => [p.desarrollo.trim().toLowerCase(), p]));
    const estiloPorNombre = new Map(estilos.map((e) => [e.nombre.toLowerCase(), e]));
    const nombreDeEstilo = new Map(estilos.map((e) => [e.idEstilo, e.nombre]));

    const asignar = new Map(); // idProducto -> { codigo, idEstilo }
    const conflictos = [];
    const desconocidos = new Map(); // nombre -> cantidad
    const repetidos = [];
    let sinEstilo = 0, sinProducto = 0, yaEstaban = 0;
    for (const f of filas) {
      if (!f.estilo) { sinEstilo++; continue; }
      const p = productoPorDesarrollo.get(f.desarrollo.toLowerCase());
      if (!p) { sinProducto++; continue; }
      const e = estiloPorNombre.get(f.estilo.toLowerCase());
      if (!e) { desconocidos.set(f.estilo, (desconocidos.get(f.estilo) ?? 0) + 1); continue; }
      if (p.idEstilo === e.idEstilo) { yaEstaban++; continue; }
      if (p.idEstilo != null) {
        conflictos.push(`${p.codigo}: tiene ${nombreDeEstilo.get(p.idEstilo)}, el archivo dice ${e.nombre}`);
        continue;
      }
      const previo = asignar.get(p.idProducto);
      if (previo && previo.idEstilo !== e.idEstilo) {
        repetidos.push(`${p.codigo}: el archivo lo trae dos veces con estilos distintos`);
        continue;
      }
      asignar.set(p.idProducto, { codigo: p.codigo, idEstilo: e.idEstilo });
    }

    console.log('Resolución');
    console.log('  filas sin estilo en el archivo          : %s', sinEstilo);
    console.log('  filas cuyo desarrollo no existe acá     : %s (productos que todavía no se dieron de alta)', sinProducto);
    console.log('  filas con un estilo que no está en el catálogo : %s', [...desconocidos.values()].reduce((a, b) => a + b, 0));
    for (const [n, c] of desconocidos) console.log('      "%s" × %s', n, c);
    console.log('  productos que ya tenían ese estilo      : %s', yaEstaban);
    console.log('  conflictos (ya tienen OTRO, no se pisan): %s', conflictos.length);
    for (const c of conflictos.slice(0, 15)) console.log('      %s', c);
    if (repetidos.length) {
      console.log('  repetidos contradictorios               : %s', repetidos.length);
      for (const c of repetidos.slice(0, 15)) console.log('      %s', c);
    }
    console.log('  productos a los que se les va a asignar : %s\n', asignar.size);

    const porEstilo = new Map();
    for (const a of asignar.values()) {
      const n = nombreDeEstilo.get(a.idEstilo);
      porEstilo.set(n, (porEstilo.get(n) ?? 0) + 1);
    }
    console.log('Por estilo:');
    for (const [n, c] of [...porEstilo].sort((a, b) => b[1] - a[1])) console.log('  %s : %s', n.padEnd(12), c);

    const resultado = await prisma.$transaction(async (tx) => {
      let escritos = 0;
      for (const [idProducto, a] of asignar) {
        // `idEstilo: null` en el where: la guarda real contra pisar algo que
        // alguien cargó mientras corría este script.
        const r = await tx.producto.updateMany({
          where: { idProducto, idEstilo: null },
          data: { idEstilo: a.idEstilo },
        });
        escritos += r.count;
      }
      if (!dryRun && escritos > 0)
        await tx.auditoria.create({
          data: {
            usuarioNombre: 'script cargar-estilo-productos',
            entidad: 'recetas.productos',
            idEntidad: 'carga-estilo',
            accion: 'UPDATE',
            datosNuevos: { archivo: path.basename(archivo), hoja: ws.name, productosConEstilo: escritos },
          },
        });
      if (dryRun) throw Object.assign(new Error('__dry_run__'), { escritos });
      return { escritos };
    }, { timeout: 120_000 });
    console.log('\nEscritos: %s productos.', resultado.escritos);
  } catch (e) {
    if (e?.message === '__dry_run__') {
      console.log('\n--- DRY RUN: se hubieran escrito %s productos; la transacción se revirtió, no se escribió nada ---', e.escritos);
    } else throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
