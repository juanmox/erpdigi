/**
 * ⚠️ ARCHIVADO (2026-10-23). Corrió una sola vez, el 2026-10-15. Desde que el
 * catálogo `costeo.linea_producto` pasó a `recetas.estilos` y la línea de la OP
 * dejó de capturarse, la parte 2 ya no corre (`tx.lineaProducto` no existe).
 * El Estilo del producto se carga con `cargar-estilo-productos.mjs`.
 *
 * Carga DEPORTE y LINEA desde el libro "Recetas" del Google Sheets legacy
 * hacia los CATÁLOGOS del ERP. Pedido del usuario (2026-10-15):
 *
 *   "subir estos valores solo a los catálogos y no a todos los registros
 *    históricos, para que los cambios surjan de aquí en adelante."
 *
 * Qué escribe, y nada más que eso:
 *   1. `recetas.deportes`          — los deportes que falten.
 *   2. `costeo.linea_producto`     — las líneas (tipos de prenda) que falten.
 *   3. `recetas.productos.deporte` — el deporte de cada producto.
 *
 * ⚠️ NO toca `costeo.orden_produccion.id_linea_producto`: las 6,675 OP ya
 * cargadas se quedan como están. Cargar el catálogo es lo que hace que el
 * import de Órdenes pueda resolver una línea de aquí en adelante.
 *
 * ⚠️ El producto se resuelve por DESARROLLO y no por código. El desarrollo es
 * la llave 1:1 autoritativa (FK real desde 2026-08-31) y los códigos del
 * archivo traen el truncamiento conocido de los paréntesis
 * (`LACRS-YY (1058` por `LACRS-YY (1058)`). Medido sobre este archivo:
 * resolver por código deja 2 productos con deporte contradictorio; resolver
 * por desarrollo deja CERO.
 *
 * Uso:
 *   node --env-file=.env scripts/catalogos-deporte-linea.mjs <archivo.xlsx> [--dry-run]
 *
 * `--dry-run` hace las escrituras de verdad dentro de una transacción y
 * después la revierte: informa exactamente lo que va a pasar, sin dejar nada.
 * ⚠️ Con una excepción: en Postgres las secuencias NO son transaccionales, así
 * que el `setval` del paso 0 sobrevive al rollback. Es inocuo —solo adelanta
 * una secuencia hasta el máximo id que ya existe, que es una reparación— pero
 * por eso una segunda corrida en seco ya no lo reporta.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// El .env vive en apps/api; resolverlo contra el propio script permite correr
// esto desde cualquier directorio (tropiezo real con cargar-logo-empresa.mjs).
const aqui = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) process.loadEnvFile(path.join(aqui, '..', '.env'));

const archivo = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!archivo) {
  console.error('Uso: node scripts/catalogos-deporte-linea.mjs <archivo.xlsx> [--dry-run]');
  process.exit(1);
}

/** `T-SHIRT` -> `T-Shirt`, `FOOTBALL_ELITE` -> `Football_Elite`. */
const titulo = (s) =>
  s
    .toLowerCase()
    .replace(/(^|[\s\-_/])([a-záéíóúñ])/g, (_, sep, c) => sep + c.toUpperCase())
    .trim();

const texto = (v) =>
  v == null ? '' : String(typeof v === 'object' && v.text != null ? v.text : v).trim();

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[0];

  const filas = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const g = (c) => texto(ws.getRow(r).getCell(c).value);
    const f = { desarrollo: g(1), producto: g(5), deporte: g(8), linea: g(9) };
    if (f.desarrollo || f.producto) filas.push(f);
  }
  console.log('Archivo: %s', path.basename(archivo));
  console.log('  hoja "%s" · %s filas de datos\n', ws.name, filas.length);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const productos = await prisma.producto.findMany({
      select: { idProducto: true, codigo: true, desarrollo: true, deporte: true },
    });
    const porDesarrollo = new Map(productos.map((p) => [p.desarrollo, p]));
    const porCodigo = new Map(productos.map((p) => [p.codigo, p]));

    // --- resolver cada fila a un producto de la base ---
    const destino = new Map(); // idProducto -> {codigo, deporte, linea, actual}
    let sinMatch = 0;
    for (const f of filas) {
      const p = porDesarrollo.get(f.desarrollo) ?? porCodigo.get(f.producto);
      if (!p) { sinMatch++; continue; }
      if (!destino.has(p.idProducto))
        destino.set(p.idProducto, {
          codigo: p.codigo,
          actual: p.deporte,
          deporte: f.deporte ? titulo(f.deporte) : null,
          linea: f.linea ? titulo(f.linea) : null,
        });
    }
    console.log('Resolución de productos');
    console.log('  productos de la base cubiertos : %s de %s', destino.size, productos.length);
    console.log('  filas del archivo sin match    : %s (productos que todavía no existen acá)\n', sinMatch);

    const deportes = [...new Set([...destino.values()].map((d) => d.deporte).filter(Boolean))].sort();
    const lineas = [...new Set([...destino.values()].map((d) => d.linea).filter(Boolean))].sort();

    const resumen = await prisma.$transaction(async (tx) => {
      // --- 0. secuencias ---
      // `recetas.deportes` y `recetas.tallas` vienen introspectadas del legacy,
      // donde las filas se insertaron con id explícito, así que su secuencia
      // quedó atrás del máximo. Medido en local: max(id_deporte)=9 con la
      // secuencia en 2 — o sea que un alta de deporte fallaba con P2002 por
      // CUALQUIER vía. Nunca se notó porque la API no expone crear deportes.
      // Solo se adelanta si está atrasada; nunca se retrocede.
      const seqs = await tx.$queryRaw`
        SELECT 'recetas.deportes_id_deporte_seq' AS seq,
               (SELECT coalesce(max(id_deporte), 0) FROM recetas.deportes) AS maxid,
               (SELECT last_value FROM recetas.deportes_id_deporte_seq) AS val
        UNION ALL
        SELECT 'costeo.linea_producto_id_linea_producto_seq',
               (SELECT coalesce(max(id_linea_producto), 0) FROM costeo.linea_producto),
               (SELECT last_value FROM costeo.linea_producto_id_linea_producto_seq)`;
      const secuencias = [];
      for (const s of seqs) {
        const maxid = Number(s.maxid), val = Number(s.val);
        if (val >= maxid) continue;
        await tx.$executeRawUnsafe(`SELECT setval('${s.seq}', ${maxid}, true)`);
        secuencias.push(`${s.seq}: ${val} → ${maxid}`);
      }

      // --- 1. catálogo de deportes ---
      const yaDep = await tx.deporte.findMany({ select: { nombre: true } });
      const setDep = new Set(yaDep.map((d) => d.nombre.toLowerCase()));
      const nuevosDep = deportes.filter((d) => !setDep.has(d.toLowerCase()));
      if (nuevosDep.length)
        await tx.deporte.createMany({ data: nuevosDep.map((nombre) => ({ nombre })) });

      // --- 2. catálogo de líneas de producto ---
      const yaLin = await tx.lineaProducto.findMany({ select: { nombre: true } });
      const setLin = new Set(yaLin.map((l) => l.nombre.toLowerCase()));
      const nuevasLin = lineas.filter((l) => !setLin.has(l.toLowerCase()));
      if (nuevasLin.length)
        await tx.lineaProducto.createMany({ data: nuevasLin.map((nombre) => ({ nombre })) });

      // --- 3. deporte de cada producto ---
      // Se escribe el nombre canónico del catálogo para que el filtro de la
      // pantalla de Productos y `deporteEsValido()` vean exactamente lo mismo.
      const canon = new Map(
        [...yaDep.map((d) => d.nombre), ...nuevosDep].map((n) => [n.toLowerCase(), n]),
      );
      let asignados = 0, yaEstaban = 0, cambiados = 0;
      for (const [idProducto, d] of destino) {
        if (!d.deporte) continue;
        const nombre = canon.get(d.deporte.toLowerCase()) ?? d.deporte;
        if (d.actual === nombre) { yaEstaban++; continue; }
        if (d.actual) cambiados++; else asignados++;
        await tx.producto.update({ where: { idProducto }, data: { deporte: nombre } });
      }

      const r = { secuencias, nuevosDep, nuevasLin, asignados, yaEstaban, cambiados };
      if (dryRun) throw Object.assign(new Error('__dry_run__'), { resumen: r });
      return r;
    }, { timeout: 120_000 });

    informar(resumen);
  } catch (e) {
    if (e?.message === '__dry_run__') {
      informar(e.resumen);
      console.log('\n--- DRY RUN: la transacción se revirtió, no se escribió nada ---');
    } else throw e;
  } finally {
    await prisma.$disconnect();
  }
}

function informar(r) {
  if (r.secuencias.length) {
    console.log('0. Secuencias corregidas (estaban atrás del máximo id)');
    for (const x of r.secuencias) console.log('   %s', x);
    console.log('');
  }
  console.log('1. Catálogo recetas.deportes');
  console.log('   deportes nuevos: %s%s', r.nuevosDep.length, r.nuevosDep.length ? ' → ' + r.nuevosDep.join(', ') : '');
  console.log('\n2. Catálogo costeo.linea_producto');
  console.log('   líneas nuevas: %s%s', r.nuevasLin.length, r.nuevasLin.length ? ' → ' + r.nuevasLin.join(', ') : '');
  console.log('\n3. recetas.productos.deporte');
  console.log('   asignados (estaban vacíos) : %s', r.asignados);
  console.log('   cambiados (tenían otro)    : %s', r.cambiados);
  console.log('   ya estaban correctos       : %s', r.yaEstaban);
  console.log('\n   costeo.orden_produccion NO se tocó (las OP históricas quedan como están).');
}

main().catch((e) => { console.error(e); process.exit(1); });
