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
//
// costeo.orden.ver / costeo.orden.importar NO están en la lista original de
// 22 permisos de §7 — el prompt nunca anticipó un sub-módulo de alta de
// Órdenes de Producción (ninguna fase F2-F8 lo menciona explícitamente).
// Se agregan aquí porque Reposiciones (F3) necesita OPs reales contra las
// cuales validar, y esas OPs se cargan por import (ver costeo-ordenes,
// sesión F3, confirmado con el usuario). Documentado como desviación
// deliberada del RBAC original, no un descuido.
const PERMISOS_COSTEO = [
  'costeo.rollo.ver',
  'costeo.rollo.montar',
  'costeo.rollo.desmontar',
  'costeo.rollo.ingresar',
  'costeo.orden.ver',
  'costeo.orden.importar',
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

// Los roles granulares que sugiere PROMPT_CLAUDE_CODE.md §7, ajustados tras
// revisión práctica del usuario probando cada rol con un usuario dedicado
// (sesión posterior a F3) — el mapeo original le daba a varios roles acceso
// a pantallas que en la práctica no debían tocar. Fácil de seguir ajustando
// después (son solo filas rol_permiso, editables desde /usuarios sin tocar
// el schema).
//
// - Operador Impresión: SOLO Panel de estado + Montaje/desmontaje de rollo
//   en la impresora — no ingresa factura de papel (eso es Bodeguero) ni
//   toca reposiciones/insumos/facturación.
// - Bodeguero (nuevo): ingreso de factura de papel a bodega + corrección de
//   ingresos mal capturados, y ver el panel de estado — no monta/desmonta
//   rollo en la impresora (eso es físicamente Operador Impresión) ni toca
//   reposiciones/insumos/facturación.
// - Diseño (nuevo): mismo alcance que Operador Impresión (Panel de estado +
//   Montaje) — departamento distinto, mismo tipo de acceso al sistema.
// - Operador Reposiciones (código interno OPERADOR_TRANSFERENCIA, sin
//   cambiar — ver nota junto al rol): SOLO la pantalla de Reposiciones + el
//   panel lateral de estado de impresoras que muestra esa pantalla. Incluye
//   `recetas.catalogo.ver` únicamente porque el selector de "Insumo de
//   tela" del formulario lee ese catálogo — no le da acceso al módulo
//   Recetas en el sidebar/rutas (gateados por `recetas.cotizaciones.ver`,
//   que este rol no tiene) ni a generar cotizaciones.
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
    ['costeo.rollo.ver', 'costeo.rollo.montar', 'costeo.rollo.desmontar'],
  ],
  [
    'BODEGUERO',
    'Bodeguero',
    ['costeo.rollo.ver', 'costeo.rollo.ingresar'],
  ],
  [
    'DISENO',
    'Diseño',
    ['costeo.rollo.ver', 'costeo.rollo.montar', 'costeo.rollo.desmontar'],
  ],
  [
    // Código interno sin cambiar a propósito (upsert por `codigo` — cambiarlo
    // crearía un rol nuevo en vez de renombrar el existente, dejando
    // huérfanas las asignaciones ya hechas a usuarios reales). Solo cambia
    // el nombre visible, de "Operador Transferencia" a "Operador
    // Reposiciones" — refleja mejor el alcance real del rol (solo la
    // pantalla de Reposiciones).
    'OPERADOR_TRANSFERENCIA',
    'Operador Reposiciones',
    [
      'costeo.rollo.ver',
      'costeo.orden.ver',
      'costeo.reposicion.ver',
      'costeo.reposicion.crear',
      'recetas.catalogo.ver',
    ],
  ],
  [
    'ANALISTA_COSTOS',
    'Analista de Costos',
    [
      'costeo.orden.ver',
      'costeo.orden.importar',
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
      'costeo.orden.ver',
      'costeo.orden.importar',
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
      'costeo.orden.ver',
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

// Tipos de papel confirmados activos: los del formulario (ANEXO_B §5.1) +
// CHINO_ALEMAN_120, confirmado activo por la hoja real `DataDisev3!
// Mantenimiento` (usuario, sesión de F3) — el pool Mimaki 3-6 lo usa hoy,
// no es histórico. CHINO_ALEMAN_1000 y ALEMAN_CON_TACK siguen sin
// confirmar, quedan inactivos. Se excluye a propósito "PAPEL DIGITAL
// PROTECT 100 GSM 64"" y "TEXTPRINT 1000" — posibles duplicados pendientes
// de confirmar antes de unificarlos.
const TIPOS_PAPEL_COSTEO: Array<[codigo: string, nombre: string, activo: boolean]> = [
  ['HIGH_SPEED', 'HIGH SPEED', true],
  ['TEXTPRINT_XP_105_K2_1000', 'TEXTPRINT XP 105 K2 de 1000', true],
  ['DIGITAL_PROTECT_100', 'DIGITAL PROTECT 100', true],
  ['CHINO_ALEMAN_120', 'CHINO-ALEMAN de 120', true],
  ['ALEMAN_CON_TACK', 'ALEMAN CON TACK', false],
  ['CHINO_ALEMAN_1000', 'CHINO-ALEMAN de 1000', false],
]

// Impresoras activas del formulario (ANEXO_B §3.1) + el pool Mimaki 3-6
// (MK3-MK6), que usan papel Chino Alemán — el usuario confirmó (sesión de
// F3) que "MK'S" en ANEXO_B no era una impresora retirada sino este pool
// completo de 4 equipos activos, mal registrado como ambiguo en F1. MS 7/
// MS 8 siguen fuera — esos sí quedan sin confirmar.
// grupo: MS_DT (impresoras MS/MP) · DP (RG NEXT/ONE + Mimaki) — a pedido del
// usuario (sesión F3), para las secciones colapsables del panel de estado.
// El orden de despliegue es el orden de este arreglo (MS 1-6, MP 7-8, RG
// NEXT/ONE, Mimaki 3-6), nunca alfabético.
const IMPRESORAS_COSTEO: Array<[codigo: string, tipoPapelDefault: string | null, activo: boolean, grupo: string]> = [
  ['MS 1', 'TEXTPRINT_XP_105_K2_1000', true, 'MS_DT'],
  ['MS 2', 'TEXTPRINT_XP_105_K2_1000', true, 'MS_DT'],
  ['MS 3', 'TEXTPRINT_XP_105_K2_1000', true, 'MS_DT'],
  ['MS 4', 'TEXTPRINT_XP_105_K2_1000', true, 'MS_DT'],
  ['MS 5', 'TEXTPRINT_XP_105_K2_1000', true, 'MS_DT'],
  ['MS 6', 'TEXTPRINT_XP_105_K2_1000', true, 'MS_DT'],
  ['MP 7', 'TEXTPRINT_XP_105_K2_1000', true, 'MS_DT'],
  ['MP 8', 'TEXTPRINT_XP_105_K2_1000', true, 'MS_DT'],
  ['RG NEXT', 'HIGH_SPEED', true, 'DP'],
  ['RG ONE', 'HIGH_SPEED', true, 'DP'],
  ['MK3', 'CHINO_ALEMAN_120', true, 'DP'],
  ['MK4', 'CHINO_ALEMAN_120', true, 'DP'],
  ['MK5', 'CHINO_ALEMAN_120', true, 'DP'],
  ['MK6', 'CHINO_ALEMAN_120', true, 'DP'],
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

// Reconcilia de verdad: agrega los permisos que falten Y quita los que ya no
// estén en `codigosPermisos` — antes solo agregaba, así que recortar la
// lista de un rol acá y correr el seed de nuevo no alcanzaba para quitarle
// el acceso viejo (bug real, encontrado al recortar OPERADOR_IMPRESION/
// OPERADOR_TRANSFERENCIA en sesión posterior a F3).
async function upsertRolConPermisos(codigo: string, nombre: string, codigosPermisos: string[]) {
  const rol = await prisma.rol.upsert({
    where: { codigo },
    update: { nombre },
    create: { codigo, nombre, esRolSistema: true },
  })

  const permisos = await Promise.all(codigosPermisos.map(upsertPermiso))
  const idsPermisosDeseados = permisos.map((p) => p.idPermiso)

  await Promise.all(
    permisos.map((permiso) =>
      prisma.rolPermiso.upsert({
        where: { idRol_idPermiso: { idRol: rol.idRol, idPermiso: permiso.idPermiso } },
        update: {},
        create: { idRol: rol.idRol, idPermiso: permiso.idPermiso },
      }),
    ),
  )

  await prisma.rolPermiso.deleteMany({
    where: { idRol: rol.idRol, idPermiso: { notIn: idsPermisosDeseados } },
  })

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
    IMPRESORAS_COSTEO.map(([codigo, tipoPapelDefault, activo, grupo], indice) => {
      const idTipoPapelDefault = tipoPapelDefault ? (idTipoPapelPorCodigo.get(tipoPapelDefault) ?? null) : null
      const orden = indice + 1
      return prisma.impresora.upsert({
        where: { codigo },
        update: { idTipoPapelDefault, activo, orden, grupo },
        create: { codigo, idTipoPapelDefault, activo, orden, grupo },
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

  const usernameAdmin = process.env.SEED_ADMIN_USERNAME ?? 'admin'
  const emailAdmin = process.env.SEED_ADMIN_EMAIL ?? 'admin@digitexsa.com'
  const passwordAdmin = process.env.SEED_ADMIN_PASSWORD ?? 'CambiarInmediatamente123!'
  const passwordHash = await bcrypt.hash(passwordAdmin, 12)

  const admin = await prisma.usuario.upsert({
    where: { username: usernameAdmin },
    update: {},
    create: {
      username: usernameAdmin,
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
    console.log(`Usuario admin: ${usernameAdmin} / contraseña temporal: ${passwordAdmin}`)
  } else {
    console.log(`Usuario admin: ${usernameAdmin} (contraseña tomada de SEED_ADMIN_PASSWORD)`)
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
