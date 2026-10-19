/**
 * Carga el maestro de materiales (`CÓDIGOS- MATERIALES`) en `recetas.insumos`,
 * categoría Materiales.
 *
 * Hasta hoy la categoría tenía 13 insumos contra los 443 reales, así que el
 * selector de materiales del formulario de Reposiciones no tendría casi nada
 * que ofrecer. Esta es la fase 0 de ese trabajo.
 *
 * ⚠️ LA UNIDAD DE LA FAMILIA 612 (HILO) SE FUERZA A YARDAS, contra lo que dice
 * el archivo (UNIDAD). Decisión del usuario el 2026-10-19, y la razón está
 * medida: los 3 hilos que ya existían están en YARDAS con costo POR YARDA
 * (0.00308 / 0.01477 / 0.00634) y los tres participan en la receta de
 * `200002596A` → producto `BSN-FB01N` con consumos de 14, 105 y 140 yardas.
 * Reinterpretar esa unidad como "cono" llevaría el costo del producto de
 * Q70.84 a ~Q12,476 — 176 veces, contra un precio de venta de Q19.20.
 *
 * El archivo tiene razón para REQUISAR (se entrega un cono) y la base la tiene
 * para la RECETA (se consumen yardas). Son dos unidades del mismo insumo, y
 * `recetas.insumos` solo admite una. Resolverlo de verdad pide unidad de
 * compra y unidad de consumo por separado, que pertenece al módulo de
 * Inventario. Mientras tanto se guarda en yardas y la conversión del cono
 * queda del lado del operario.
 *
 * Correspondencia verificada antes de forzar nada: la familia 612 son 165
 * ítems, los 165 son hilo, y no hay ningún hilo fuera de esa familia.
 *
 * ⚠️ A los insumos que YA existen no se les toca la unidad, solo se corrige la
 * descripción si el archivo la trae distinta. Cambiar la unidad de un insumo
 * en uso altera el significado de las recetas que lo usan.
 *
 * Los nuevos nacen con costo Q0.00 (el archivo no trae costo). No es anomalía:
 * es el mismo estado de los 1,281 productos sin receta. Cargarles costo es
 * trabajo aparte.
 *
 * Uso:
 *   node --env-file=.env scripts/cargar-materiales.mjs <archivo.xlsx> [--dry-run]
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
  console.error('Uso: node scripts/cargar-materiales.mjs <archivo.xlsx> [--dry-run]');
  process.exit(1);
}

const CATEGORIA = 'Materiales';
/** Familia cuya unidad se fuerza, y a qué. Ver la nota de arriba. */
const FAMILIA_FORZADA = { prefijo: '612', unidad: 'YARDAS', por: 'hilo: la receta lo consume en yardas' };

/**
 * Normaliza el texto que viene de Excel.
 *
 * ⚠️ Hace falta de verdad, medido sobre este archivo: 32 descripciones traen
 * ESPACIO DURO (U+00A0) y 51 traen espacios dobles — 83 de 443 en total. Se
 * ven idénticas a las limpias y miden lo mismo, así que el problema es
 * invisible hasta que alguien busca "VICTORY ANTHRACITE" con un espacio normal
 * y no encuentra nada.
 *
 * Lo detectó el dry-run: marcaba `61601403` como "descripción a corregir"
 * contra una fila de producción que se veía idéntica. La única diferencia era
 * el U+00A0 en la posición 30. Sin esto, la carga habría ENSUCIADO una
 * descripción que el usuario ya había dejado limpia a mano.
 */
// Los espacios raros se detectan por CODE POINT y no con una clase de
// caracteres en un literal de regex: un U+2028 literal es un terminador de
// linea para JavaScript y rompe el archivo (paso al escribir esto).
const ESPACIO_RARO = new Set([0x00a0, 0x202f, 0x2028, 0x2029, 0xfeff]);
const esEspacioRaro = (cp) =>
  cp <= 32 || ESPACIO_RARO.has(cp) || (cp >= 0x2000 && cp <= 0x200f);

const texto = (v) => {
  if (v == null) return '';
  const crudo = String(typeof v === 'object' && v.text != null ? v.text : v);
  let limpio = '';
  for (const ch of crudo) limpio += esEspacioRaro(ch.codePointAt(0)) ? ' ' : ch;
  while (limpio.indexOf('  ') >= 0) limpio = limpio.split('  ').join(' ');
  return limpio.trim();
};

/** El archivo escribe `YARDA` en singular; el catálogo la tiene en plural. */
function normalizarUnidad(u) {
  const n = u.trim().toUpperCase();
  if (n === 'YARDA' || n === 'YARDAS') return 'YARDAS';
  if (n === 'UNIDAD' || n === 'UNIDADES') return 'UNIDAD';
  return n;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[0];

  const filas = [];
  const sinUnidad = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const codigo = texto(ws.getRow(r).getCell(1));
    if (!codigo) continue;
    const descripcion = texto(ws.getRow(r).getCell(2));
    const unidadCruda = texto(ws.getRow(r).getCell(3));
    if (!descripcion || !unidadCruda) {
      sinUnidad.push(`fila ${r}: ${codigo}`);
      continue;
    }
    const forzada = codigo.startsWith(FAMILIA_FORZADA.prefijo);
    filas.push({
      codigo,
      descripcion,
      unidad: forzada ? FAMILIA_FORZADA.unidad : normalizarUnidad(unidadCruda),
      unidadArchivo: normalizarUnidad(unidadCruda),
      forzada,
    });
  }

  console.log('Archivo: %s · hoja "%s"', path.basename(archivo), ws.name);
  console.log('  filas con código, descripción y unidad: %s', filas.length);
  if (sinUnidad.length)
    console.log('  ⚠️ saltadas por faltarles descripción o unidad: %s — %s',
      sinUnidad.length, sinUnidad.slice(0, 5).join(', '));

  const forzadas = filas.filter((f) => f.forzada && f.unidad !== f.unidadArchivo);
  if (forzadas.length)
    console.log('  unidad forzada (%s): familia %s → %s · %s',
      forzadas.length, FAMILIA_FORZADA.prefijo, FAMILIA_FORZADA.unidad, FAMILIA_FORZADA.por);

  const repetidos = filas.length - new Set(filas.map((f) => f.codigo)).size;
  if (repetidos > 0) {
    console.error('\n⚠️ El archivo trae %s código(s) repetido(s). No se carga nada.', repetidos);
    process.exit(1);
  }
  console.log('');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const [categoria, unidades, existentes, empresa] = await Promise.all([
      prisma.categoriaInsumo.findFirst({ where: { nombre: CATEGORIA } }),
      prisma.unidadMedida.findMany({ select: { idUnidad: true, nombre: true } }),
      prisma.insumo.findMany({
        select: { idInsumo: true, codigo: true, descripcion: true, idUnidad: true },
      }),
      prisma.empresa.findFirst({ where: { codigo: 'DIGITEXSA' }, select: { idEmpresa: true } }),
    ]);
    if (!categoria) throw new Error(`No existe la categoría "${CATEGORIA}"`);

    const unidadPorNombre = new Map(unidades.map((u) => [u.nombre.toUpperCase(), u.idUnidad]));
    const faltan = [...new Set(filas.map((f) => f.unidad))].filter((u) => !unidadPorNombre.has(u));
    if (faltan.length) {
      console.error('⚠️ Unidades que no existen en el catálogo: %s. No se carga nada.', faltan.join(', '));
      process.exit(1);
    }

    const porCodigo = new Map(existentes.map((i) => [i.codigo, i]));
    const aCrear = [];
    const aCorregirDescripcion = [];
    const unidadDistinta = [];
    for (const f of filas) {
      const ya = porCodigo.get(f.codigo);
      if (!ya) {
        aCrear.push(f);
        continue;
      }
      // Se compara el valor CRUDO de la base contra el del archivo YA
      // normalizado: el archivo es el objetivo. Normalizar los dos lados
      // haria que una descripcion sucia en la base se viera igual que una
      // sucia en el archivo y nunca se limpiara (pasó en la primera corrida).
      if (ya.descripcion !== f.descripcion)
        aCorregirDescripcion.push({ ...f, antes: ya.descripcion, idInsumo: ya.idInsumo });
      // La unidad de un insumo en uso NO se toca: solo se reporta.
      if (ya.idUnidad !== unidadPorNombre.get(f.unidad)) {
        const actual = unidades.find((u) => u.idUnidad === ya.idUnidad);
        unidadDistinta.push(`${f.codigo}: base=${actual?.nombre} archivo=${f.unidad}`);
      }
    }

    const porUnidad = new Map();
    for (const f of aCrear) porUnidad.set(f.unidad, (porUnidad.get(f.unidad) ?? 0) + 1);

    console.log('A crear: %s insumos nuevos en categoría %s', aCrear.length, CATEGORIA);
    for (const [u, n] of [...porUnidad].sort()) console.log('   %s en %s', String(n).padStart(4), u);
    console.log('Ya existen: %s · descripciones a corregir: %s', filas.length - aCrear.length, aCorregirDescripcion.length);
    for (const d of aCorregirDescripcion.slice(0, 5))
      console.log('   %s "%s" → "%s"', d.codigo, d.antes.slice(0, 32), d.descripcion.slice(0, 32));
    if (unidadDistinta.length) {
      console.log('\n⚠️ Con unidad distinta en la base (NO se cambia, solo se informa): %s', unidadDistinta.length);
      for (const u of unidadDistinta) console.log('   %s', u);
    }

    if (aCrear.length === 0 && aCorregirDescripcion.length === 0) {
      console.log('\nNada que hacer.');
      return;
    }

    const resumen = await prisma.$transaction(
      async (tx) => {
        let creados = 0;
        for (const f of aCrear) {
          await tx.insumo.create({
            data: {
              codigo: f.codigo,
              descripcion: f.descripcion.slice(0, 250),
              idCategoria: categoria.idCategoria,
              idUnidad: unidadPorNombre.get(f.unidad),
              // El archivo no trae costo; se carga aparte cuando exista.
              costoPromedio: 0,
              activo: true,
            },
          });
          creados++;
        }
        let corregidos = 0;
        for (const d of aCorregirDescripcion) {
          await tx.insumo.update({
            where: { idInsumo: d.idInsumo },
            data: { descripcion: d.descripcion.slice(0, 250) },
          });
          corregidos++;
        }
        // El cambio entra por script y no por la API, así que el rastro se
        // escribe a mano — mismo criterio que la fusión de UNDER ARMOUR.
        if (creados > 0 || corregidos > 0) {
          await tx.auditoria.create({
            data: {
              idEmpresa: empresa?.idEmpresa ?? null,
              idUsuario: null,
              usuarioNombre: 'migración SQL',
              entidad: 'recetas.insumos',
              idEntidad: 'carga-materiales',
              accion: 'INSERT',
              datosNuevos: {
                motivo: 'Carga del maestro de materiales para el selector de Reposiciones',
                archivo: path.basename(archivo),
                creados,
                descripcionesCorregidas: corregidos,
                unidadForzada: forzadas.length
                  ? `familia ${FAMILIA_FORZADA.prefijo} → ${FAMILIA_FORZADA.unidad} (${forzadas.length} ítems)`
                  : null,
              },
            },
          });
        }
        const r = { creados, corregidos };
        if (dryRun) throw Object.assign(new Error('__dry_run__'), { resumen: r });
        return r;
      },
      { timeout: 120_000 },
    );

    console.log('\nCreados: %s · descripciones corregidas: %s', resumen.creados, resumen.corregidos);
  } catch (e) {
    if (e?.message === '__dry_run__') {
      console.log('\nSe crearían: %s · se corregirían: %s descripción(es)',
        e.resumen.creados, e.resumen.corregidos);
      console.log('--- DRY RUN: la transacción se revirtió, no se escribió nada ---');
    } else throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
