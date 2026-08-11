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

// Permisos del módulo Costeo Real (PROMPT_CLAUDE_CODE.md §7). Otorgados por
// completo a ADMIN, y repartidos entre los 6 roles granulares que sugiere el
// prompt (ver ROLES_GRANULARES_COSTEO más abajo).
const PERMISOS_COSTEO = [
  'costeo.rollo.ver',
  'costeo.rollo.montar',
  'costeo.rollo.desmontar',
  'costeo.rollo.ingresar',
  'costeo.reposicion.ver',
  'costeo.reposicion.crear',
  'costeo.reposicion.anular',
  'costeo.consumo.ver',
  'costeo.consumo.capturar',
  'costeo.consumo.anular',
  'costeo.of.ver',
  'costeo.of.crear',
  'costeo.of.editar',
  'costeo.of.cerrar',
  'costeo.of.reabrir',
  'costeo.insumo.ver',
  'costeo.insumo.administrar',
  'costeo.insumo.editar_costo',
  'costeo.estandar.ver',
  'costeo.estandar.administrar',
  'costeo.dashboard.ver',
  'costeo.dashboard.ver_financiero',
]

// Los 6 roles granulares que sugiere PROMPT_CLAUDE_CODE.md §7, con el mapeo
// permiso↔rol diseñado según el flujo real del proceso (impresión →
// transferencia → costeo/facturación → supervisión → gerencia), no un dato
// confirmado del sistema legacy. Fácil de ajustar después (son solo filas
// rol_permiso, editables desde /usuarios sin tocar el schema).
//
// - Operador Impresión: monta/desmonta rollo en la impresora y captura el
//   consumo de papel durante la impresión — no toca reposiciones, insumos,
//   ni facturación.
// - Operador Transferencia: la etapa de transferencia/calandra es donde se
//   originan la mayoría de defectos (ANEXO_B: "Transferido al revés",
//   "Transferido sin Temperatura", etc.) — captura consumo y registra
//   reposiciones, sin acceso a montaje de rollo ni facturación.
// - Analista Costos: dueño de costo_unitario de insumos (versionado SCD2),
//   consumo estándar y órdenes de facturación — visibilidad financiera
//   completa, sin operar equipo físico.
// - Supervisor Producción: control operativo completo del piso (rollo +
//   reposición + consumo, incluida anulación) y de órdenes de producción,
//   sin tocar costos de insumos ni cerrar/reabrir facturación.
// - Gerencia: visibilidad total + autoridad de cierre/reapertura de OF y
//   anulación de reposición/consumo — no captura datos de piso.
// - Administrador IT: acceso técnico completo a costeo.* (soporte/
//   configuración), sin los permisos `plataforma.*` de ADMIN (usuarios,
//   roles, empresas).
const ROLES_GRANULARES_COSTEO: Array<[codigo: string, nombre: string, permisos: string[]]> = [
  [
    'OPERADOR_IMPRESION',
    'Operador Impresión',
    [
      'costeo.rollo.ver',
      'costeo.rollo.montar',
      'costeo.rollo.desmontar',
      'costeo.consumo.ver',
      'costeo.consumo.capturar',
      'costeo.estandar.ver',
      'costeo.dashboard.ver',
    ],
  ],
  [
    'OPERADOR_TRANSFERENCIA',
    'Operador Transferencia',
    [
      'costeo.rollo.ver',
      'costeo.consumo.ver',
      'costeo.consumo.capturar',
      'costeo.reposicion.ver',
      'costeo.reposicion.crear',
      'costeo.estandar.ver',
      'costeo.dashboard.ver',
    ],
  ],
  [
    'ANALISTA_COSTOS',
    'Analista de Costos',
    [
      'costeo.of.ver',
      'costeo.of.crear',
      'costeo.of.editar',
      'costeo.insumo.ver',
      'costeo.insumo.editar_costo',
      'costeo.estandar.ver',
      'costeo.estandar.administrar',
      'costeo.consumo.ver',
      'costeo.reposicion.ver',
      'costeo.dashboard.ver',
      'costeo.dashboard.ver_financiero',
    ],
  ],
  [
    'SUPERVISOR_PRODUCCION',
    'Supervisor de Producción',
    [
      'costeo.rollo.ver',
      'costeo.rollo.montar',
      'costeo.rollo.desmontar',
      'costeo.rollo.ingresar',
      'costeo.reposicion.ver',
      'costeo.reposicion.crear',
      'costeo.reposicion.anular',
      'costeo.consumo.ver',
      'costeo.consumo.capturar',
      'costeo.consumo.anular',
      'costeo.of.ver',
      'costeo.of.crear',
      'costeo.of.editar',
      'costeo.estandar.ver',
      'costeo.dashboard.ver',
    ],
  ],
  [
    'GERENCIA_COSTEO',
    'Gerencia',
    [
      'costeo.rollo.ver',
      'costeo.reposicion.ver',
      'costeo.reposicion.anular',
      'costeo.consumo.ver',
      'costeo.consumo.anular',
      'costeo.of.ver',
      'costeo.of.cerrar',
      'costeo.of.reabrir',
      'costeo.insumo.ver',
      'costeo.insumo.administrar',
      'costeo.insumo.editar_costo',
      'costeo.estandar.ver',
      'costeo.estandar.administrar',
      'costeo.dashboard.ver',
      'costeo.dashboard.ver_financiero',
    ],
  ],
  ['ADMIN_IT_COSTEO', 'Administrador IT — Costeo', [...PERMISOS_COSTEO]],
]

// Departamentos activos en el formulario legacy de Reposiciones (ANEXO_B §1).
// Los 6 nombres del catálogo de empleados (BORDADO, CONTROL DE CALIDAD, CORTE,
// DISEÑO, EMPAQUE, TRANSFERENCIA) usan nomenclatura distinta y no se mapean
// aquí — ese mapeo solo importa cuando se cargue el maestro de empleados real
// (S7, todavía no existe), no bloquea Fase 1.
const DEPARTAMENTOS_COSTEO: Array<[codigo: string, nombre: string]> = [
  ['REPOSICIONES', 'Reposiciones'],
  ['DISENO', 'Diseño'],
  ['TRANSFERENCIA', 'Transferencia'],
  ['AUDITORIA', 'Auditoria'],
  ['CONTROL_CALIDAD', 'Control de Calidad'],
  ['CORTE_MANUAL', 'Corte Manual'],
  ['CORTE_LASER', 'Corte Láser'],
  ['BORDADOS', 'Bordados'],
  ['CONFECCION', 'Confección'],
]

// Los 40 defectos activos de ANEXO_B §2, con la clasificación categoria/
// imputable_a que el propio anexo marca como "sugerencia para tu revisión,
// no un dato del sistema actual" — se siembra tal cual porque ya es un
// análisis razonado (no un valor inventado desde cero), pero queda abierta a
// corrección posterior vía el catálogo (nunca borrado físico, solo edición).
const DEFECTOS_COSTEO: Array<[codigo: string, nombre: string, categoria: string, imputableA: string]> = [
  ['APAGON_ELECTRICIDAD', 'Apagon de electricidad', 'EXTERNO', 'PROVEEDOR'],
  ['ARCHIVOS_MALOS_CLIENTE', 'Archivos malos enviados por el cliente', 'EXTERNO', 'CLIENTE'],
  ['ARRUGA_PAPEL', 'Arruga de Papel', 'MATERIAL', 'PROVEEDOR'],
  ['ARRUGA_TELA', 'Arruga de Tela', 'MATERIAL', 'PROVEEDOR'],
  ['ASTRIAS', 'Astrias', 'PROCESO', 'INTERNO'],
  ['BARRADO_CABEZAL', 'Barrado por Cabezal', 'EQUIPO', 'INTERNO'],
  ['CAMBIO_TONALIDAD', 'Cambio de Tonalidad', 'PROCESO', 'INTERNO'],
  ['CONTAMINACION_TELA', 'Contaminacion de Tela', 'MATERIAL', 'INTERNO'],
  ['DEFECTO_PAPEL', 'Defecto de Papel', 'MATERIAL', 'PROVEEDOR'],
  ['DEFECTO_TELA', 'Defecto de Tela', 'MATERIAL', 'PROVEEDOR'],
  ['DOBLEZ_PAPEL', 'Doblez de Papel', 'PROCESO', 'INTERNO'],
  ['DOBLEZ_TELA', 'Doblez de Tela', 'PROCESO', 'INTERNO'],
  ['ENCOGIMIENTO', 'Encogimiento', 'PROCESO', 'INTERNO'],
  ['EXPLOSIONES', 'Explosiones', 'EQUIPO', 'INTERNO'],
  ['GHOSTING', 'Ghosting', 'PROCESO', 'INTERNO'],
  ['MANCHAS_TELA', 'Manchas en Tela', 'MATERIAL', 'INTERNO'],
  ['MOTA', 'Mota', 'MATERIAL', 'INTERNO'],
  ['NOIS', 'Nois', 'EQUIPO', 'INTERNO'],
  ['REPLICA', 'Replica', 'HUMANO', 'INTERNO'],
  ['TOPE_CABEZAL', 'Tope de Cabezal', 'EQUIPO', 'INTERNO'],
  ['TRANSFERIDO_AL_REVES', 'Transferido al revés', 'HUMANO', 'INTERNO'],
  ['MAL_POSICIONAMIENTO_TRANSF', 'Mal posicionamiento en Transf.', 'HUMANO', 'INTERNO'],
  ['MANCHA_DEDOS', 'Mancha de dedos', 'HUMANO', 'INTERNO'],
  ['MAL_SOLICITADO_CALIDAD', 'Mal solicitado por Calidad', 'HUMANO', 'INTERNO'],
  ['MAL_CORTE', 'Mal corte', 'HUMANO', 'INTERNO'],
  ['MAL_MONTAJE', 'Mal montaje', 'HUMANO', 'INTERNO'],
  ['HEAT_TRANSFER', 'Heat-Transfer', 'PROCESO', 'INTERNO'],
  ['PERDIDA_PIEZA', 'Perdida de pieza', 'HUMANO', 'INTERNO'],
  ['TRABON_MAQUINA', 'Trabón de máquina', 'EQUIPO', 'INTERNO'],
  ['ENTORCHAMIENTO', 'Entorchamiento', 'PROCESO', 'INTERNO'],
  ['PERFORACION', 'Perforación', 'MATERIAL', 'INTERNO'],
  ['FALTANTE', 'Faltante', 'HUMANO', 'INTERNO'],
  ['NUMERO_REPETIDO', 'Número repetido', 'HUMANO', 'INTERNO'],
  ['EMPALME', 'Empalme', 'MATERIAL', 'PROVEEDOR'],
  ['TRANSFERIDO_SIN_TEMPERATURA', 'Transferido sin Temperatura', 'PROCESO', 'INTERNO'],
  ['ERROR_IMPRESORA', 'Error de Impresora', 'EQUIPO', 'INTERNO'],
  ['CONTAMINACION_TERMOFIJADO', 'Contaminacion de Termofijado', 'PROCESO', 'INTERNO'],
  ['TELA_INCORRECTA', 'Tela incorrecta', 'HUMANO', 'INTERNO'],
  ['PERDIDA_FORRO', 'Perdida de Forro', 'HUMANO', 'INTERNO'],
  ['PERDIDA_BIES', 'Perdida de Bies', 'HUMANO', 'INTERNO'],
]

// Tipos de papel activos hoy en el formulario (ANEXO_B §5.1) + históricos NO
// ambiguos, marcados inactivos para no perder el registro (ANEXO_B §5.2).
// Se excluyen a propósito "PAPEL DIGITAL PROTECT 100 GSM 64"" y "TEXTPRINT
// 1000" — el anexo los marca como posibles duplicados de los activos y pide
// confirmar con el usuario antes de unificarlos.
const TIPOS_PAPEL_COSTEO: Array<[codigo: string, nombre: string, activo: boolean]> = [
  ['HIGH_SPEED', 'HIGH SPEED', true],
  ['TEXTPRINT_XP_105_K2_1000', 'TEXTPRINT XP 105 K2 de 1000', true],
  ['DIGITAL_PROTECT_100', 'DIGITAL PROTECT 100', true],
  ['ALEMAN_CON_TACK', 'ALEMAN CON TACK', false],
  ['CHINO_ALEMAN_1000', 'CHINO-ALEMAN de 1000', false],
  ['CHINO_ALEMAN_120', 'CHINO-ALEMAN de 120', false],
]

// Impresoras activas del formulario (ANEXO_B §3.1) + MK3/MK4, documentadas
// ahí como equipos retirados (se preservan inactivas, no se destruye el
// registro histórico). MS 7/MS 8 y "MK'S" quedan fuera a propósito — ANEXO_B
// marca su existencia real como no confirmada ("verificar antes de descartar").
const IMPRESORAS_COSTEO: Array<[codigo: string, tipoPapelDefault: string | null, activo: boolean]> = [
  ['MS 1', 'TEXTPRINT_XP_105_K2_1000', true],
  ['MS 2', 'TEXTPRINT_XP_105_K2_1000', true],
  ['MS 3', 'TEXTPRINT_XP_105_K2_1000', true],
  ['MS 4', 'TEXTPRINT_XP_105_K2_1000', true],
  ['MS 5', 'TEXTPRINT_XP_105_K2_1000', true],
  ['MS 6', 'TEXTPRINT_XP_105_K2_1000', true],
  ['MP 7', 'TEXTPRINT_XP_105_K2_1000', true],
  ['MP 8', 'TEXTPRINT_XP_105_K2_1000', true],
  ['RG NEXT', 'HIGH_SPEED', true],
  ['RG ONE', 'HIGH_SPEED', true],
  ['MK3', null, false],
  ['MK4', null, false],
]

const CALANDRAS_COSTEO = ['MONTI #1', 'MONTI #2', 'MONTI #3', 'MONTI #4', 'MONTI #5', 'MONTI #6']

const TIPOS_SERVICIO_COSTEO: Array<[codigo: string, nombre: string]> = [
  ['PAQUETE_COMPLETO', 'PAQUETE COMPLETO'],
  ['SERV_SUBLIMACION', 'SERVICIO DE SUBLIMACION'],
  ['SERV_CONFECCION', 'SERVICIO DE CONFECCION'],
  ['GASTOS_CLIENTE', 'GASTOS A CUENTA DEL CLIENTE'],
  ['ERROR_ARCHIVOS', 'ERROR EN ARCHIVOS'],
]

// grupo de las 13 tallas ya existentes en recetas.tallas (taxonomía sugerida
// en ANEXO_B §6). Las otras ~145 tallas del anexo NO se cargan todavía —
// mismo criterio que productos (S5b confirmado): se dan de alta conforme
// aparezca una orden real que las necesite, no de forma masiva.
const GRUPO_TALLAS_EXISTENTES: Record<string, string> = {
  YXS: 'YOUTH',
  YS: 'YOUTH',
  YM: 'YOUTH',
  YL: 'YOUTH',
  YXL: 'YOUTH',
  XS: 'ADULT',
  S: 'ADULT',
  M: 'ADULT',
  L: 'ADULT',
  XL: 'ADULT',
  '2XL': 'ADULT',
  '3XL': 'ADULT',
  '4XL': 'ADULT',
}

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

async function seedCosteo() {
  const departamentos = await Promise.all(
    DEPARTAMENTOS_COSTEO.map(([codigo, nombre]) =>
      prisma.departamento.upsert({ where: { codigo }, update: { nombre }, create: { codigo, nombre } }),
    ),
  )

  const defectos = await Promise.all(
    DEFECTOS_COSTEO.map(([codigo, nombre, categoria, imputableA]) =>
      prisma.defecto.upsert({
        where: { codigo },
        update: { nombre, categoria, imputableA },
        create: { codigo, nombre, categoria, imputableA },
      }),
    ),
  )

  const tiposPapel = await Promise.all(
    TIPOS_PAPEL_COSTEO.map(([codigo, nombre, activo]) =>
      prisma.tipoPapel.upsert({ where: { codigo }, update: { nombre, activo }, create: { codigo, nombre, activo } }),
    ),
  )
  const idTipoPapelPorCodigo = new Map(tiposPapel.map((t) => [t.codigo, t.idTipoPapel]))

  const impresoras = await Promise.all(
    IMPRESORAS_COSTEO.map(([codigo, tipoPapelDefault, activo]) => {
      const idTipoPapelDefault = tipoPapelDefault ? (idTipoPapelPorCodigo.get(tipoPapelDefault) ?? null) : null
      return prisma.impresora.upsert({
        where: { codigo },
        update: { idTipoPapelDefault, activo },
        create: { codigo, idTipoPapelDefault, activo },
      })
    }),
  )

  const calandras = await Promise.all(
    CALANDRAS_COSTEO.map((codigo) => prisma.calandra.upsert({ where: { codigo }, update: {}, create: { codigo } })),
  )

  const tiposServicio = await Promise.all(
    TIPOS_SERVICIO_COSTEO.map(([codigo, nombre]) =>
      prisma.tipoServicio.upsert({ where: { codigo }, update: { nombre }, create: { codigo, nombre } }),
    ),
  )

  await Promise.all(
    Object.entries(GRUPO_TALLAS_EXISTENTES).map(([nombre, grupo]) =>
      prisma.talla.updateMany({ where: { nombre }, data: { grupo } }),
    ),
  )

  return { departamentos, defectos, tiposPapel, impresoras, calandras, tiposServicio }
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
    ...PERMISOS_COSTEO,
  ])

  const rolesGranularesCosteo = await Promise.all(
    ROLES_GRANULARES_COSTEO.map(([codigo, nombre, permisos]) => upsertRolConPermisos(codigo, nombre, permisos)),
  )

  const costeo = await seedCosteo()

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
  console.log(
    `Costeo: ${costeo.departamentos.length} departamentos, ${costeo.defectos.length} defectos, ` +
      `${costeo.tiposPapel.length} tipos de papel, ${costeo.impresoras.length} impresoras, ` +
      `${costeo.calandras.length} calandras, ${costeo.tiposServicio.length} tipos de servicio`,
  )
  console.log(`Roles granulares Costeo: ${rolesGranularesCosteo.map((r) => r.codigo).join(', ')}`)
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
