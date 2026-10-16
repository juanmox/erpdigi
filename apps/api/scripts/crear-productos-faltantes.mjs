/**
 * Crea en la base los productos del libro "Recetas" del Sheets legacy que
 * todavía no existen, junto con su desarrollo.
 *
 * Nace de un problema concreto: el import de Órdenes rechaza la fila si el
 * producto no está dado de alta, y eso ya frenó cargas reales (los arm sleeves
 * el 2026-09-30, `SBRDCS6` el 2026-10-15). Darlos de alta por anticipado evita
 * que el operario se trabe.
 *
 * ⚠️ Revierte a conciencia la decisión de F0 ("no dar de alta productos
 * masivamente, conforme se vaya necesitando"). El usuario lo pidió explícito el
 * 2026-10-16, con esa razón.
 *
 * Qué escribe por cada producto faltante:
 *   1. `recetas.desarrollos` — APROBADO, porque un producto exige un desarrollo
 *      aprobado desde el refactor del 2026-08-26. Se aprueba acá y no por la
 *      API porque `aprobar()` exige al menos una línea de receta, y no hay.
 *   2. `recetas.productos` — con todo lo que el archivo trae.
 *
 * ⚠️ Nacen SIN receta, o sea con costo Q0.00. No es una anomalía: 1,281 de los
 * 1,302 productos actuales están igual (el backfill de desarrollos no tenía
 * recetas que copiar). Cargarles la receta es trabajo aparte.
 *
 * ⚠️ La columna LINEA del archivo (tipo de prenda) NO se guarda: el producto no
 * tiene dónde. Es el pendiente de mover el catálogo de líneas al producto.
 *
 * ⚠️ Correr DESPUÉS de `catalogos-deporte-linea.mjs`: el deporte del producto se
 * valida contra `recetas.deportes`, y ese otro script da de alta 15 deportes
 * que este necesita.
 *
 * Uso:
 *   node --env-file=.env scripts/crear-productos-faltantes.mjs <archivo.xlsx> [--dry-run]
 */
import { PrismaPg } from '@prisma/adapter-pg';
import ExcelJS from 'exceljs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const aqui = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) process.loadEnvFile(path.join(aqui, '..', '.env'));

const archivo = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!archivo) {
  console.error('Uso: node scripts/crear-productos-faltantes.mjs <archivo.xlsx> [--dry-run]');
  process.exit(1);
}

const texto = (v) =>
  v == null ? '' : String(typeof v === 'object' && v.text != null ? v.text : v).trim();

/** `WRESTLING` -> `Wrestling`: la grafía canónica del catálogo de deportes. */
const titulo = (s) =>
  s
    .toLowerCase()
    .replace(/(^|[\s\-_/])([a-záéíóúñ])/g, (_, sep, c) => sep + c.toUpperCase())
    .trim();

/** `(0181) BSN SPORTS` -> `181`. Null si la celda no trae código. */
function codigoCliente(celda) {
  const m = /^\(\s*(\d+)\s*\)/.exec(celda);
  return m ? String(parseInt(m[1], 10)) : null;
}

const MESES = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

/** `27/Dic/2019` -> Date (mediodía UTC, para que no se corra de día). */
function fechaDelArchivo(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const m = /^(\d{1,2})\/([A-Za-zÀ-ÿ]{3,})\/(\d{4})$/.exec(texto(v));
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase().slice(0, 3)];
  if (mes == null) return null;
  const d = new Date(Date.UTC(Number(m[3]), mes, Number(m[1]), 12));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[0];

  const filas = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const g = (c) => texto(ws.getRow(r).getCell(c).value);
    const f = {
      desarrollo: g(1),
      clienteCodigo: codigoCliente(g(2)),
      tamano: g(3),
      fecha: fechaDelArchivo(ws.getRow(r).getCell(4).value),
      producto: g(5),
      patron: g(6),
      descripcion: g(7),
      deporte: g(8),
    };
    if (f.producto && f.desarrollo && f.descripcion) filas.push(f);
  }
  console.log(
    'Archivo: %s · %s filas con producto, desarrollo y descripción\n',
    path.basename(archivo),
    filas.length,
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const [productos, desarrollos, clientes, deportes] = await Promise.all([
      prisma.producto.findMany({ select: { codigo: true, desarrollo: true } }),
      prisma.desarrollo.findMany({ select: { codigo: true } }),
      prisma.cliente.findMany({ select: { idCliente: true, codigo: true, activo: true } }),
      prisma.deporte.findMany({ select: { nombre: true } }),
    ]);
    const existePorCodigo = new Set(productos.map((p) => p.codigo));
    const existePorDesarrollo = new Set(productos.map((p) => p.desarrollo));
    const desarrolloExiste = new Set(desarrollos.map((d) => d.codigo));
    const clientePorCodigo = new Map(
      clientes
        .filter((c) => c.activo)
        .map((c) => [String(parseInt(c.codigo, 10)), c.idCliente]),
    );
    const deporteCanon = new Map(deportes.map((d) => [d.nombre.toLowerCase(), d.nombre]));

    const aCrear = new Map();
    const saltados = { yaExiste: 0, desarrolloOcupado: 0, deporteDesconocido: 0 };
    const motivos = [];
    for (const f of filas) {
      if (existePorCodigo.has(f.producto) || existePorDesarrollo.has(f.desarrollo)) {
        saltados.yaExiste++;
        continue;
      }
      if (aCrear.has(f.producto)) continue;
      // Un desarrollo que ya existe pero sin producto es otra cosa: no se toca.
      if (desarrolloExiste.has(f.desarrollo)) {
        saltados.desarrolloOcupado++;
        motivos.push(`${f.producto}: el desarrollo ${f.desarrollo} ya existe`);
        continue;
      }
      const dep = f.deporte ? deporteCanon.get(titulo(f.deporte).toLowerCase()) : null;
      if (f.deporte && !dep) {
        saltados.deporteDesconocido++;
        motivos.push(`${f.producto}: deporte "${f.deporte}" no está en el catálogo`);
        continue;
      }
      aCrear.set(f.producto, { ...f, deporteCanon: dep ?? null });
    }

    console.log('A crear: %s productos (cada uno con su desarrollo)', aCrear.size);
    console.log(
      '  saltados — ya existen: %s · desarrollo ocupado: %s · deporte desconocido: %s',
      saltados.yaExiste,
      saltados.desarrolloOcupado,
      saltados.deporteDesconocido,
    );
    for (const m of motivos.slice(0, 10)) console.log('     %s', m);
    if (aCrear.size === 0) {
      console.log('\nNada que hacer.');
      return;
    }
    const sinCliente = [...aCrear.values()].filter(
      (f) => !f.clienteCodigo || !clientePorCodigo.has(f.clienteCodigo),
    );
    const sinFecha = [...aCrear.values()].filter((f) => !f.fecha);
    console.log('  sin cliente resoluble: %s (se crean igual: id_cliente es nullable)', sinCliente.length);
    console.log('  sin fecha interpretable: %s (se les pone la de hoy)\n', sinFecha.length);

    const resumen = await prisma.$transaction(
      async (tx) => {
        let creados = 0;
        for (const f of aCrear.values()) {
          const idCliente = f.clienteCodigo ? (clientePorCodigo.get(f.clienteCodigo) ?? null) : null;
          const cuando = f.fecha ?? new Date();
          await tx.desarrollo.create({
            data: {
              codigo: f.desarrollo,
              descripcion: f.descripcion.slice(0, 250),
              estado: 'APROBADO',
              idCliente,
              // La fecha del archivo es la del desarrollo. Va en creadoEn y en
              // aprobadoEn porque el CHECK de la base exige aprobadoEn cuando
              // el estado es APROBADO.
              creadoEn: cuando,
              aprobadoEn: cuando,
              // NULL = sin usuario real al que atribuirlo, igual que el
              // backfill de los 1,285 desarrollos históricos.
              creadoPor: null,
              aprobadoPor: null,
              notas: 'Alta masiva desde el libro Recetas del Sheets legacy (2026-10-16). Sin receta.',
            },
          });
          await tx.producto.create({
            data: {
              codigo: f.producto,
              descripcion: f.descripcion.slice(0, 250),
              desarrollo: f.desarrollo,
              idCliente,
              patron: f.patron ? f.patron.slice(0, 60) : null,
              tamano: f.tamano ? f.tamano.slice(0, 60) : null,
              deporte: f.deporteCanon,
              precioVenta: 0,
            },
          });
          creados++;
        }
        if (dryRun) throw Object.assign(new Error('__dry_run__'), { resumen: { creados } });
        return { creados };
      },
      { timeout: 120_000 },
    );

    console.log('Creados: %s productos y %s desarrollos.', resumen.creados, resumen.creados);
  } catch (e) {
    if (e?.message === '__dry_run__') {
      console.log('Se crearían: %s productos y %s desarrollos.', e.resumen.creados, e.resumen.creados);
      console.log('\n--- DRY RUN: la transacción se revirtió, no se escribió nada ---');
    } else throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
