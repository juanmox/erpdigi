/**
 * Carga el logo de una empresa en `core.empresas.logo`, como data URI.
 *
 *   node apps/api/scripts/cargar-logo-empresa.mjs CASTA ruta/al/logo.png
 *
 * Existe porque el logo vive en la base y no en el bundle del frontend: cambiar
 * el logo de una empresa —o darle uno a una empresa nueva— no debería exigir un
 * despliegue. Es el mismo criterio de `color_marca`.
 *
 * Se guarda como data URI y no como ruta porque los documentos impresos se
 * arman en un iframe con su propio HTML, donde una ruta relativa depende del
 * base de Vite y del prefijo de Nginx (de hecho el `/logo.png` que estaba
 * incrustado daba 404 y nadie se enteraba). Ver `app/marca-empresa.ts`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// El script carga su propio .env: se invoca desde la raíz del repo, donde
// `DATABASE_URL` no está en el entorno, y sin ella `PrismaPg` conecta sin
// contraseña y falla con un error de SASL que no dice nada del .env
// ("client password must be a string").
if (!process.env.DATABASE_URL) {
  const env = join(dirname(fileURLToPath(import.meta.url)), '..', '.env')
  if (existsSync(env)) process.loadEnvFile(env)
}
if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL y no se encontró apps/api/.env')
  process.exit(1)
}

const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' }

// Tope deliberado: el logo viaja en la respuesta de login y de cada refresh,
// así que un archivo grande se paga en cada sesión. Un logo de marca bien
// exportado pesa decenas de KB; si esto salta, el archivo necesita optimizarse,
// no un límite más alto.
const MAX_KB = 200

const [codigo, ruta] = process.argv.slice(2)
if (!codigo || !ruta) {
  console.error('Uso: node apps/api/scripts/cargar-logo-empresa.mjs <CODIGO_EMPRESA> <archivo>')
  process.exit(1)
}

const ext = extname(ruta).toLowerCase()
const tipo = TIPOS[ext]
if (!tipo) {
  console.error(`Extensión no soportada: "${ext}". Usá ${Object.keys(TIPOS).join(', ')}`)
  process.exit(1)
}

const bytes = readFileSync(ruta)
const kb = bytes.length / 1024
if (kb > MAX_KB) {
  console.error(`El archivo pesa ${kb.toFixed(1)} KB y el tope es ${MAX_KB} KB.`)
  console.error('Optimizalo antes de cargarlo: viaja en cada login y en cada refresh de sesión.')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const empresa = await prisma.empresa.findUnique({ where: { codigo }, select: { idEmpresa: true, nombreComercial: true } })
if (!empresa) {
  const todas = await prisma.empresa.findMany({ select: { codigo: true, nombreComercial: true } })
  console.error(`No existe la empresa con código "${codigo}". Las que hay:`)
  for (const e of todas) console.error(`  ${e.codigo}  (${e.nombreComercial ?? 'sin nombre comercial'})`)
  await prisma.$disconnect()
  process.exit(1)
}

await prisma.empresa.update({
  where: { idEmpresa: empresa.idEmpresa },
  data: { logo: `data:${tipo};base64,${bytes.toString('base64')}` },
})

// Las dimensiones salen de la cabecera IHDR del PNG; es solo informativo, para
// notar de una si el archivo es desproporcionado o quedó enorme.
const px = ext === '.png' ? ` · ${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)} px` : ''
console.log(`Logo cargado en ${codigo} (${empresa.nombreComercial ?? '—'}): ${kb.toFixed(1)} KB${px}`)
console.log('Cerrá sesión y volvé a entrar para verlo: el logo viaja en la sesión.')

await prisma.$disconnect()
