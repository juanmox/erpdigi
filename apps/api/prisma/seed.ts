import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Permisos del rol Cotizador: solo ver catálogo y generar cotizaciones.
const PERMISOS_COTIZADOR = [
  'recetas.catalogo.ver',
  'recetas.cotizaciones.ver',
  'recetas.cotizaciones.crear',
]

// Permisos adicionales del rol Editor: gestión completa del catálogo de recetas.
const PERMISOS_EDITOR_ADICIONALES = [
  'recetas.insumos.crear',
  'recetas.insumos.editar',
  'recetas.insumos.desactivar',
  'recetas.productos.crear',
  'recetas.productos.editar',
  'recetas.productos.desactivar',
  'recetas.recetas.editar',
  'recetas.importar',
]

// Permisos adicionales del rol Admin: control total de la plataforma.
const PERMISOS_ADMIN_ADICIONALES = [
  'plataforma.usuarios.administrar',
  'plataforma.roles.administrar',
  'plataforma.empresas.administrar',
  'plataforma.auditoria.ver',
]

async function upsertPermiso(codigo: string) {
  return prisma.permiso.upsert({
    where: { codigo },
    update: {},
    create: { codigo },
  })
}

async function upsertRolConPermisos(codigo: string, nombre: string, codigosPermisos: string[]) {
  const rol = await prisma.rol.upsert({
    where: { codigo },
    update: { nombre },
    create: { codigo, nombre, esRolSistema: true },
  })

  const permisos = await Promise.all(codigosPermisos.map(upsertPermiso))

  await Promise.all(
    permisos.map((permiso) =>
      prisma.rolPermiso.upsert({
        where: { idRol_idPermiso: { idRol: rol.idRol, idPermiso: permiso.idPermiso } },
        update: {},
        create: { idRol: rol.idRol, idPermiso: permiso.idPermiso },
      }),
    ),
  )

  return rol
}

async function main() {
  const gtq = await prisma.moneda.upsert({
    where: { codigoIso: 'GTQ' },
    update: {},
    create: { codigoIso: 'GTQ', nombre: 'Quetzal', simbolo: 'Q', decimales: 2 },
  })

  await prisma.moneda.upsert({
    where: { codigoIso: 'USD' },
    update: {},
    create: { codigoIso: 'USD', nombre: 'Dólar estadounidense', simbolo: '$', decimales: 2 },
  })

  const digitexsa = await prisma.empresa.upsert({
    where: { codigo: 'DIGITEXSA' },
    update: {},
    create: {
      codigo: 'DIGITEXSA',
      razonSocial: 'Digital Textil, S.A.',
      nombreComercial: 'Digitexsa',
      idMonedaBase: gtq.idMoneda,
    },
  })

  const rolCotizador = await upsertRolConPermisos('COTIZADOR', 'Cotizador', PERMISOS_COTIZADOR)
  const rolEditor = await upsertRolConPermisos('EDITOR', 'Editor', [
    ...PERMISOS_COTIZADOR,
    ...PERMISOS_EDITOR_ADICIONALES,
  ])
  const rolAdmin = await upsertRolConPermisos('ADMIN', 'Administrador', [
    ...PERMISOS_COTIZADOR,
    ...PERMISOS_EDITOR_ADICIONALES,
    ...PERMISOS_ADMIN_ADICIONALES,
  ])

  const emailAdmin = process.env.SEED_ADMIN_EMAIL ?? 'admin@digitexsa.com'
  const passwordAdmin = process.env.SEED_ADMIN_PASSWORD ?? 'CambiarInmediatamente123!'
  const passwordHash = await bcrypt.hash(passwordAdmin, 12)

  const admin = await prisma.usuario.upsert({
    where: { email: emailAdmin },
    update: {},
    create: {
      email: emailAdmin,
      passwordHash,
      nombreCompleto: 'Administrador',
    },
  })

  await prisma.usuarioEmpresaRol.upsert({
    where: {
      idUsuario_idEmpresa_idRol: {
        idUsuario: admin.idUsuario,
        idEmpresa: digitexsa.idEmpresa,
        idRol: rolAdmin.idRol,
      },
    },
    update: {},
    create: {
      idUsuario: admin.idUsuario,
      idEmpresa: digitexsa.idEmpresa,
      idRol: rolAdmin.idRol,
    },
  })

  console.log('Seed completo.')
  console.log(`Roles: ${rolCotizador.codigo}, ${rolEditor.codigo}, ${rolAdmin.codigo}`)
  console.log(`Empresa: ${digitexsa.codigo} — ${digitexsa.razonSocial}`)
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Usuario admin: ${emailAdmin} / contraseña temporal: ${passwordAdmin}`)
  } else {
    console.log(`Usuario admin: ${emailAdmin} (contraseña tomada de SEED_ADMIN_PASSWORD)`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
