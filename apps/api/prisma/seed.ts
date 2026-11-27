import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Permisos del módulo Inventario (2026-11-26). El catálogo de insumos salió de
// Recetas: son cosas que entran y salen de bodega, y en Recetas el bodeguero
// quedaba a un clic de costos y recetas confidenciales. El COSTO es aparte del
// insumo: quien da de alta lo que llega a bodega no necesita (ni debe) verlo.
function permisosInventario(acciones: string[]) {
  return acciones.map((a) => `inventario.${a}`)
}

// Permisos del rol Cotizador: solo ver catálogo y generar cotizaciones.
const PERMISOS_COTIZADOR = [
  'recetas.catalogo.ver',
  'recetas.cotizaciones.ver',
  'recetas.cotizaciones.crear',
]

// Permisos adicionales del rol Editor: gestión completa del catálogo de recetas.
const PERMISOS_EDITOR_ADICIONALES = [
  // Los insumos pasaron a Inventario (2026-11-26): ver, crear, editar,
  // desactivar e importar el catálogo, más el costo — el Editor cotiza y arma
  // recetas, así que necesita verlo y fijarlo.
  ...permisosInventario(['insumo.ver', 'insumo.crear', 'insumo.editar', 'insumo.desactivar', 'insumo.importar', 'costo.ver', 'costo.editar']),
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
  // Interruptor de los tableros (Superset). Solo ADMIN lo recibe de fábrica, a propósito: instalar
  // Superset no debe mostrar el menú a nadie más hasta que se asigne desde /roles.
  'plataforma.tableros.acceder',
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
  // Historial de montajes: quién montó y quién desmontó cada rollo. Va aparte
  // de `costeo.rollo.ver` a pedido del usuario — por ahora solo administradores.
  // Al vivir en PERMISOS_COSTEO lo reciben ADMIN y ADMIN_IT_COSTEO y ninguno de
  // los roles granulares de planta, que listan sus permisos uno por uno. Para
  // abrirlo después basta agregarlo a un rol desde /usuarios, sin tocar código.
  'costeo.rollo.historial',
  'costeo.rollo.marcar_consumido_fuera',
  'costeo.orden.ver',
  'costeo.orden.importar',
  // Editar/eliminar una OP o un ítem ya cargado desde la pantalla de Órdenes
  // de Producción — hoy la única salida es SQL a mano. Mismo criterio que
  // `costeo.of.anular`/`costeo.rollo.marcar_consumido_fuera`: vive solo acá,
  // así que lo reciben ADMIN y ADMIN_IT_COSTEO — asignable a otro rol o
  // usuario desde /roles sin tocar código, si hace falta dárselo a quien
  // sube las plantillas.
  'costeo.orden.editar',
  'costeo.reposicion.ver',
  'costeo.reposicion.crear',
  'costeo.reposicion.anular',
  // Excepción pedida por el usuario (2026-09-28): normalmente el selector de
  // impresora de Reposiciones solo ofrece las que tienen un rollo montado
  // AHORA, y el servidor rechaza cualquier otra. Este permiso levanta las dos
  // cosas, para registrar algo que pasó antes con un rollo ya desmontado.
  // Al vivir en PERMISOS_COSTEO lo reciben ADMIN y ADMIN_IT_COSTEO, y ningún
  // rol de planta (esos listan sus permisos uno por uno).
  'costeo.reposicion.impresora_sin_rollo',
  // Flujo de validaciones de una reposición (2026-11-17). Un permiso por paso, en
  // el orden de la jerarquía; el servidor exige que el paso anterior esté validado.
  // Los roles REPOSICION_* de abajo traen cada uno el suyo; asignables desde /roles.
  'costeo.reposicion.validar_responsable',
  'costeo.reposicion.validar_calidad',
  'costeo.reposicion.validar_auditoria',
  'costeo.reposicion.validar_administracion',
  'costeo.reposicion.autorizar',
  'costeo.reposicion.imprimir_requisicion',
  'costeo.reposicion.despachar',
  'costeo.reposicion.metricas',
  'costeo.reposicion.configurar',
  // Mantenimiento del catálogo de piezas de una prenda (cuello, manga…) que se
  // elige en Reposiciones. Lo reciben ADMIN, ADMIN_IT_COSTEO y los roles que
  // listan el permiso abajo; asignable a otro rol desde /roles.
  'costeo.pieza.administrar',
  'costeo.consumo.ver',
  'costeo.consumo.capturar',
  'costeo.consumo.anular',
  // La misma excepción del lado de Impresión de OPs: habilita el campo "Fecha
  // y hora de impresión", que permite descontar contra el rollo que estaba
  // montado en ese momento y no el de ahora. Sin el permiso el campo no se ve
  // y el servidor rechaza cualquier fecha que venga en el cuerpo.
  'costeo.consumo.fecha_manual',
  'costeo.of.ver',
  'costeo.of.crear',
  'costeo.of.editar',
  'costeo.of.cerrar',
  'costeo.of.reabrir',
  // Anula la OF entera y libera todas sus OP para otra OF. Igual que
  // `costeo.rollo.marcar_consumido_fuera`: vive solo acá, así que lo reciben
  // ADMIN y ADMIN_IT_COSTEO — asignable a otro rol desde /roles sin tocar
  // código, el día que haga falta.
  'costeo.of.anular',
  'costeo.insumo.ver',
  'costeo.insumo.administrar',
  'costeo.insumo.editar_costo',
  'costeo.estandar.ver',
  'costeo.estandar.administrar',
  'costeo.dashboard.ver',
  'costeo.dashboard.ver_financiero',
  // Mostrar el menú de descarga (Excel/CSV/imagen) de los gráficos incrustados.
  // Es un control de PANTALLA: Superset tiene un solo rol para todos los
  // usuarios incrustados, así que esto oculta el menú pero no es un gate real.
  // Lo sensible (costos) se exporta solo por reportes del ERP. Al vivir en
  // PERMISOS_COSTEO lo reciben ADMIN y ADMIN_IT_COSTEO; asignable desde /roles.
  'costeo.dashboard.exportar',
  // Explosión de materiales por OP: lo que el planificador pide a bodega. `ver` abre
  // la página; `importar` carga por plantilla y modifica o anula lo PROPIO mientras
  // esté pendiente; `entregar` registra la salida y ajusta la fecha de entrega
  // (bodega); `editar_ajenos` toca lo de otros y lo ya entregado; `valorizar`
  // congela el costo de lo que se cargó sin precio. Los dos últimos viven solo acá,
  // así que los reciben ADMIN y ADMIN_IT_COSTEO — asignables desde /roles.
  // ⚠️ NO hay un rol "Planificador" sembrado a propósito: ese rol ya lo creó el
  // usuario desde /roles (personalizado, con sus usuarios y sus permisos de OP y
  // rollos), y sembrar otro con el mismo código lo habría pisado o duplicado.
  // `ver` + `importar` se le asignan a ese rol desde la pantalla de Roles.
  'costeo.material.ver',
  'costeo.material.importar',
  'costeo.material.entregar',
  'costeo.material.editar_ajenos',
  'costeo.material.valorizar',
]

// Los roles granulares que sugiere PROMPT_CLAUDE_CODE.md §7, ajustados tras
// revisión práctica del usuario probando cada rol con un usuario dedicado
// (sesión posterior a F3) — el mapeo original le daba a varios roles acceso
// a pantallas que en la práctica no debían tocar. Fácil de seguir ajustando
// después (son solo filas rol_permiso, editables desde /usuarios sin tocar
// el schema).
//
// - Operador Impresión: Panel de estado + Montaje/desmontaje de rollo en la
//   impresora + la pantalla "Impresión de OPs" (descontar el papel de lo que
//   imprime) — no ingresa factura de papel (eso es Bodeguero) ni toca
//   reposiciones/insumos/facturación. `costeo.consumo.*` se le agregó a
//   pedido del usuario tras probar con un usuario real por rol: sin eso, el
//   operario montaba el rollo pero no podía registrar lo que imprimía, que es
//   justamente su trabajo. Sin `costeo.consumo.anular` (corregir un envío ya
//   hecho es de supervisión) y sin `costeo.orden.ver` (las OP las carga
//   Diseño/Analista por import, no el operario).
// - Bodeguero (nuevo): ingreso de factura de papel a bodega + corrección de
//   ingresos mal capturados, y ver el panel de estado — no monta/desmonta
//   rollo en la impresora (eso es físicamente Operador Impresión) ni toca
//   reposiciones/insumos/facturación.
// - Diseño (nuevo): mismo alcance que Operador Impresión (Panel de estado +
//   Montaje + Impresión de OPs) — departamento distinto, mismo tipo de
//   acceso al sistema. En el flujo legacy Diseño era justamente quien
//   llenaba la Forma 2 (consumo de papel), que es lo que reemplaza la
//   pantalla de Impresión de OPs.
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
    [
      'costeo.rollo.ver',
      'costeo.rollo.montar',
      'costeo.rollo.desmontar',
      'costeo.consumo.ver',
      'costeo.consumo.capturar',
    ],
  ],
  [
    'BODEGUERO',
    'Bodeguero',
    [
      'costeo.rollo.ver',
      'costeo.rollo.ingresar',
      // Da de alta los insumos que llegan a bodega (códigos del SAC), uno por uno
      // o por plantilla. NO edita ni retira los existentes (un cambio de
      // descripción repercute en recetas y reportes) y NO ve ni fija costos.
      ...permisosInventario(['insumo.ver', 'insumo.crear', 'insumo.importar']),
      // Ve la explosión de materiales y registra las salidas (la entrega).
      'costeo.material.ver',
      'costeo.material.entregar',
      // Paso 8 del flujo de reposiciones: marca el despacho de lo autorizado. La
      // IMPRESIÓN de la requisición (paso 7) no es de bodega: la hace Auditoría de
      // Reposiciones o quien tenga el rol REPOSICION_IMPRESION.
      'costeo.reposicion.ver',
      'costeo.reposicion.despachar',
    ],
  ],
  // Costos de insumos para quien tiene las facturas en la mano (2026-11-26). ADITIVO: se le
  // agrega a la persona desde /usuarios junto a su rol de bodega (los permisos son la unión de
  // sus roles). Es un rol aparte y no parte de BODEGUERO porque en producción BODEGUERO fue
  // personalizado desde /roles (el seed no le toca permisos) y porque así el costo lo ve solo
  // quien lo maneja, no todo el que da de alta insumos.
  [
    'INVENTARIO_COSTOS',
    'Inventario — Costos de insumos',
    permisosInventario(['insumo.ver', 'costo.ver', 'costo.editar']),
  ],
  // Un rol por paso del flujo de validaciones de reposiciones. Cada uno ve el
  // seguimiento y valida (o devuelve) SOLO su paso.
  [
    'REPOSICION_RESPONSABLE',
    'Reposiciones — Responsable del área (paso 2)',
    ['costeo.reposicion.ver', 'costeo.reposicion.validar_responsable'],
  ],
  [
    'REPOSICION_CALIDAD',
    'Reposiciones — Calidad (paso 3)',
    ['costeo.reposicion.ver', 'costeo.reposicion.validar_calidad'],
  ],
  [
    'REPOSICION_AUDITORIA',
    'Reposiciones — Auditoría (paso 4) e impresión de requisiciones (paso 7)',
    [
      'costeo.reposicion.ver',
      'costeo.reposicion.validar_auditoria',
      // Decisión del usuario (2026-11-22): quien imprime la requisición es Auditoría
      // (Gaby y Marjorie). Para darle esto a otra persona sin hacerla auditora, ver el
      // rol REPOSICION_IMPRESION.
      'costeo.reposicion.imprimir_requisicion',
    ],
  ],
  // Solo el privilegio de imprimir requisiciones, para asignárselo a cualquier
  // persona (Auditoría ya lo trae). Se asigna desde /usuarios.
  [
    'REPOSICION_IMPRESION',
    'Reposiciones — Impresión de requisiciones (paso 7)',
    ['costeo.reposicion.ver', 'costeo.reposicion.imprimir_requisicion'],
  ],
  [
    'REPOSICION_ADMINISTRACION',
    'Reposiciones — Administración (paso 5)',
    ['costeo.reposicion.ver', 'costeo.reposicion.validar_administracion'],
  ],
  // Pasos 8 y 9: bodega deja lista la requisición (y avisa) y marca la entrega. Rol aparte
  // (y no dentro de BODEGUERO) porque en producción BODEGUERO fue personalizado desde
  // /roles y el seed ya no le toca permisos.
  [
    'REPOSICION_DESPACHO',
    'Reposiciones — Bodega: lista y entrega (pasos 8 y 9)',
    ['costeo.reposicion.ver', 'costeo.reposicion.despachar'],
  ],
  // Excepción POR PERSONA (2026-11-25): quien tenga este rol registra sus reposiciones y se
  // autorizan en el acto, sin pasar por las validaciones. Es ADITIVO: se le agrega a la
  // persona desde /usuarios junto a su rol de creación (los permisos son la unión de sus
  // roles). ⚠️ El permiso NO está en PERMISOS_COSTEO a propósito: ADMIN y ADMIN_IT_COSTEO
  // lo recibirían y sus reposiciones saltarían el flujo en silencio.
  [
    'REPOSICION_SIN_VALIDACION',
    'Reposiciones — Registra sin validaciones (excepción)',
    ['costeo.reposicion.sin_validacion'],
  ],
  [
    'REPOSICION_AUTORIZACION',
    'Reposiciones — Autorización de despacho (paso 6)',
    [
      'costeo.reposicion.ver',
      'costeo.reposicion.autorizar',
      'costeo.reposicion.metricas',
      // Al autorizar se descuenta del rollo montado: necesita ver qué impresoras
      // tienen rollo, para reasignar las que fallan por no tenerlo.
      'costeo.rollo.ver',
    ],
  ],

  [
    'DISENO',
    'Diseño',
    [
      'costeo.rollo.ver',
      'costeo.rollo.montar',
      'costeo.rollo.desmontar',
      'costeo.consumo.ver',
      'costeo.consumo.capturar',
    ],
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
      // Solo para el selector de "Insumo de tela". Antes era `recetas.catalogo.ver`,
      // que además le abría productos, clientes y tallas, y le entregaba el costo de
      // cada insumo en la respuesta. Ahora ve el catálogo SIN costos.
      'inventario.insumo.ver',
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
      // Dueño de los costos: ve el catálogo y fija el precio de cada insumo (los
      // que da de alta bodega nacen sin costo y le quedan pendientes).
      ...permisosInventario(['insumo.ver', 'costo.ver', 'costo.editar']),
      'costeo.estandar.ver',
      'costeo.estandar.administrar',
      'costeo.pieza.administrar',
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
      'costeo.material.ver',
      'costeo.material.importar',
      'costeo.material.valorizar',
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
      'costeo.pieza.administrar',
      'costeo.consumo.ver',
      'costeo.consumo.capturar',
      'costeo.consumo.anular',
      'costeo.of.ver',
      'costeo.of.crear',
      'costeo.of.editar',
      'costeo.estandar.ver',
      'costeo.dashboard.ver',
      'costeo.material.ver',
      'costeo.material.entregar',
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
      ...permisosInventario(['insumo.ver', 'costo.ver']),
      'costeo.estandar.ver',
      'costeo.estandar.administrar',
      'recetas.catalogo.ver',
      'costeo.dashboard.ver',
      'costeo.dashboard.ver_financiero',
      'costeo.material.ver',
      'costeo.reposicion.metricas',
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
  // Servicios de sublimación continua: la cantidad son yardas, no prendas. La crea
  // también la migración 20261028150000 (el seed no corre solo al desplegar).
  { nombre: 'YARDAS', orden: 1200, grupo: 'SERVICIO' },
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

// Qué hace cada permiso, en castellano. El campo `descripcion` existía en el
// modelo sin usarse y los códigos solos ("costeo.consumo.fecha_manual") no le
// dicen nada a quien tiene que repartirlos: la pantalla de Roles sería un muro
// de códigos con puntos. Se escribe en cada corrida del seed, así que corregir
// un texto acá alcanza para que cambie en pantalla.
const DESCRIPCIONES_PERMISOS: Record<string, string> = {
  // ── Plataforma ──
  'plataforma.usuarios.administrar':
    'Crear usuarios, asignarles roles, activarlos y cambiarles la contraseña',
  'plataforma.roles.administrar': 'Ver y editar los permisos de cada rol, y crear roles nuevos',
  'plataforma.empresas.administrar': 'Ver y administrar el catálogo de empresas',
  'plataforma.auditoria.ver': 'Consultar el registro de auditoría (quién hizo qué y cuándo)',
  'plataforma.tableros.acceder':
    'Ver el menú Dashboards. Hace falta además el permiso de cada tablero (Dashboard: ver / ver financiero)',

  // ── Recetas ──
  'recetas.catalogo.ver':
    'Leer productos, desarrollos (con sus costos), clientes y tallas (lo necesitan algunos selectores de Costeo). Los insumos ya no van acá: son de Inventario',
  'recetas.cotizaciones.ver': 'Entrar al módulo Recetas y ver el historial de cotizaciones',
  'recetas.cotizaciones.crear': 'Guardar cotizaciones nuevas',
  'recetas.productos.crear': 'Dar de alta productos',
  'recetas.productos.editar': 'Editar productos',
  'recetas.productos.desactivar': 'Retirar productos del catálogo',
  'recetas.desarrollos.crear': 'Crear desarrollos (el prototipo dueño de la receta)',
  'recetas.desarrollos.editar': 'Editar un desarrollo y las líneas de insumo de su receta',
  'recetas.desarrollos.aprobar': 'Aprobar un desarrollo, o reabrirlo a borrador',
  'recetas.recetas.editar': 'Editar las líneas de receta de un desarrollo (para elegir insumos necesita además Inventario: ver insumos)',
  'recetas.importar': 'Usar los imports masivos de Excel de productos y desarrollos',

  // ── Inventario ──
  'inventario.insumo.ver':
    'Entrar a Inventario y ver el catálogo de insumos (sin costos). También alimenta el selector de insumos de otras pantallas',
  'inventario.insumo.crear': 'Dar de alta insumos, uno por uno (el código es el del SAC)',
  'inventario.insumo.editar': 'Cambiar la descripción, categoría y unidad de un insumo ya existente',
  'inventario.insumo.desactivar': 'Retirar insumos del catálogo, o reactivarlos',
  'inventario.insumo.importar': 'Dar de alta insumos por plantilla de Excel',
  'inventario.costo.ver':
    'Ver el costo promedio de los insumos (pestaña Costos). Es información confidencial: sin este permiso el costo ni viaja en la respuesta',
  'inventario.costo.editar':
    'Fijar el costo de los insumos, uno por uno o por plantilla, y poner costo inicial al darlos de alta',

  // ── Costeo: rollos ──
  'costeo.rollo.ver': 'Ver el panel de estado de las impresoras y sus rollos',
  'costeo.rollo.montar': 'Montar un rollo en una impresora',
  'costeo.rollo.desmontar': 'Desmontar un rollo y registrar sus yardas finales',
  'costeo.rollo.ingresar':
    'Ingresar facturas de papel a bodega, corregirlas e importarlas por plantilla',
  'costeo.rollo.historial': 'Ver el historial de montajes: quién montó y quién desmontó cada rollo',
  'costeo.rollo.marcar_consumido_fuera':
    'Sacar de circulación rollos que ya se gastaron fuera de este ERP (por ejemplo antes de arrancarlo), para que no se monten por error',

  // ── Costeo: órdenes ──
  'costeo.orden.ver': 'Buscar órdenes de producción y ver sus líneas',
  'costeo.orden.importar':
    'Importar órdenes de producción por plantilla y dar de alta líneas de producto',
  'costeo.orden.editar':
    'Editar o eliminar una orden de producción o un ítem ya cargado, para corregir una carga mal hecha',

  // ── Costeo: reposiciones ──
  'costeo.reposicion.ver': 'Ver las reposiciones y su seguimiento',
  'costeo.reposicion.crear': 'Registrar reposiciones y corregir las devueltas',
  'costeo.reposicion.anular': 'Anular una reposición (si ya estaba autorizada, el papel vuelve al rollo)',
  'costeo.reposicion.impresora_sin_rollo':
    'SIN USO desde el flujo de validaciones: el rollo se resuelve al autorizar',
  'costeo.reposicion.validar_responsable':
    'Paso 2 del flujo: validar (o devolver) como responsable del área — visto bueno de por qué y para qué',
  'costeo.reposicion.validar_calidad': 'Paso 3 del flujo: validar (o devolver) los defectos, como Calidad',
  'costeo.reposicion.validar_auditoria':
    'Paso 4 del flujo: auditar causas, consumos y responsables contra las prendas físicas',
  'costeo.reposicion.validar_administracion':
    'Paso 5 del flujo: validar que los consumos sean coherentes con el producto y la talla',
  'costeo.reposicion.autorizar':
    'Paso 6 del flujo: autorizar el despacho de bodega (aquí se descuenta el papel del rollo)',
  'costeo.reposicion.imprimir_requisicion':
    'Paso 7 del flujo: imprimir la requisición de bodega de lo autorizado (la primera impresión le asigna su número RQ). Por defecto lo tiene Auditoría de Reposiciones; se puede dar a otros con el rol REPOSICION_IMPRESION',
  'costeo.reposicion.despachar':
    'Pasos 8 y 9 del flujo, en bodega: dejar lista la requisición (avisa a quien la pidió) y marcarla entregada cuando el solicitante la recoge',
  'costeo.reposicion.sin_validacion':
    'EXCEPCIÓN: registrar reposiciones que se autorizan en el acto, sin pasar por las validaciones. Esas reposiciones no tienen corte ni semáforo. Se asigna con el rol REPOSICION_SIN_VALIDACION',
  'costeo.reposicion.metricas': 'Ver las métricas de tiempo del flujo de reposiciones (por paso y por validador)',
  'costeo.reposicion.configurar':
    'Configurar el flujo de reposiciones: modo transitorio sin validaciones, horarios de corte y minutos del semáforo',
  'costeo.pieza.administrar':
    'Agregar, renombrar y retirar piezas del catálogo (cuello, manga, frontal…) que se eligen al registrar una reposición',

  // ── Costeo: consumo de papel (Impresión de OPs) ──
  'costeo.consumo.ver': 'Entrar a Impresión de OPs y ver el trabajo pendiente',
  'costeo.consumo.capturar': 'Enviar líneas y descontar el papel del rollo montado',
  'costeo.consumo.fecha_manual':
    'EXCEPCIÓN: registrar con una fecha y hora distinta a la actual, para descontar del rollo que estaba montado en ese momento',
  'costeo.consumo.anular': 'Anular un consumo ya enviado',

  // ── Costeo: consumo estándar ──
  'costeo.estandar.ver': 'Consultar el consumo estándar de papel por producto y talla',
  'costeo.estandar.administrar': 'Cargar y versionar el consumo estándar',

  // ── Costeo: insumos y facturación (módulos aún sin pantalla) ──
  'costeo.insumo.ver': 'Ver los insumos de costeo',
  'costeo.insumo.administrar': 'Administrar el catálogo de insumos de costeo',
  'costeo.insumo.editar_costo': 'Editar el costo unitario de un insumo (versionado)',
  'costeo.of.ver': 'Ver órdenes de facturación',
  'costeo.of.crear': 'Crear órdenes de facturación (incluye cargarlas por plantilla)',
  'costeo.of.editar': 'Editar órdenes de facturación (factura, fecha, agregar/quitar OP)',
  'costeo.of.cerrar': 'Cerrar una orden de facturación',
  'costeo.of.reabrir': 'Reabrir una orden de facturación cerrada',
  'costeo.of.anular': 'Anular una orden de facturación entera (libera sus OP)',
  'costeo.dashboard.ver': 'Ver los dashboards de Costeo',
  'costeo.dashboard.ver_financiero': 'Ver las cifras financieras de los dashboards',
  'costeo.dashboard.exportar':
    'Mostrar el menú de descarga (Excel, CSV, imagen) en los gráficos de los dashboards',

  // ── Costeo: explosión de materiales ──
  'costeo.material.ver': 'Ver la explosión de materiales por OP (lo que se pide a bodega)',
  'costeo.material.importar':
    'Cargar la explosión de materiales por plantilla, y modificar o anular lo que uno mismo cargó mientras esté pendiente de entrega',
  'costeo.material.entregar':
    'Registrar la entrega de materiales (salida SAC), corregir la fecha de entrega y revertir una entrega',
  'costeo.material.editar_ajenos':
    'EXCEPCIÓN: modificar o anular materiales cargados por otra persona, y los que ya fueron entregados',
  'costeo.material.valorizar':
    'Congelar el costo de los materiales que se cargaron sin precio, cuando el insumo ya lo tiene',
}

async function upsertPermiso(codigo: string) {
  const descripcion = DESCRIPCIONES_PERMISOS[codigo] ?? null
  return prisma.permiso.upsert({
    where: { codigo },
    update: { descripcion },
    create: { codigo, descripcion },
  })
}

const rolesPersonalizadosOmitidos: string[] = []

// Reconcilia de verdad: agrega los permisos que falten Y quita los que ya no
// estén en `codigosPermisos` — antes solo agregaba, así que recortar la
// lista de un rol acá y correr el seed de nuevo no alcanzaba para quitarle
// el acceso viejo (bug real, encontrado al recortar OPERADOR_IMPRESION/
// OPERADOR_TRANSFERENCIA en sesión posterior a F3).
async function upsertRolConPermisos(codigo: string, nombre: string, codigosPermisos: string[]) {
  // El CATÁLOGO de permisos se siembra siempre, antes de cualquier decisión
  // sobre el rol: es lo que hace que un permiso nuevo de esta release aparezca
  // en la pantalla de Roles para poder asignarlo a mano, incluso si ningún rol
  // del seed lo lista todavía.
  const permisos = await Promise.all(codigosPermisos.map(upsertPermiso))
  const idsPermisosDeseados = permisos.map((p) => p.idPermiso)

  const rol = await prisma.rol.upsert({
    where: { codigo },
    update: { nombre },
    create: { codigo, nombre, esRolSistema: true },
  })

  // Rol tomado a mano desde la pantalla de Roles: el seed no le toca los
  // permisos. Sin esto, el deleteMany de abajo borraría en el próximo
  // despliegue cualquier ajuste que se haya hecho por interfaz — que es
  // justamente lo que volvería inútil a esa pantalla.
  if (rol.personalizado) {
    rolesPersonalizadosOmitidos.push(rol.codigo)
    return rol
  }

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

// Quién heredaba qué cuando los insumos eran de Recetas (2026-11-26): permiso
// viejo → permisos nuevos de Inventario. Existe por los roles PERSONALIZADOS
// (en producción lo están varios): el seed no les toca los permisos, así que sin
// esto perderían el acceso a insumos en silencio al desplegar.
//
// `recetas.catalogo.ver` hereda SOLO `insumo.ver`, NUNCA `costo.ver`: que ese
// permiso entregara el costo en cada respuesta es justo la fuga que se cierra.
const HERENCIA_INVENTARIO: Array<[viejo: string, nuevos: string[]]> = [
  ['recetas.catalogo.ver', ['inventario.insumo.ver']],
  ['recetas.insumos.crear', ['inventario.insumo.ver', 'inventario.insumo.crear']],
  [
    'recetas.insumos.editar',
    ['inventario.insumo.ver', 'inventario.insumo.editar', 'inventario.costo.ver', 'inventario.costo.editar'],
  ],
  ['recetas.insumos.desactivar', ['inventario.insumo.ver', 'inventario.insumo.desactivar']],
  ['recetas.importar', ['inventario.insumo.ver', 'inventario.insumo.importar']],
  // El editor de receta lista los insumos y muestra su costo promedio.
  ['recetas.recetas.editar', ['inventario.insumo.ver', 'inventario.costo.ver']],
]

// Permisos que se retiran del catálogo: ya nada los exige.
const PERMISOS_RETIRADOS = ['recetas.insumos.crear', 'recetas.insumos.editar', 'recetas.insumos.desactivar']

/**
 * Herencia de UNA SOLA VEZ (y solo hacia roles personalizados): solo para los permisos `inventario.*` que esta
 * corrida del seed acaba de crear. Si no, un rol personalizado al que un
 * administrador le quitó a propósito un permiso desde /roles lo recuperaría en
 * cada despliegue.
 */
async function heredarPermisosInventario(creadosEnEstaCorrida: Set<string>) {
  if (creadosEnEstaCorrida.size === 0) return 0
  let asignados = 0
  for (const [viejo, nuevos] of HERENCIA_INVENTARIO) {
    const aDar = nuevos.filter((n) => creadosEnEstaCorrida.has(n))
    if (aDar.length === 0) continue
    const roles = await prisma.rolPermiso.findMany({
      // Solo roles personalizados: los demás ya reciben lo suyo de las listas de
      // arriba, y heredar ahí le daría (por ejemplo) insumos al Cotizador.
      where: { permiso: { codigo: viejo }, rol: { personalizado: true } },
      select: { idRol: true },
    })
    for (const codigo of aDar) {
      const permiso = await prisma.permiso.findUnique({ where: { codigo } })
      if (!permiso) continue
      for (const { idRol } of roles) {
        const r = await prisma.rolPermiso.upsert({
          where: { idRol_idPermiso: { idRol, idPermiso: permiso.idPermiso } },
          update: {},
          create: { idRol, idPermiso: permiso.idPermiso },
        })
        if (r) asignados++
      }
    }
  }
  return asignados
}

async function main() {
  // Se toma ANTES de sembrar los roles: ahí es donde se crean los permisos.
  const inventarioExistente = new Set(
    (await prisma.permiso.findMany({ where: { codigo: { startsWith: 'inventario.' } }, select: { codigo: true } })).map(
      (p) => p.codigo,
    ),
  )

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

  const inventarioNuevo = new Set(
    (await prisma.permiso.findMany({ where: { codigo: { startsWith: 'inventario.' } }, select: { codigo: true } }))
      .map((p) => p.codigo)
      .filter((c) => !inventarioExistente.has(c)),
  )
  const heredados = await heredarPermisosInventario(inventarioNuevo)

  // Con la herencia ya hecha, los permisos viejos de insumos se retiran del
  // catálogo (ya nada los exige y seguirían apareciendo en /roles como letra muerta).
  const retirados = await prisma.permiso.findMany({ where: { codigo: { in: PERMISOS_RETIRADOS } } })
  if (retirados.length > 0) {
    const ids = retirados.map((p) => p.idPermiso)
    await prisma.rolPermiso.deleteMany({ where: { idPermiso: { in: ids } } })
    await prisma.permiso.deleteMany({ where: { idPermiso: { in: ids } } })
  }

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
  if (inventarioNuevo.size > 0)
    console.log(
      `Inventario: ${inventarioNuevo.size} permisos nuevos, ${heredados} asignaciones heredadas de los permisos viejos de insumos` +
        (retirados.length > 0 ? `; ${retirados.length} permisos viejos retirados` : ''),
    )
  // Se avisa fuerte: un rol personalizado NO recibe los permisos nuevos de esta
  // release. Si hace falta, se agregan a mano desde la pantalla de Roles.
  if (rolesPersonalizadosOmitidos.length > 0)
    console.log(
      `Roles personalizados (el seed NO les tocó los permisos): ${rolesPersonalizadosOmitidos.join(', ')}`,
    )
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
