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
  // Desarrollo es desde 2026-08-26 el dueño de la receta: crear/editar el
  // prototipo y aprobarlo son atribuciones del mismo rol que ya gestiona el
  // catálogo (decisión del usuario: Editor y Admin aprueban). `aprobar` va
  // separado de `editar` a propósito — editar el BOM y firmar la aprobación
  // son actos distintos, aunque hoy los tenga el mismo rol; separarlos ahora
  // permite crear después un rol "Diseño" que costee pero no apruebe, sin
  // tocar el schema.
  'recetas.desarrollos.crear',
  'recetas.desarrollos.editar',
  'recetas.desarrollos.aprobar',
  // Sigue gateando las líneas de receta, que ahora viven en el desarrollo —
  // el nombre por fin es literal: "editar recetas". Se reutiliza en vez de
  // crear uno nuevo para no perder las asignaciones ya hechas a usuarios.
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
      // Necesario solo para el selector de Producto/Talla al dar de alta un
      // consumo estándar (llama GET /recetas/productos y /recetas/tallas) —
      // mismo criterio que Operador Reposiciones con el selector de tela: no
      // otorga acceso al módulo Recetas en sí, ese gate es
      // recetas.cotizaciones.ver, separado.
      'recetas.catalogo.ver',
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
      'recetas.catalogo.ver',
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

// grupo de las 13 tallas que ya existían en recetas.tallas (taxonomía de
// ANEXO_B §6 / PROMPT_CLAUDE_CODE.md:203).
// Se les reasigna tambien `orden` con la misma escala que TALLAS_ADICIONALES
// (base*4 dentro del bloque de su grupo), o las 13 originales quedarian todas
// antes de las nuevas y una variante como YS+2 caeria lejos de su base YS.
const GRUPO_TALLAS_EXISTENTES: Record<string, { grupo: string; orden: number; frecuente: boolean }> = {
  YXS: { grupo: 'YOUTH', orden: 100, frecuente: true },
  YS: { grupo: 'YOUTH', orden: 104, frecuente: true },
  YM: { grupo: 'YOUTH', orden: 108, frecuente: true },
  YL: { grupo: 'YOUTH', orden: 112, frecuente: true },
  YXL: { grupo: 'YOUTH', orden: 116, frecuente: true },
  XS: { grupo: 'ADULT', orden: 200, frecuente: true },
  S: { grupo: 'ADULT', orden: 204, frecuente: true },
  M: { grupo: 'ADULT', orden: 208, frecuente: true },
  L: { grupo: 'ADULT', orden: 212, frecuente: true },
  XL: { grupo: 'ADULT', orden: 216, frecuente: true },
  '2XL': { grupo: 'ADULT', orden: 220, frecuente: true },
  '3XL': { grupo: 'ADULT', orden: 224, frecuente: true },
  '4XL': { grupo: 'ADULT', orden: 228, frecuente: true },
}

// Las 142 tallas restantes de ANEXO_B. En F1 se dejaron fuera con el criterio
// "se dan de alta conforme aparezca una orden real que las necesite", pero al
// preparar F4 (Consumo de Papel) resultó que SÍ están en uso: bloqueaban 583 de
// las 3,079 filas del catálogo real de Consumo Estándar. Todas caben en el
// VARCHAR(10) de la columna, así que no hizo falta migración.
//
// `grupo` es solo para agrupar los selectores en pantalla — no participa de
// ningún cálculo. La combinación producto+talla se resuelve por `nombre`, así
// que un grupo mal asignado es cosmético y se corrige editando la fila.
// Los casos ambiguos (MR, MX, M2, T2, XX) quedaron en su lectura más probable.
//
// `orden` respeta la escala real (XS < S < M < L < XL < 2XL < …) y coloca cada
// variante "+N" justo después de su talla base.
const TALLAS_ADICIONALES: { nombre: string; orden: number; grupo: string }[] = [
  { nombre: 'YS+2', orden: 106, grupo: 'YOUTH' },
  { nombre: 'YS+4', orden: 107, grupo: 'YOUTH' },
  { nombre: 'YM+2', orden: 110, grupo: 'YOUTH' },
  { nombre: 'YM+4', orden: 111, grupo: 'YOUTH' },
  { nombre: 'YL+2', orden: 114, grupo: 'YOUTH' },
  { nombre: 'YL+4', orden: 115, grupo: 'YOUTH' },
  { nombre: 'YXL+2', orden: 118, grupo: 'YOUTH' },
  { nombre: 'YXL+4', orden: 119, grupo: 'YOUTH' },
  { nombre: '3XS', orden: 188, grupo: 'ADULT' },
  { nombre: '2XS', orden: 192, grupo: 'ADULT' },
  { nombre: 'XS+2', orden: 202, grupo: 'ADULT' },
  { nombre: 'XS+4', orden: 203, grupo: 'ADULT' },
  { nombre: 'S+1', orden: 205, grupo: 'ADULT' },
  { nombre: 'S+2', orden: 206, grupo: 'ADULT' },
  { nombre: 'S+4', orden: 207, grupo: 'ADULT' },
  { nombre: 'M+1', orden: 209, grupo: 'ADULT' },
  { nombre: 'M+2', orden: 210, grupo: 'ADULT' },
  { nombre: 'M+4', orden: 211, grupo: 'ADULT' },
  { nombre: 'L+2', orden: 214, grupo: 'ADULT' },
  { nombre: 'L+4', orden: 215, grupo: 'ADULT' },
  { nombre: 'XL+1', orden: 217, grupo: 'ADULT' },
  { nombre: 'XL+2', orden: 218, grupo: 'ADULT' },
  { nombre: 'XL+4', orden: 219, grupo: 'ADULT' },
  { nombre: '2XL+2', orden: 222, grupo: 'ADULT' },
  { nombre: '2XL+4', orden: 223, grupo: 'ADULT' },
  { nombre: '3XL+2', orden: 226, grupo: 'ADULT' },
  { nombre: '3XL+4', orden: 227, grupo: 'ADULT' },
  { nombre: '4XL+2', orden: 230, grupo: 'ADULT' },
  { nombre: '4XL+4', orden: 231, grupo: 'ADULT' },
  { nombre: '5XL', orden: 232, grupo: 'ADULT' },
  { nombre: '5XL+2', orden: 234, grupo: 'ADULT' },
  { nombre: '5XL+4', orden: 235, grupo: 'ADULT' },
  { nombre: '6XL', orden: 236, grupo: 'ADULT' },
  { nombre: '6XL+2', orden: 238, grupo: 'ADULT' },
  { nombre: '6XL+4', orden: 239, grupo: 'ADULT' },
  { nombre: '7XL', orden: 240, grupo: 'ADULT' },
  { nombre: '7XL+2', orden: 242, grupo: 'ADULT' },
  { nombre: '7XL+4', orden: 243, grupo: 'ADULT' },
  { nombre: 'MS', orden: 304, grupo: 'MEN' },
  { nombre: 'MS+2', orden: 306, grupo: 'MEN' },
  { nombre: 'MM', orden: 308, grupo: 'MEN' },
  { nombre: 'MM+2', orden: 310, grupo: 'MEN' },
  { nombre: 'MM+4', orden: 311, grupo: 'MEN' },
  { nombre: 'ML', orden: 312, grupo: 'MEN' },
  { nombre: 'ML+2', orden: 314, grupo: 'MEN' },
  { nombre: 'ML+4', orden: 315, grupo: 'MEN' },
  { nombre: 'MXL', orden: 316, grupo: 'MEN' },
  { nombre: 'MXL+2', orden: 318, grupo: 'MEN' },
  { nombre: 'MXL+4', orden: 319, grupo: 'MEN' },
  { nombre: 'M2XL', orden: 320, grupo: 'MEN' },
  { nombre: 'M2XL+2', orden: 322, grupo: 'MEN' },
  { nombre: 'M2XL+4', orden: 323, grupo: 'MEN' },
  { nombre: 'M3XL', orden: 324, grupo: 'MEN' },
  { nombre: 'M3XL+2', orden: 326, grupo: 'MEN' },
  { nombre: 'M3XL+4', orden: 327, grupo: 'MEN' },
  { nombre: 'M4XL', orden: 328, grupo: 'MEN' },
  { nombre: 'M4XL+2', orden: 330, grupo: 'MEN' },
  { nombre: 'M4XL+4', orden: 331, grupo: 'MEN' },
  { nombre: 'M4XL+6', orden: 331, grupo: 'MEN' },
  { nombre: 'M5XL', orden: 332, grupo: 'MEN' },
  { nombre: 'M5XL+2', orden: 334, grupo: 'MEN' },
  { nombre: 'M5XL+4', orden: 335, grupo: 'MEN' },
  { nombre: 'M5XL+6', orden: 335, grupo: 'MEN' },
  { nombre: 'M6XL', orden: 336, grupo: 'MEN' },
  { nombre: 'M7XL', orden: 340, grupo: 'MEN' },
  { nombre: 'M7XL+4', orden: 343, grupo: 'MEN' },
  { nombre: 'WS', orden: 404, grupo: 'WOMEN' },
  { nombre: 'WS+2', orden: 406, grupo: 'WOMEN' },
  { nombre: 'WM', orden: 408, grupo: 'WOMEN' },
  { nombre: 'WM+2', orden: 410, grupo: 'WOMEN' },
  { nombre: 'WL', orden: 412, grupo: 'WOMEN' },
  { nombre: 'WL+2', orden: 414, grupo: 'WOMEN' },
  { nombre: 'WXL', orden: 416, grupo: 'WOMEN' },
  { nombre: 'WXL+2', orden: 418, grupo: 'WOMEN' },
  { nombre: 'W2XL', orden: 420, grupo: 'WOMEN' },
  { nombre: 'W2XL+2', orden: 422, grupo: 'WOMEN' },
  { nombre: 'W3XL', orden: 424, grupo: 'WOMEN' },
  { nombre: 'W4XL', orden: 428, grupo: 'WOMEN' },
  { nombre: 'LF-XS', orden: 500, grupo: 'LADIES_FIT' },
  { nombre: 'LFXS', orden: 500, grupo: 'LADIES_FIT' },
  { nombre: 'LXS', orden: 500, grupo: 'LADIES_FIT' },
  { nombre: 'LXS+2', orden: 502, grupo: 'LADIES_FIT' },
  { nombre: 'LXS+4', orden: 503, grupo: 'LADIES_FIT' },
  { nombre: 'LF-S', orden: 504, grupo: 'LADIES_FIT' },
  { nombre: 'LFS', orden: 504, grupo: 'LADIES_FIT' },
  { nombre: 'LS', orden: 504, grupo: 'LADIES_FIT' },
  { nombre: 'LS+2', orden: 506, grupo: 'LADIES_FIT' },
  { nombre: 'LS+4', orden: 507, grupo: 'LADIES_FIT' },
  { nombre: 'LF-M', orden: 508, grupo: 'LADIES_FIT' },
  { nombre: 'LFM', orden: 508, grupo: 'LADIES_FIT' },
  { nombre: 'LM', orden: 508, grupo: 'LADIES_FIT' },
  { nombre: 'LM+2', orden: 510, grupo: 'LADIES_FIT' },
  { nombre: 'LM+4', orden: 511, grupo: 'LADIES_FIT' },
  { nombre: 'LF-L', orden: 512, grupo: 'LADIES_FIT' },
  { nombre: 'LFL', orden: 512, grupo: 'LADIES_FIT' },
  { nombre: 'LL', orden: 512, grupo: 'LADIES_FIT' },
  { nombre: 'LL+2', orden: 514, grupo: 'LADIES_FIT' },
  { nombre: 'LL+4', orden: 515, grupo: 'LADIES_FIT' },
  { nombre: 'LF-XL', orden: 516, grupo: 'LADIES_FIT' },
  { nombre: 'LFXL', orden: 516, grupo: 'LADIES_FIT' },
  { nombre: 'LXL', orden: 516, grupo: 'LADIES_FIT' },
  { nombre: 'LXL+2', orden: 518, grupo: 'LADIES_FIT' },
  { nombre: 'LXL+4', orden: 519, grupo: 'LADIES_FIT' },
  { nombre: 'L2XL', orden: 520, grupo: 'LADIES_FIT' },
  { nombre: 'LF-2XL', orden: 520, grupo: 'LADIES_FIT' },
  { nombre: 'LF2XL', orden: 520, grupo: 'LADIES_FIT' },
  { nombre: 'L2XL+2', orden: 522, grupo: 'LADIES_FIT' },
  { nombre: 'L2XL+4', orden: 523, grupo: 'LADIES_FIT' },
  { nombre: 'L3XL', orden: 524, grupo: 'LADIES_FIT' },
  { nombre: 'LF-3XL', orden: 524, grupo: 'LADIES_FIT' },
  { nombre: 'LF3XL', orden: 524, grupo: 'LADIES_FIT' },
  { nombre: 'L3XL+2', orden: 526, grupo: 'LADIES_FIT' },
  { nombre: 'L3XL+4', orden: 527, grupo: 'LADIES_FIT' },
  { nombre: 'L4XL', orden: 528, grupo: 'LADIES_FIT' },
  { nombre: 'LF-4XL', orden: 528, grupo: 'LADIES_FIT' },
  { nombre: 'LF4XL', orden: 528, grupo: 'LADIES_FIT' },
  { nombre: 'L4XL+2', orden: 530, grupo: 'LADIES_FIT' },
  { nombre: 'L4XL+4', orden: 531, grupo: 'LADIES_FIT' },
  { nombre: 'M2', orden: 560, grupo: 'ADULT' },
  { nombre: 'T2', orden: 560, grupo: 'ADULT' },
  { nombre: 'XX', orden: 560, grupo: 'ADULT' },
  { nombre: 'XXL', orden: 560, grupo: 'ADULT' },
  { nombre: 'XXS', orden: 560, grupo: 'ADULT' },
  { nombre: 'XXXL', orden: 560, grupo: 'ADULT' },
  { nombre: 'XXXS', orden: 560, grupo: 'ADULT' },
  { nombre: 'MR', orden: 660, grupo: 'MEN' },
  { nombre: 'MX', orden: 660, grupo: 'MEN' },
  { nombre: 'WR-4', orden: 756, grupo: 'WOMEN' },
  { nombre: 'WR-2', orden: 758, grupo: 'WOMEN' },
  { nombre: 'WR', orden: 760, grupo: 'WOMEN' },
  { nombre: 'WR+2', orden: 762, grupo: 'WOMEN' },
  { nombre: '10', orden: 960, grupo: 'NUMERICA' },
  { nombre: '12', orden: 960, grupo: 'NUMERICA' },
  { nombre: '14', orden: 960, grupo: 'NUMERICA' },
  { nombre: '16', orden: 960, grupo: 'NUMERICA' },
  { nombre: '8', orden: 960, grupo: 'NUMERICA' },
  { nombre: '34Wx34L', orden: 1060, grupo: 'PANT' },
  { nombre: '38Wx34L', orden: 1060, grupo: 'PANT' },
  { nombre: '40Wx36L', orden: 1060, grupo: 'PANT' },
  { nombre: 'LARGE-2', orden: 1160, grupo: 'COMBINADA' },
  // Las 5 combinadas que usa la plantilla de Órdenes, en orden lógico (youth
  // primero) en vez de compartir todas el 1160, que las dejaba ordenadas
  // alfabéticamente en el selector de tallas.
  { nombre: 'YS-YM', orden: 1162, grupo: 'COMBINADA' },
  { nombre: 'YL-YXL', orden: 1164, grupo: 'COMBINADA' },
  { nombre: '2XS-XS', orden: 1166, grupo: 'COMBINADA' },
  { nombre: 'S-M', orden: 1168, grupo: 'COMBINADA' },
  { nombre: 'L-XL', orden: 1170, grupo: 'COMBINADA' },
]

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
    Object.entries(GRUPO_TALLAS_EXISTENTES).map(([nombre, v]) =>
      prisma.talla.updateMany({ where: { nombre }, data: v }),
    ),
  )

  // upsert por nombre (es UNIQUE): re-sembrar corrige orden/grupo sin duplicar
  // ni tocar el id, que es lo que referencian consumo_estandar y consumo_papel.
  for (const t of TALLAS_ADICIONALES) {
    await prisma.talla.upsert({
      where: { nombre: t.nombre },
      update: { orden: t.orden, grupo: t.grupo, frecuente: false },
      create: { ...t, frecuente: false },
    })
  }

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
