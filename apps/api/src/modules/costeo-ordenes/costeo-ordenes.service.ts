import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { fechaCelda, textoCelda } from '../../common/excel-celda';
import { parsearCodigoOp } from '../../common/op-codigo';
import { mensajeOpNoEncontrada } from '../../common/op-otra-empresa';
import { separarCantidad } from '../../common/cantidad-linea';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  FilaPreviewLinea,
  FilaTallaCantidad,
  TALLAS_IMPORT_LINEAS,
} from './costeo-ordenes.types';
import { EditarLineaProduccionDto } from './dto/editar-linea-produccion.dto';
import { EditarOrdenProduccionDto } from './dto/editar-orden-produccion.dto';

const AZUL_DIGITEXSA = 'FF203080';
// La plantilla de plantillaImportarLineas() tiene título (fila 1) +
// instrucciones (fila 2, celda combinada) + fila en blanco (3) + encabezado
// (4) antes de los datos. Bug real encontrado en costeo-estandar con el
// mismo patrón de plantilla: al saltar solo la fila 1, las filas 2 y 4 se
// leían como si fueran datos (la celda combinada de instrucciones se lee
// igual en cada columna).
const FILA_INICIO_DATOS = 5;

/**
 * Encabezado de la columna "En blanco" de la plantilla de Órdenes.
 *
 * ⚠️ Va DESPUÉS de las columnas de talla, y el parser la ubica **por nombre de
 * encabezado**, no por índice fijo. Las dos cosas son deliberadas:
 *
 * - Ponerla antes de las tallas correría `IDX_TALLA_INICIO` y haría que un
 *   archivo armado con la plantilla vieja cargara cantidades en la talla
 *   equivocada, en silencio — el modo de falla que ya está advertido en el
 *   comentario de `TALLAS_IMPORT_LINEAS`.
 * - Buscarla por nombre la deja a salvo de la próxima talla que se agregue, que
 *   la correría de lugar si dependiera de un índice.
 *
 * Un archivo viejo simplemente no la trae: la columna no se encuentra y todas
 * las líneas quedan en `false`, que es el default histórico.
 */
const ENCABEZADO_EN_BLANCO = 'En blanco (SI/NO)';

/**
 * Las columnas de la plantilla se ubican POR NOMBRE de encabezado, no por
 * posición.
 *
 * Hasta 2026-10-07 se leían por índice fijo, y eso convertía cualquier cambio
 * de columnas en una trampa: quitar una del medio corre todas las siguientes,
 * así que un archivo armado con la plantilla anterior cargaba las cantidades en
 * la talla equivocada **sin ningún error** — el peor modo de falla posible acá.
 * Al quitar "Enguiamiento" e "Imagen" eso habría pasado de verdad.
 *
 * Con esto conviven las dos plantillas: la vieja trae columnas de más (se
 * ignoran) y el encabezado renombrado se reconoce por su alias. Cada clave
 * lista sus nombres aceptados ya normalizados (minúsculas, sin tildes).
 */
const ALIAS_COLUMNAS = {
  op: ['op (ej. 26op014154)', 'op'],
  cliente: ['cliente (codigo)', 'cliente'],
  // ⚠️ IGNORADA desde 2026-10-23. Esta columna era el tipo de prenda (Jersey,
  // Short…), que ahora se llama ESTILO y es del PRODUCTO, no de la orden: una
  // OP de uniforme mezcla Jersey y Short y un valor por orden no puede
  // representarlo. Los archivos ya armados la siguen trayendo; se reconoce para
  // que no cuente como columna desconocida, y se descarta — mismo trato que
  // "Código de línea" y "Enguiamiento".
  //
  // Los alias incluyen los nombres con los que existió ("Línea de producto",
  // y "Deporte" unas horas el 2026-10-07, ver `recetas.productos.deporte`).
  estiloIgnorado: [
    'linea de producto (nombre, opcional)',
    'linea de producto',
    'deporte (opcional)',
    'deporte',
    'estilo (opcional)',
    'estilo',
    'linea (opcional)',
    'linea',
  ],
  ordenCompra: ['orden de compra'],
  fechaRecibidoOp: ['fecha recibido (op)', 'fecha recibido'],
  fechaCompromisoOp: ['fecha compromiso (op)', 'fecha compromiso'],
  // "Código de línea" (el Item) SALIÓ de la plantilla el 2026-10-08: ahora lo
  // genera el servidor. Si un archivo viejo todavía la trae, se ignora —
  // decisión explícita del usuario, que prefirió eso a un aviso.

  producto: ['producto (codigo)', 'producto'],
  desarrollo: ['desarrollo'],
  impresora: ['impresora (codigo, opcional)', 'impresora'],
  fechaData: ['fecha data'],
  fechaCliente: ['fecha cliente'],
  fechaEntregar: ['fecha entregar'],
  estatus: ['estatus'],
  prioridad: ['prioridad (opcional)', 'prioridad'],
  enBlanco: [ENCABEZADO_EN_BLANCO.toLowerCase()],
} as const;

type ClaveColumna = keyof typeof ALIAS_COLUMNAS;

/** Sin tildes, sin dobles espacios y en minúsculas, para comparar encabezados. */
function normalizarEncabezado(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * El Item (`codigo_line`) lo genera el servidor desde el 2026-10-08: es la
 * orden de compra más un correlativo, `7011883171-1`, `-2`, `-3`…
 *
 * ⚠️ Arranca SIEMPRE en 1 y nunca en 0. El formato anterior usaba la orden de
 * compra pelada como correlativo 0 y seguía en `-2`; se cambió porque medir
 * los datos reales mostró que **6 de 67 órdenes de compra (9%) traían huecos**
 * en el correlativo escrito a mano (`0,2,3,4,5` · `2,3` · `2,4`…), y el
 * usuario confirmó que esos huecos son error humano, no un dato del cliente.
 *
 * Las líneas ya cargadas NO se renumeraron (decisión del usuario: el formato
 * viejo es el que ya viajó a los Google Sheets que leen los Dashboards), así
 * que las dos convenciones conviven y todo lo que calcule "dónde sigo" tiene
 * que entender las dos.
 */
function correlativoDeItem(
  codigoLine: string,
  ordenCompra: string,
): number | null {
  // Formato viejo: la orden de compra pelada era el correlativo 0.
  if (codigoLine === ordenCompra) return 0;
  if (!codigoLine.startsWith(`${ordenCompra}-`)) return null;
  const resto = codigoLine.slice(ordenCompra.length + 1);
  // La orden de compra puede traer guiones adentro (`7011685109-UA`), así que
  // esto solo acepta lo que queda DESPUÉS del prefijo completo y solo si son
  // dígitos: `...-UA-2` da 2, pero `...-UA-BIS` no es un correlativo.
  return /^\d+$/.test(resto) ? Number(resto) : null;
}

/**
 * Los estilos (Jersey, Short…) de una orden, sacados de los PRODUCTOS de sus
 * líneas. Es una LISTA y no un valor: una OP de uniforme mezcla Jersey y Short,
 * y un solo valor por orden no puede representarlo (por eso el estilo se movió
 * al producto el 2026-10-23).
 *
 * El estilo que algunas OP viejas traen guardado a nivel de orden (~1,800) es
 * HISTÓRICO: solo se usa si ninguno de los productos tiene el suyo cargado
 * todavía, para que esas órdenes no pierdan el dato a la vista.
 */
function estilosDeLaOrden(
  lineas: { producto?: { estilo?: { nombre: string } | null } | null }[],
  historico: string | null | undefined,
): string[] {
  const deProductos = [
    ...new Set(
      lineas
        .map((l) => l.producto?.estilo?.nombre)
        .filter((n): n is string => !!n),
    ),
  ].sort();
  if (deProductos.length > 0) return deProductos;
  return historico ? [historico] : [];
}

/**
 * Por dónde sigue la numeración de una orden de compra, mirando lo que ya está
 * guardado. Sin esto, agregar líneas a una OP ya cargada reiniciaría en 1 y
 * chocaría contra el `UNIQUE (id_empresa, codigo_line)`.
 */
function siguienteCorrelativo(
  ordenCompra: string,
  codigosExistentes: readonly string[],
): number {
  let mayor: number | null = null;
  for (const codigo of codigosExistentes) {
    const n = correlativoDeItem(codigo, ordenCompra);
    if (n !== null && (mayor === null || n > mayor)) mayor = n;
  }
  return mayor === null ? 1 : mayor + 1;
}

/**
 * Asigna el Item a cada fila válida, en el ORDEN DEL ARCHIVO, continuando la
 * numeración que ya exista para esa orden de compra.
 *
 * La usan el preview (para mostrar exactamente lo que se va a guardar) y el
 * aplicar, que lo REGENERA en vez de confiar en lo que vuelve del navegador
 * (convención #1). Que los dos pasen por acá es lo que garantiza que
 * coincidan.
 *
 * Las filas con error se saltean a propósito: si consumieran correlativo
 * dejarían justamente los huecos que este diseño vino a eliminar.
 */
function asignarItems(
  filas: {
    ordenCompraOp: string | null;
    error: string | null;
    codigoLine: string | null;
  }[],
  codigosExistentes: readonly string[],
): void {
  const siguientePorOc = new Map<string, number>();
  for (const f of filas) {
    if (f.error || !f.ordenCompraOp) continue;
    const oc = f.ordenCompraOp;
    const n =
      siguientePorOc.get(oc) ?? siguienteCorrelativo(oc, codigosExistentes);
    f.codigoLine = `${oc}-${n}`;
    siguientePorOc.set(oc, n + 1);
  }
}

/**
 * Las que sin nombre no se puede leer nada: el archivo está mal armado. El
 * segundo valor es el encabezado tal como se ve en la plantilla — los alias
 * están normalizados (minúsculas, sin tildes) y mostrarlos así en un error que
 * lee una persona se vería como un descuido.
 */
const COLUMNAS_OBLIGATORIAS: [ClaveColumna, string][] = [
  ['op', 'OP (ej. 26OP014154)'],
  ['cliente', 'Cliente (código)'],
  // La Orden de compra es obligatoria desde el 2026-10-08: el Item se deriva
  // de ella, así que sin ese dato no hay nada que generar.
  ['ordenCompra', 'Orden de compra'],
  ['producto', 'Producto (código)'],
];

/**
 * Resuelve el índice de cada columna leyendo la fila de encabezado, más el de
 * cada talla por su nombre.
 */
function resolverColumnas(ws: ExcelJS.Worksheet) {
  const porNombre = new Map<string, number>();
  const encabezado = ws.getRow(FILA_INICIO_DATOS - 1);
  encabezado.eachCell((cell, col) => {
    const n = normalizarEncabezado(textoCelda(cell.value));
    // El primero gana: si un nombre estuviera repetido, quedarse con el de más
    // a la izquierda es arbitrario pero estable.
    if (n && !porNombre.has(n)) porNombre.set(n, col);
  });

  const idx = {} as Record<ClaveColumna, number | null>;
  for (const [clave, alias] of Object.entries(ALIAS_COLUMNAS) as [
    ClaveColumna,
    readonly string[],
  ][]) {
    idx[clave] =
      alias.map((a) => porNombre.get(a)).find((c) => c != null) ?? null;
  }

  const faltan = COLUMNAS_OBLIGATORIAS.filter(([c]) => idx[c] == null);
  if (faltan.length > 0)
    throw new BadRequestException(
      `El archivo no tiene la fila de encabezado esperada en la fila ${FILA_INICIO_DATOS - 1}: ` +
        `faltan las columnas ${faltan.map(([, nombre]) => `"${nombre}"`).join(', ')}. ` +
        'Descargá la plantilla y copiá los datos ahí.',
    );

  // Cada talla por su propio nombre, así que agregar o quitar tallas de la
  // plantilla tampoco desalinea nada.
  const tallas = TALLAS_IMPORT_LINEAS.map((talla) => ({
    talla,
    col: porNombre.get(normalizarEncabezado(talla)) ?? null,
  })).filter((t): t is typeof t & { col: number } => t.col != null);

  // Columnas con encabezado que el import no sabe leer. Hace falta saberlas
  // para poder RECHAZAR una fila que ponga cantidades ahí: antes se ignoraban
  // en silencio y las piezas desaparecían sin ningún error (caso real: alguien
  // agregó a mano una columna `2XS` y la 26OP031793 cargaba 18 de 22).
  //
  // No se rechaza el archivo entero por tener una columna de más: una columna
  // extra VACÍA es inofensiva (notas, un cálculo auxiliar). Lo que se rechaza
  // es la fila que de verdad perdería cantidades.
  const conocidas = new Set<string>([
    ...Object.values(ALIAS_COLUMNAS).flat(),
    ...TALLAS_IMPORT_LINEAS.map((t) => normalizarEncabezado(t)),
    normalizarEncabezado(ENCABEZADO_EN_BLANCO),
  ]);
  const desconocidas: { nombre: string; col: number }[] = [];
  encabezado.eachCell((cell, col) => {
    const crudo = textoCelda(cell.value).trim();
    const n = normalizarEncabezado(crudo);
    if (n && !conocidas.has(n)) desconocidas.push({ nombre: crudo, col });
  });

  return { idx, tallas, desconocidas };
}

const EN_BLANCO_SI = ['si', 'sí', 's', 'x', '1', 'true', 'verdadero'];
const EN_BLANCO_NO = ['no', 'n', '0', 'false', 'falso'];

/**
 * Interpreta la celda "En blanco". Devuelve el valor, o `null` si tiene texto
 * que no se pudo interpretar — un typo tiene que ser un error visible, no un
 * `false` silencioso (mismo criterio que la validación de fechas del import de
 * Consumo Estándar).
 */
function leerEnBlanco(valor: ExcelJS.CellValue): boolean | null {
  if (valor === true) return true;
  if (valor === false) return false;
  const texto = textoCelda(valor).trim().toLowerCase();
  if (texto === '') return false;
  if (EN_BLANCO_SI.includes(texto)) return true;
  if (EN_BLANCO_NO.includes(texto)) return false;
  return null;
}

function estiloEncabezado(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: AZUL_DIGITEXSA },
  };
}

/** Modos del listado de Órdenes. `todas` incluye impresas y pendientes. */
export type EstadoListadoOrdenes = 'pendientes' | 'impresas' | 'todas';

@Injectable()
export class CosteoOrdenesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async buscarPorCodigo(codigo: string, idEmpresa: number, idUsuario: number) {
    const parsed = parsearCodigoOp(codigo);
    if (!parsed)
      throw new BadRequestException(
        'Código de OP inválido (formato esperado: 26OP014154)',
      );

    const orden = await this.prisma.ordenProduccion.findUnique({
      where: {
        idEmpresa_anio_correlativo: {
          idEmpresa,
          anio: parsed.anio,
          correlativo: parsed.correlativo,
        },
      },
      include: {
        cliente: true,
        // HISTÓRICO: el estilo de la orden ya no se captura (es del producto).
        // Se trae solo para el caso de una OP vieja cuyos productos aún no lo
        // tienen cargado — ver `estilosDeLaOrden`.
        estilo: { select: { nombre: true } },
        lineasProduccion: {
          include: {
            // Con el subcliente, para poder mostrar la marca en la ficha: al
            // fusionar un subcliente en su cliente padre la orden pasa a decir
            // el padre, y sin esto la marca desaparecería de la vista.
            producto: {
              include: {
                subcliente: { select: { nombre: true } },
                estilo: { select: { nombre: true } },
              },
            },
            tallas: { include: { talla: true } },
            // Solo para saber si la línea ya se envió a imprimir; `take: 1`
            // porque alcanza con que exista uno.
            consumosPapel: {
              where: { origen: 'PRODUCCION', anuladoEn: null },
              select: { idConsumoPapel: true },
              take: 1,
            },
          },
          orderBy: { idLineaProduccion: 'asc' },
        },
      },
    });
    if (!orden)
      throw new NotFoundException(
        await mensajeOpNoEncontrada(this.prisma, {
          codigo,
          anio: parsed.anio,
          correlativo: parsed.correlativo,
          idUsuario,
          idEmpresaActual: idEmpresa,
        }),
      );
    // `enviada` sale del mismo criterio que usa Impresión de OPs; la pantalla
    // la muestra como estado de la línea. Ya NO bloquea nada: el papel en
    // blanco es de la orden y vive en su propia fila de consumo, así que se
    // puede corregir después de enviar sin tocar lo ya capturado.
    const { estilo: estiloHistorico, ...ordenSinEstilo } = orden;
    return {
      ...ordenSinEstilo,
      estilos: estilosDeLaOrden(
        orden.lineasProduccion,
        estiloHistorico?.nombre,
      ),
      // Lista y no valor único: una orden puede mezclar prendas de un
      // subcliente con prendas directas del mismo cliente.
      subclientes: [
        ...new Set(
          orden.lineasProduccion
            .map((l) => l.producto?.subcliente?.nombre)
            .filter((n): n is string => !!n),
        ),
      ].sort(),
      // Decimal de Prisma serializa como string; la pantalla lo quiere número.
      enBlancoYd: Number(orden.enBlancoYd),
      lineasProduccion: orden.lineasProduccion.map(
        ({ consumosPapel, ...l }) => ({
          ...l,
          enviada: consumosPapel.length > 0,
        }),
      ),
    };
  }

  /**
   * Las OP cargadas, en forma tabular, filtradas por estado de impresión.
   *
   * La pantalla de Órdenes solo tenía un buscador por código, así que no había
   * manera de ver qué se cargó salvo recordar los números de memoria (reportado
   * por el usuario).
   *
   * "Pendiente" es el MISMO criterio que usa el panel de Impresión de OPs: una
   * línea sin ningún consumo de PRODUCCIÓN vigente. No se usa `procesadaEn`,
   * que se marca en el primer envío aunque queden tallas sueltas — si se usara,
   * una OP a medio enviar desaparecería de la lista con trabajo todavía por
   * hacer.
   *
   * Qué líneas se devuelven acompaña al modo, para que cada uno responda una
   * pregunta sola: `pendientes` trae solo lo que falta imprimir, `impresas` y
   * `todas` traen la orden completa. En los tres casos cada línea viene marcada
   * con `impresa`, que es lo que deja distinguirlas en el modo mixto.
   *
   * Se consulta por ORDEN y no por línea (a diferencia del panel de Impresión,
   * que agrupa por impresora) para que el `take` nunca parta una OP por la
   * mitad: se traen N órdenes completas.
   */
  async listarOrdenes(
    idEmpresa: number,
    estado: EstadoListadoOrdenes = 'pendientes',
    // 200 y no 50: el filtro de la tabla corre en el navegador sobre lo que se
    // trajo, así que un tope bajo hace que buscar una OP que quedó afuera diga
    // "ninguna coincide" aunque exista. Con el volumen real esto las cubre por
    // completo; si alguna vez se supera, la pantalla avisa cuántas quedaron
    // fuera y el buscador por código sigue encontrándolas.
    limite = 200,
  ) {
    const lineaPendiente = {
      consumosPapel: { none: { origen: 'PRODUCCION', anuladoEn: null } },
      // Mismo criterio que el panel de Impresión de OPs, incluido el "y con al
      // menos una talla": una línea sin tallas no se puede imprimir, así que no
      // es trabajo pendiente. Si los dos criterios divergen, las dos pantallas
      // dan respuestas distintas a la misma pregunta.
      tallas: { some: {} },
    } as const;

    // `some: {}` en los tres modos: una OP sin ninguna línea no tiene nada que
    // mostrar, y sin esto `impresas` la incluiría (un `every` sobre un conjunto
    // vacío siempre da verdadero).
    const whereOrden =
      estado === 'pendientes'
        ? { idEmpresa, lineasProduccion: { some: lineaPendiente } }
        : estado === 'impresas'
          ? {
              idEmpresa,
              lineasProduccion: { some: {} },
              NOT: { lineasProduccion: { some: lineaPendiente } },
            }
          : { idEmpresa, lineasProduccion: { some: {} } };

    const [ordenes, total] = await Promise.all([
      this.prisma.ordenProduccion.findMany({
        where: whereOrden,
        include: {
          cliente: { select: { nombre: true } },
          estilo: { select: { nombre: true } },
          lineasProduccion: {
            where: estado === 'pendientes' ? lineaPendiente : undefined,
            include: {
              producto: {
                select: {
                  codigo: true,
                  descripcion: true,
                  // Para mostrar la marca en la pantalla. Al fusionar un
                  // subcliente en su cliente padre, la orden deja de decir
                  // "Under Armour" y pasa a decir "BSN SPORTS"; sin esto la
                  // marca desaparece de la vista y parece dato perdido.
                  subcliente: { select: { nombre: true } },
                  // El estilo es del producto; la orden muestra los de sus líneas.
                  estilo: { select: { nombre: true } },
                },
              },
              impresora: { select: { codigo: true } },
              tallas: {
                include: { talla: { select: { nombre: true, orden: true } } },
              },
              // Solo para saber si la línea ya se imprimió; `take: 1` porque
              // alcanza con que exista uno, no hace falta traerlos todos.
              consumosPapel: {
                where: { origen: 'PRODUCCION', anuladoEn: null },
                select: { idConsumoPapel: true },
                take: 1,
              },
            },
            orderBy: { codigoLine: 'asc' },
          },
        },
        // Más recientes primero: lo recién importado es lo que se busca.
        orderBy: [{ anio: 'desc' }, { correlativo: 'desc' }],
        take: limite,
      }),
      this.prisma.ordenProduccion.count({ where: whereOrden }),
    ]);

    // Las columnas de talla se arman con las tallas REALMENTE presentes, no con
    // las 158 del catálogo. Con los datos de hoy son 10, o sea una matriz
    // parecida a la hoja de cálculo con la que ya trabajan.
    const tallasVistas = new Map<string, number>();
    for (const o of ordenes)
      for (const l of o.lineasProduccion)
        for (const t of l.tallas)
          if (!tallasVistas.has(t.talla.nombre))
            tallasVistas.set(t.talla.nombre, t.talla.orden ?? 0);

    const tallas = [...tallasVistas.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([nombre]) => nombre);

    return {
      estado,
      tallas,
      // Se informa el total real para que la pantalla pueda decir que hay más
      // de lo que muestra, en vez de dar a entender que eso es todo.
      totalOrdenes: total,
      ordenes: ordenes.map((o) => {
        const lineas = o.lineasProduccion.map((l) => {
          const cantidades: Record<string, number> = {};
          for (const t of l.tallas) cantidades[t.talla.nombre] = t.cantidad;
          // Las yardas de un servicio no son piezas: se informan aparte.
          const { piezas: totalPiezas, yardas: totalYardas } = separarCantidad(
            l.tallas.map((t) => ({
              talla: t.talla.nombre,
              cantidad: t.cantidad,
            })),
          );
          return {
            idLineaProduccion: l.idLineaProduccion,
            codigoLine: l.codigoLine,
            producto: l.producto.codigo,
            productoDescripcion: l.producto.descripcion,
            impresora: l.impresora?.codigo ?? null,
            fechaCliente: l.fechaCliente,
            fechaEntregar: l.fechaEntregar,
            impresa: l.consumosPapel.length > 0,
            cantidades,
            total: totalPiezas,
            totalYardas,
          };
        });
        return {
          idOrdenProduccion: o.idOrdenProduccion,
          codigo: o.codigo,
          cliente: o.cliente?.nombre ?? null,
          // Los distintos subclientes presentes en la orden. Es una LISTA y no
          // un valor porque una orden puede mezclar prendas de un subcliente
          // con prendas directas del mismo cliente (38 casos reales): poner
          // uno solo obligaría a elegir un bando.
          subclientes: [
            ...new Set(
              o.lineasProduccion
                .map((l) => l.producto?.subcliente?.nombre)
                .filter((n): n is string => !!n),
            ),
          ].sort(),
          estilos: estilosDeLaOrden(o.lineasProduccion, o.estilo?.nombre),
          ordenCompra: o.ordenCompra,
          fechaCompromiso: o.fechaCompromiso,
          lineas,
          totalPiezas: lineas.reduce((acc, l) => acc + l.total, 0),
          totalYardas: lineas.reduce((acc, l) => acc + l.totalYardas, 0),
          lineasImpresas: lineas.filter((l) => l.impresa).length,
        };
      }),
    };
  }

  listarClientes() {
    return this.prisma.cliente.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async previewImportarLineas(
    buffer: Buffer,
    idEmpresa: number,
  ): Promise<{ filas: FilaPreviewLinea[] }> {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');

    // TODAS las columnas por nombre de encabezado — ver ALIAS_COLUMNAS. Así
    // conviven la plantilla actual y la anterior (que traía "Enguiamiento" e
    // "Imagen", quitadas el 2026-10-07) sin que las tallas se desalineen.
    const { idx, tallas: colTallas, desconocidas } = resolverColumnas(ws);
    const texto = (row: ExcelJS.Row, c: ClaveColumna) =>
      idx[c] == null ? '' : textoCelda(row.getCell(idx[c]).value).trim();
    const fecha = (row: ExcelJS.Row, c: ClaveColumna) =>
      idx[c] == null ? null : fechaCelda(row.getCell(idx[c]).value);

    const crudo: {
      fila: number;
      op: string;
      cliente: string;
      ordenCompra: string;
      fechaRecibidoOp: Date | null;
      fechaCompromisoOp: Date | null;
      producto: string;
      desarrollo: string;
      impresora: string;
      fechaData: Date | null;
      fechaCliente: Date | null;
      fechaEntregar: Date | null;
      estatus: string;
      prioridad: string;
      /** null = la celda traía texto que no se pudo interpretar. */
      enBlanco: boolean | null;
      tallas: FilaTallaCantidad[];
      /** Columnas que el import no reconoce y que esta fila usó con cantidad. */
      tallasIgnoradas: string[];
    }[] = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber < FILA_INICIO_DATOS) return;
      const op = texto(row, 'op');
      if (!op) return;

      const tallas: FilaTallaCantidad[] = [];
      for (const { talla, col } of colTallas) {
        const valor = row.getCell(col).value;
        const cantidad = valor == null || valor === '' ? 0 : Number(valor);
        if (Number.isFinite(cantidad) && cantidad > 0)
          tallas.push({ talla, cantidad });
      }

      // Cantidades puestas en una columna que el import no sabe leer. Se
      // detectan por fila y no al abrir el archivo porque una columna extra
      // vacía es inofensiva; lo que no puede pasar inadvertido es una fila
      // que pierda piezas.
      const tallasIgnoradas: string[] = [];
      for (const { nombre, col } of desconocidas) {
        const valor = row.getCell(col).value;
        const n = valor == null || valor === '' ? 0 : Number(valor);
        if (Number.isFinite(n) && n > 0)
          tallasIgnoradas.push(`${nombre} (${n})`);
      }

      crudo.push({
        fila: rowNumber,
        // Sin la columna, la orden simplemente no lleva papel en blanco: es el
        // caso de un archivo armado antes de que esa columna existiera.
        enBlanco:
          idx.enBlanco == null
            ? false
            : leerEnBlanco(row.getCell(idx.enBlanco).value),
        op,
        cliente: texto(row, 'cliente'),
        ordenCompra: texto(row, 'ordenCompra'),
        fechaRecibidoOp: fecha(row, 'fechaRecibidoOp'),
        fechaCompromisoOp: fecha(row, 'fechaCompromisoOp'),
        producto: texto(row, 'producto'),
        desarrollo: texto(row, 'desarrollo'),
        impresora: texto(row, 'impresora'),
        fechaData: fecha(row, 'fechaData'),
        fechaCliente: fecha(row, 'fechaCliente'),
        fechaEntregar: fecha(row, 'fechaEntregar'),
        estatus: texto(row, 'estatus'),
        prioridad: texto(row, 'prioridad'),
        tallas,
        tallasIgnoradas,
      });
    });

    const [clientes, subclientes, productos, impresoras, existentesLine] =
      await Promise.all([
        // Se traen también los inactivos, con su estado: hace falta para que el
        // mensaje distinga "no existe" de "está retirado", que llevan a arreglos
        // distintos. Resolver uno retirado sería seguir alimentándolo.
        this.prisma.cliente.findMany({
          select: { idCliente: true, codigo: true, activo: true },
        }),
        // Un subcliente no se factura aparte, así que su código en la columna
        // Cliente resuelve al cliente PADRE. Existe para que las plantillas ya
        // armadas con `411` (Under Armour) sigan cargando sin retipear.
        this.prisma.subcliente.findMany({
          where: { activo: true, codigo: { not: null } },
          select: {
            codigo: true,
            nombre: true,
            idCliente: true,
            cliente: { select: { codigo: true, nombre: true } },
          },
        }),
        this.prisma.producto.findMany({
          select: { idProducto: true, codigo: true, desarrollo: true },
        }),
        this.prisma.impresora.findMany({
          select: { idImpresora: true, codigo: true },
        }),
        // Solo los Item de ESTA empresa — el UNIQUE es
        // `(id_empresa, codigo_line)`. Se usan para saber por dónde sigue la
        // numeración de cada orden de compra, no para marcar duplicados: el
        // Item ya no viene del archivo.
        this.prisma.lineaProduccion.findMany({
          where: { idEmpresa },
          select: { codigoLine: true },
        }),
      ]);
    const clientePorCodigo = new Map(
      clientes
        .filter((c) => c.activo)
        .map((c) => [c.codigo.toLowerCase(), c.idCliente]),
    );
    const clienteInactivoPorCodigo = new Map(
      clientes.filter((c) => !c.activo).map((c) => [c.codigo.toLowerCase(), c]),
    );
    // Si un código existiera como cliente Y como subcliente, gana el cliente:
    // se consulta este mapa solo cuando el de clientes no encontró nada. La
    // migración de subclientes aborta si el código sigue vivo en `clientes`,
    // así que el caso no debería poder darse.
    const subclientePorCodigo = new Map(
      subclientes
        .filter((sc) => !clientePorCodigo.has(sc.codigo!.toLowerCase()))
        .map((sc) => [sc.codigo!.toLowerCase(), sc]),
    );
    const productoPorCodigo = new Map(
      productos.map((p) => [p.codigo.toLowerCase(), p.idProducto]),
    );
    const desarrolloPorIdProducto = new Map(
      productos.map((p) => [p.idProducto, p.desarrollo]),
    );
    const impresoraPorCodigo = new Map(
      impresoras.map((i) => [i.codigo.toLowerCase(), i.idImpresora]),
    );
    const codigosExistentes = existentesLine.map((l) => l.codigoLine);

    // Dos OP del mismo archivo que compartan orden de compra generarían Item
    // idénticos y chocarían contra el UNIQUE. Hoy no pasa (0 casos en los
    // datos reales, y 1 orden de compra = 1 OP), pero al dejar de teclearse el
    // Item nada más lo impediría.
    const opPorOrdenCompra = new Map<string, string>();
    const ocDeOtraOp = new Set<number>();
    for (const r of crudo) {
      if (!r.ordenCompra || !r.op) continue;
      const duenia = opPorOrdenCompra.get(r.ordenCompra);
      if (duenia === undefined) opPorOrdenCompra.set(r.ordenCompra, r.op);
      else if (duenia !== r.op) ocDeOtraOp.add(r.fila);
    }
    const filas: FilaPreviewLinea[] = crudo.map((r) => {
      const opParsed = parsearCodigoOp(r.op);
      let aviso: string | null = null;
      let idCliente = r.cliente
        ? (clientePorCodigo.get(r.cliente.toLowerCase()) ?? null)
        : null;
      if (idCliente === null && r.cliente) {
        const sub = subclientePorCodigo.get(r.cliente.toLowerCase());
        if (sub) {
          idCliente = sub.idCliente;
          aviso =
            `"${r.cliente}" es ${sub.nombre}, un subcliente de ${sub.cliente.nombre}: ` +
            `la orden se carga a ${sub.cliente.codigo}. La marca sale del producto, no de esta columna.`;
        }
      }
      const idProducto = r.producto
        ? (productoPorCodigo.get(r.producto.toLowerCase()) ?? null)
        : null;
      const idImpresora = r.impresora
        ? (impresoraPorCodigo.get(r.impresora.toLowerCase()) ?? null)
        : null;
      const { piezas: totalPiezas, yardas: totalYardas } = separarCantidad(
        r.tallas,
      );

      let error: string | null = null;
      if (!opParsed)
        error = `OP "${r.op}" con formato inválido (esperado 26OP014154)`;
      // El Item ya no se teclea (lo genera el servidor), pero sale de la
      // orden de compra: sin ella no hay nada de qué derivarlo.
      else if (!r.ordenCompra) error = 'Orden de compra vacía';
      else if (ocDeOtraOp.has(r.fila))
        error = `La orden de compra "${r.ordenCompra}" ya la usa otra OP del archivo — los Item quedarían repetidos`;
      else if (!r.cliente) error = 'Cliente vacío';
      else if (idCliente === null)
        error = clienteInactivoPorCodigo.has(r.cliente.toLowerCase())
          ? `El cliente "${r.cliente}" está retirado, así que no se le pueden cargar órdenes nuevas`
          : `Cliente "${r.cliente}" no reconocido`;
      else if (!r.producto) error = 'Producto vacío';
      else if (idProducto === null)
        error = `Producto "${r.producto}" no existe en recetas — dar de alta primero`;
      // Desarrollo↔Producto es biunívoco (confirmado 2026-08-20 contra datos
      // reales) — si la fila trae un Desarrollo y el producto ya tiene uno
      // registrado, deben coincidir. Si el producto todavía no tiene
      // desarrollo cargado, no hay nada que validar todavía.
      else if (
        r.desarrollo &&
        desarrolloPorIdProducto.get(idProducto) &&
        r.desarrollo.trim().toLowerCase() !==
          desarrolloPorIdProducto.get(idProducto)!.trim().toLowerCase()
      )
        error = `Desarrollo "${r.desarrollo}" no coincide con el desarrollo ya registrado para "${r.producto}" ("${desarrolloPorIdProducto.get(idProducto)}")`;
      else if (r.impresora && idImpresora === null)
        error = `Impresora "${r.impresora}" no reconocida`;
      // Va ANTES del chequeo de totalPiezas a propósito: una fila cuya única
      // cantidad esté en una columna desconocida daría "Sin cantidad en
      // ninguna talla reconocida", que manda a buscar el problema donde no
      // está. Acá el mensaje nombra la columna y la cantidad que se perdería.
      else if (r.tallasIgnoradas.length > 0)
        error =
          `La columna ${r.tallasIgnoradas.join(', ')} no es una talla que el import reconozca, ` +
          'así que esas piezas no se cargarían. Usá la plantilla descargada tal cual, o pedí que se agregue esa talla.';
      // Una fila solo de YARDAS (servicio) no tiene piezas y es válida: lo que
      // se exige es que haya ALGUNA cantidad.
      else if (totalPiezas + totalYardas <= 0)
        error = 'Sin cantidad en ninguna talla reconocida';
      // Un typo en esa celda tiene que verse, no convertirse en un `false`
      // silencioso: es justo el dato que después no se puede corregir.
      else if (r.enBlanco === null)
        error =
          'La columna "En blanco" no se pudo interpretar (usá SI o NO, o dejala vacía)';

      return {
        fila: r.fila,
        opTexto: r.op,
        opAnio: opParsed?.anio ?? null,
        opCorrelativo: opParsed?.correlativo ?? null,
        clienteCodigo: r.cliente || null,
        idCliente,
        ordenCompraOp: r.ordenCompra || null,
        fechaRecibidoOp: r.fechaRecibidoOp?.toISOString() ?? null,
        fechaCompromisoOp: r.fechaCompromisoOp?.toISOString() ?? null,
        // Lo que se va a guardar, calculado acá para que el preview lo
        // muestre tal cual. Las filas con error no consumen correlativo: si
        // consumieran, quedarían los huecos que este cambio vino a eliminar.
        codigoLine: null as string | null,
        productoCodigo: r.producto || null,
        idProducto,
        desarrollo: r.desarrollo || null,
        impresoraCodigo: r.impresora || null,
        idImpresora,
        fechaData: r.fechaData?.toISOString() ?? null,
        fechaCliente: r.fechaCliente?.toISOString() ?? null,
        fechaEntregar: r.fechaEntregar?.toISOString() ?? null,
        estatus: r.estatus || 'ABIERTO',
        prioridad: r.prioridad || null,
        tallas: r.tallas,
        totalPiezas,
        totalYardas,
        consumoEnBlanco: r.enBlanco === true,
        error,
        // El aviso solo tiene sentido si la fila de verdad se va a importar.
        aviso: error ? null : aviso,
      } satisfies FilaPreviewLinea;
    });

    // El papel en blanco es de la ORDEN, pero la plantilla lo trae por fila:
    // si dos filas de la misma OP se contradicen no hay forma de saber cuál
    // vale, así que se marcan ambas en vez de elegir una en silencio.
    const valoresPorOp = new Map<string, Set<boolean>>();
    for (const f of filas) {
      if (f.error || !f.opTexto) continue;
      const set = valoresPorOp.get(f.opTexto) ?? new Set<boolean>();
      set.add(f.consumoEnBlanco === true);
      valoresPorOp.set(f.opTexto, set);
    }
    for (const f of filas) {
      if (f.error || !f.opTexto) continue;
      if ((valoresPorOp.get(f.opTexto)?.size ?? 0) > 1)
        f.error = `La OP ${f.opTexto} tiene filas con "${ENCABEZADO_EN_BLANCO}" distinto. El papel en blanco es por orden, no por línea: poné el mismo valor en todas las filas de la OP.`;
    }

    for (const f of await this.filasYaCargadas(filas, idEmpresa))
      f.error =
        `Este ítem ya está cargado en la OP ${f.opTexto} (mismo producto y mismas cantidades por talla). ` +
        'Si esta plantilla ya se subió antes, no hace falta volver a subirla; si de verdad es un ítem nuevo, ' +
        'cargalo aparte.';

    asignarItems(filas, codigosExistentes);

    return { filas };
  }

  /**
   * Marca con error las filas que YA están cargadas, para que volver a subir la
   * misma plantilla no duplique la orden.
   *
   * ⚠️ Esta guarda hace falta **desde el 2026-10-08**. Antes el Item venía
   * TECLEADO en la plantilla, así que `UNIQUE (id_empresa, codigo_line)`
   * rechazaba la segunda carga: la protección contra re-subir el archivo era un
   * *efecto secundario* de que el Item lo pusiera el cliente. Al pasar a
   * generarlo el servidor (`<orden de compra>-<n>`, continuando desde el
   * último), una re-subida genera `-4 -5 -6` y no choca con nada, así que
   * entraba en silencio — y la nota de ese cambio decía explícitamente que los
   * Item existentes ya no servían "para marcar duplicados", sin reemplazar la
   * protección por otra. Pasó de verdad el 2026-10-13: 16 filas cargadas 3
   * veces, 382 piezas fantasma esperando en la cola de impresión.
   *
   * ⚠️ El discriminador **no** es "hay dos líneas iguales": una plantilla puede
   * traer legítimamente dos filas idénticas (dos prendas iguales del mismo
   * pedido) y en los datos reales las trae. Es "esta fila ya existe en la base",
   * comparada por **multiplicidad**: si el archivo trae 2 filas iguales y la
   * base ya tiene 2, las 2 son duplicadas; si la base tiene 1, solo 1 lo es.
   * Así se sigue pudiendo agregar ítems nuevos a una OP ya cargada, que es un
   * caso legítimo y frecuente.
   */
  private async filasYaCargadas(
    filas: FilaPreviewLinea[],
    idEmpresa: number,
    // Recibe el cliente para poder correr DENTRO de la transacción del
    // `aplicar` — si leyera por fuera podría ver un estado distinto del que
    // está a punto de escribir. Mismo criterio que `resolverReemplazo()` en
    // costeo-estandar.
    cli: Pick<PrismaService, 'lineaProduccion'> = this.prisma,
  ): Promise<FilaPreviewLinea[]> {
    const candidatas = filas.filter(
      (f) => !f.error && f.opAnio !== null && f.opCorrelativo !== null,
    );
    if (candidatas.length === 0) return [];

    const lineasExistentes = await cli.lineaProduccion.findMany({
      where: {
        idEmpresa,
        ordenProduccion: {
          OR: [
            ...new Set(candidatas.map((f) => `${f.opAnio}|${f.opCorrelativo}`)),
          ].map((k) => {
            const [anio, correlativo] = k.split('|').map(Number);
            return { anio, correlativo };
          }),
        },
      },
      select: {
        ordenProduccion: { select: { anio: true, correlativo: true } },
        idProducto: true,
        tallas: {
          select: { cantidad: true, talla: { select: { nombre: true } } },
        },
      },
    });

    // La firma es la OP + el producto + el conjunto exacto de talla→cantidad.
    // Las tallas se comparan por NOMBRE porque es lo que trae el archivo, y
    // ordenadas para que el orden de las columnas no cambie la firma.
    const firma = (
      anio: number,
      correlativo: number,
      idProducto: number,
      tallas: { talla: string; cantidad: number }[],
    ) =>
      [
        anio,
        correlativo,
        idProducto,
        tallas
          .filter((t) => t.cantidad > 0)
          .map((t) => `${t.talla.toUpperCase()}:${t.cantidad}`)
          .sort()
          .join(','),
      ].join('|');

    const disponibles = new Map<string, number>();
    for (const l of lineasExistentes) {
      if (l.idProducto === null) continue;
      const k = firma(
        l.ordenProduccion.anio,
        l.ordenProduccion.correlativo,
        l.idProducto,
        l.tallas.map((t) => ({ talla: t.talla.nombre, cantidad: t.cantidad })),
      );
      disponibles.set(k, (disponibles.get(k) ?? 0) + 1);
    }
    if (disponibles.size === 0) return [];

    const duplicadas: FilaPreviewLinea[] = [];
    for (const f of candidatas) {
      if (f.idProducto === null) continue;
      const k = firma(f.opAnio!, f.opCorrelativo!, f.idProducto, f.tallas);
      const quedan = disponibles.get(k) ?? 0;
      if (quedan === 0) continue;
      disponibles.set(k, quedan - 1);
      duplicadas.push(f);
    }
    return duplicadas;
  }

  async aplicarImportarLineas(
    filas: FilaPreviewLinea[],
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    if (!filas || filas.length === 0)
      throw new BadRequestException('No hay líneas para importar');

    const tallas = await this.prisma.talla.findMany({
      where: { nombre: { in: [...TALLAS_IMPORT_LINEAS] } },
    });
    const idTallaPorNombre = new Map(tallas.map((t) => [t.nombre, t.idTalla]));

    const resultado = await this.prisma.$transaction(async (tx) => {
      // El Item se REGENERA acá y no se toma de lo que mandó el navegador: el
      // preview corre en el servidor, pero su salida pasa por el cliente y
      // vuelve. Se lee dentro de la transacción para que dos imports
      // simultáneos no calculen el mismo correlativo.
      const existentes = await tx.lineaProduccion.findMany({
        where: { idEmpresa },
        select: { codigoLine: true },
      });
      asignarItems(
        filas,
        existentes.map((l) => l.codigoLine),
      );
      for (const f of filas) {
        if (!f.codigoLine)
          throw new BadRequestException(
            `La fila ${f.fila} no tiene orden de compra, así que no se le puede asignar un Item`,
          );
      }

      // Se revalida acá, dentro de la transacción, y no solo en el preview: su
      // salida pasa por el navegador y vuelve. Esto es lo que de verdad frena
      // el accidente, porque cubre los dos caminos por los que llega una
      // plantilla repetida — un segundo clic en "Aplicar" sobre el mismo
      // diálogo ya abierto (el preview se corrió cuando todavía no estaba
      // cargada, así que venía sin error), y un POST armado a mano.
      const repetidas = await this.filasYaCargadas(filas, idEmpresa, tx);
      if (repetidas.length > 0) {
        const ops = [...new Set(repetidas.map((f) => f.opTexto))].join(', ');
        throw new BadRequestException(
          `${repetidas.length} de las ${filas.length} líneas ya están cargadas (OP ${ops}). ` +
            'Parece que esta plantilla ya se subió. Volvé a generar el preview para ver qué falta cargar.',
        );
      }

      const idOrdenPorCodigo = new Map<string, number>();
      let ordenesCreadas = 0;
      let lineasCreadas = 0;

      for (const f of filas) {
        if (
          f.opAnio == null ||
          f.opCorrelativo == null ||
          f.idCliente == null ||
          f.idProducto == null
        )
          continue;

        if (!idOrdenPorCodigo.has(f.opTexto)) {
          const existente = await tx.ordenProduccion.findUnique({
            where: {
              idEmpresa_anio_correlativo: {
                idEmpresa,
                anio: f.opAnio,
                correlativo: f.opCorrelativo,
              },
            },
          });
          if (existente) {
            idOrdenPorCodigo.set(f.opTexto, existente.idOrdenProduccion);
          } else {
            const creada = await tx.ordenProduccion.create({
              data: {
                idEmpresa,
                anio: f.opAnio,
                correlativo: f.opCorrelativo,
                idCliente: f.idCliente,
                ordenCompra: f.ordenCompraOp,
                fechaRecibido: f.fechaRecibidoOp
                  ? new Date(f.fechaRecibidoOp)
                  : null,
                fechaCompromiso: f.fechaCompromisoOp
                  ? new Date(f.fechaCompromisoOp)
                  : null,
                // El papel en blanco es por ORDEN, así que la columna de la
                // plantilla se lee por fila pero se guarda acá. El preview
                // rechaza los archivos donde dos filas de la misma OP se
                // contradicen, así que cualquier fila de la OP sirve.
                consumoEnBlanco: f.consumoEnBlanco === true,
                creadoPor: idUsuarioActor,
              },
            });
            idOrdenPorCodigo.set(f.opTexto, creada.idOrdenProduccion);
            ordenesCreadas++;
          }
        }
        const idOrdenProduccion = idOrdenPorCodigo.get(f.opTexto)!;

        // Ya quedó asignado por `asignarItems` y validado al entrar a la
        // transacción, antes de crear nada. El const es para que TypeScript lo
        // vea: el chequeo vive en otro bucle y no puede estrecharlo solo.
        const codigoLine = f.codigoLine;
        if (!codigoLine)
          throw new BadRequestException(`La fila ${f.fila} se quedó sin Item`);

        const linea = await tx.lineaProduccion.create({
          data: {
            codigoLine,
            idOrdenProduccion,
            // La FK compuesta de la base rechaza cualquier desajuste con la
            // empresa de la OP; esto solo se lo dice a Prisma.
            idEmpresa,
            idProducto: f.idProducto,
            idImpresora: f.idImpresora,
            fechaData: f.fechaData ? new Date(f.fechaData) : null,
            fechaRecibido: f.fechaRecibidoOp
              ? new Date(f.fechaRecibidoOp)
              : null,
            fechaCliente: f.fechaCliente ? new Date(f.fechaCliente) : null,
            fechaEntregar: f.fechaEntregar ? new Date(f.fechaEntregar) : null,
            estatus: f.estatus,
            prioridad: f.prioridad,
            creadoPor: idUsuarioActor,
          },
        });
        lineasCreadas++;

        const tallasValidas = f.tallas
          .map((t) => ({
            idTalla: idTallaPorNombre.get(t.talla),
            cantidad: t.cantidad,
          }))
          .filter(
            (t): t is { idTalla: number; cantidad: number } =>
              t.idTalla != null,
          );

        if (tallasValidas.length > 0) {
          await tx.lineaProduccionTalla.createMany({
            data: tallasValidas.map((t) => ({
              idLineaProduccion: linea.idLineaProduccion,
              idTalla: t.idTalla,
              cantidad: t.cantidad,
            })),
          });
        }
      }

      return { ordenesCreadas, lineasCreadas };
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.linea_produccion',
      idEntidad: 'import',
      accion: 'CREATE',
      datosNuevos: resultado,
    });

    return resultado;
  }

  async plantillaImportarLineas(): Promise<ExcelJS.Buffer> {
    // El catálogo de clientes va EN la plantilla, en una hoja aparte: sin él hay
    // que adivinar el código, que es justo lo que deja filas pendientes en el
    // preview. Mismo patrón que la hoja "Tipos de papel" del import de rollos.
    // (Ya no hay hoja de líneas de producto: el estilo es del producto.)
    const clientes = await this.prisma.cliente.findMany({
      where: { activo: true },
      select: { codigo: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Órdenes e ítems');
    const totalCols = 14 + TALLAS_IMPORT_LINEAS.length + 1;
    ws.mergeCells(1, 1, 1, totalCols);
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Carga de Órdenes de Producción e ítems (consumo de papel)';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells(2, 1, 2, totalCols);
    ws.getCell('A2').value =
      'Una fila por ítem/línea. Si varias filas comparten la misma OP, los datos de OP se toman de la primera fila donde aparece. ' +
      'Cliente y Producto deben coincidir con códigos ya existentes — un producto que no exista todavía queda pendiente en el preview, no se crea automáticamente. ' +
      'El tipo de prenda (estilo), la línea, el género y la composición son del PRODUCTO y se cargan en Gestión de datos → Productos, no acá. ' +
      'El Item lo asigna el sistema: es la Orden de compra más un correlativo que arranca en 1 (7011883171-1, -2, -3…), en el orden en que van las filas. Por eso la Orden de compra es obligatoria y el orden de las filas importa.';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };

    const headerRow = ws.getRow(4);
    headerRow.values = [
      'OP (ej. 26OP014154)',
      'Cliente (código)',
      'Orden de compra',
      'Fecha recibido (OP)',
      'Fecha compromiso (OP)',
      // Sin "Código de línea" (el Item) desde 2026-10-08: lo genera el
      // servidor como `<orden de compra>-<n>` con n arrancando en 1. Se quitó
      // porque el 9% de las órdenes de compra traía huecos en el correlativo
      // escrito a mano, y el usuario confirmó que eran error humano.
      'Producto (código)',
      'Desarrollo',
      'Impresora (código, opcional)',
      // Sin "Enguiamiento" ni "Imagen" desde 2026-10-07: el enguiamiento lo
      // calcula el servidor al capturar el consumo (el valor del archivo no
      // alimentaba ningún cálculo, solo un aviso de contraste que casi nunca
      // saltaba porque Diseño usa la misma fórmula), e "Imagen" no la mostraba
      // ninguna pantalla y venía vacía en las 253 líneas reales. Las columnas
      // siguen en la base para cuando exista el módulo de Producción.
      'Fecha data',
      'Fecha cliente',
      'Fecha entregar',
      'Estatus',
      'Prioridad (opcional)',
      ...TALLAS_IMPORT_LINEAS,
      ENCABEZADO_EN_BLANCO,
    ];
    headerRow.eachCell(estiloEncabezado);
    // 14 columnas fijas (antes 15: se quitó "Código de línea") + tallas
    // + "En blanco".
    const anchos = [
      16, // OP
      16, // Cliente
      14, // Orden de compra
      14, // Fecha recibido
      14, // Fecha compromiso
      16, // Producto
      12, // Desarrollo
      20, // Impresora
      12, // Fecha data
      12, // Fecha cliente
      12, // Fecha entregar
      12, // Estatus
      12, // Prioridad
      ...TALLAS_IMPORT_LINEAS.map(() => 8),
      16, // En blanco
    ];
    anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));

    // --- Hoja "Clientes": el código es lo que valida la columna Cliente ---
    const wsClientes = wb.addWorksheet('Clientes');
    const encClientes = wsClientes.getRow(1);
    encClientes.values = ['Código', 'Cliente'];
    encClientes.eachCell(estiloEncabezado);
    [14, 46].forEach((w, i) => (wsClientes.getColumn(i + 1).width = w));
    clientes.forEach((c) => wsClientes.addRow([c.codigo, c.nombre]));

    return wb.xlsx.writeBuffer();
  }

  // ========================================================================
  // Edición de órdenes ya cargadas — gateado `costeo.orden.editar` en el
  // controller (solo ADMIN/ADMIN_IT_COSTEO, o a quien se le asigne desde
  // /roles). Hoy la única forma de corregir una OP mal importada es SQL a
  // mano; esto lo trae a la pantalla.
  // ========================================================================

  /**
   * Catálogo de tallas para el editor de ítems. No se reusa `/recetas/tallas`
   * (gateado `recetas.catalogo.ver`) porque ADMIN_IT_COSTEO no lo tiene —
   * mismo motivo por el que el reporte de consumo arma sus propios
   * selectores en vez de llamar a endpoints de otros módulos.
   */
  listarTallasEdicion() {
    return this.prisma.talla.findMany({ orderBy: { orden: 'asc' } });
  }

  /** Búsqueda de productos activos para el autocompletar del editor de ítems. */
  async buscarProductosEdicion(q: string | undefined) {
    const texto = (q ?? '').trim();
    return this.prisma.producto.findMany({
      where: {
        activo: true,
        ...(texto
          ? {
              OR: [
                { codigo: { contains: texto, mode: 'insensitive' as const } },
                {
                  descripcion: {
                    contains: texto,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      select: { idProducto: true, codigo: true, descripcion: true },
      orderBy: { codigo: 'asc' },
      take: 50,
    });
  }

  /**
   * Edita el encabezado de una OP ya cargada.
   *
   * Cambiar la orden de compra RENOMBRA los Item de todas sus líneas (el
   * Item es `<OC>-n`, ver `correlativoDeItem`), así que se bloquea en cuanto
   * alguna línea ya se envió a impresión: ese Item ya viajó a los reportes y
   * al Google Sheet. Cambiar el cliente se bloquea si la OP está en una OF
   * vigente (una OF es de un solo cliente).
   */
  async editarOrden(
    id: number,
    dto: EditarOrdenProduccionDto,
    idEmpresa: number,
    idUsuarioActor: number,
  ) {
    const anterior = await this.prisma.ordenProduccion.findFirst({
      where: { idOrdenProduccion: id, idEmpresa },
      include: {
        lineasProduccion: {
          select: {
            idLineaProduccion: true,
            codigoLine: true,
            consumosPapel: {
              where: { origen: 'PRODUCCION', anuladoEn: null },
              select: { idConsumoPapel: true },
              take: 1,
            },
          },
        },
        ofOp: {
          where: { anuladoEn: null },
          select: { ordenFacturacion: { select: { codigo: true } } },
          take: 1,
        },
      },
    });
    if (!anterior)
      throw new NotFoundException('Orden de producción no encontrada');

    const data: Prisma.OrdenProduccionUpdateInput = {};

    if (dto.idCliente !== undefined && dto.idCliente !== anterior.idCliente) {
      if (anterior.ofOp.length > 0)
        throw new ConflictException(
          `Esta orden está asignada a la Orden de Facturación ${anterior.ofOp[0].ordenFacturacion.codigo} ` +
            '— una OF es de un solo cliente. Quitala de esa OF antes de cambiarle el cliente.',
        );
      const cliente = await this.prisma.cliente.findUnique({
        where: { idCliente: dto.idCliente },
      });
      if (!cliente || !cliente.activo)
        throw new BadRequestException('Cliente no existe o está retirado');
      data.cliente = { connect: { idCliente: dto.idCliente } };
    }

    // Renombrado de Item por cambio de orden de compra — se calcula ACÁ,
    // antes de la transacción, para poder rechazar con un mensaje claro si
    // alguna línea no encaja en el patrón esperado (no debería pasar nunca,
    // pero renombrar a ciegas sería peor que frenar).
    const renombres: { idLineaProduccion: number; codigoLineNuevo: string }[] =
      [];
    if (
      dto.ordenCompra !== undefined &&
      dto.ordenCompra.trim() !== anterior.ordenCompra
    ) {
      const nuevaOc = dto.ordenCompra.trim();
      const algunaEnviada = anterior.lineasProduccion.some(
        (l) => l.consumosPapel.length > 0,
      );
      if (algunaEnviada)
        throw new ConflictException(
          'No se puede cambiar la orden de compra: al menos un ítem ya se envió a impresión y ' +
            'su Item ya viajó a los reportes y al Google Sheet. Anulá esos envíos primero si de verdad hace falta.',
        );
      const ocYaUsada = await this.prisma.ordenProduccion.findFirst({
        where: {
          idEmpresa,
          ordenCompra: nuevaOc,
          idOrdenProduccion: { not: id },
        },
        select: { codigo: true },
      });
      if (ocYaUsada)
        throw new ConflictException(
          `La orden de compra "${nuevaOc}" ya la usa la OP ${ocYaUsada.codigo} (1 OC = 1 OP).`,
        );
      for (const l of anterior.lineasProduccion) {
        const n = correlativoDeItem(l.codigoLine, anterior.ordenCompra ?? '');
        if (n === null)
          throw new ConflictException(
            `El ítem ${l.codigoLine} no sigue el patrón esperado de la orden de compra actual — no se puede renombrar con seguridad.`,
          );
        renombres.push({
          idLineaProduccion: l.idLineaProduccion,
          codigoLineNuevo: n === 0 ? nuevaOc : `${nuevaOc}-${n}`,
        });
      }
      data.ordenCompra = nuevaOc;
    }

    if (dto.fechaRecibido !== undefined)
      data.fechaRecibido = dto.fechaRecibido
        ? new Date(dto.fechaRecibido)
        : null;
    if (dto.fechaCompromiso !== undefined)
      data.fechaCompromiso = dto.fechaCompromiso
        ? new Date(dto.fechaCompromiso)
        : null;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(data).length > 0)
          await tx.ordenProduccion.update({
            where: { idOrdenProduccion: id },
            data,
          });
        for (const r of renombres)
          await tx.lineaProduccion.update({
            where: { idLineaProduccion: r.idLineaProduccion },
            data: { codigoLine: r.codigoLineNuevo },
          });
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException(
          'La orden de compra nueva genera un Item que ya existe en otra orden.',
        );
      throw e;
    }

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.orden_produccion',
      idEntidad: String(id),
      accion: 'UPDATE',
      datosAnteriores: {
        idCliente: anterior.idCliente,
        ordenCompra: anterior.ordenCompra,
        fechaRecibido: anterior.fechaRecibido,
        fechaCompromiso: anterior.fechaCompromiso,
      },
      datosNuevos: {
        idCliente: dto.idCliente ?? anterior.idCliente,
        ordenCompra: dto.ordenCompra?.trim() ?? anterior.ordenCompra,
        fechaRecibido:
          dto.fechaRecibido !== undefined
            ? dto.fechaRecibido
            : anterior.fechaRecibido,
        fechaCompromiso:
          dto.fechaCompromiso !== undefined
            ? dto.fechaCompromiso
            : anterior.fechaCompromiso,
      },
    });

    return { actualizado: true };
  }

  /**
   * Edita un ítem (línea) de una OP ya cargada.
   *
   * `producto`/`tallas` se rechazan si el ítem ya tiene consumo de
   * PRODUCCIÓN vigente — se revalida acá, no solo en la pantalla (convención
   * #1): el consumo ya registrado se calculó con el producto y las
   * cantidades de ese momento.
   */
  async editarLinea(
    idLinea: number,
    dto: EditarLineaProduccionDto,
    idEmpresa: number,
    idUsuarioActor: number,
  ) {
    const anterior = await this.prisma.lineaProduccion.findFirst({
      where: { idLineaProduccion: idLinea, idEmpresa },
      include: {
        producto: { select: { codigo: true } },
        tallas: { select: { idTalla: true, cantidad: true } },
        consumosPapel: {
          where: { origen: 'PRODUCCION', anuladoEn: null },
          select: { idConsumoPapel: true },
          take: 1,
        },
      },
    });
    if (!anterior) throw new NotFoundException('Ítem no encontrado');

    if (
      anterior.consumosPapel.length > 0 &&
      (dto.idProducto !== undefined || dto.tallas !== undefined)
    )
      throw new ConflictException(
        'Este ítem ya se envió a impresión: el consumo de papel ya se calculó con su producto y sus tallas. ' +
          'Anulá ese envío desde Consumo de Papel antes de poder cambiarlos.',
      );

    const data: Prisma.LineaProduccionUpdateInput = {};

    if (dto.idProducto !== undefined) {
      const producto = await this.prisma.producto.findUnique({
        where: { idProducto: dto.idProducto },
      });
      if (!producto || !producto.activo)
        throw new BadRequestException('Producto no existe o está retirado');
      data.producto = { connect: { idProducto: dto.idProducto } };
    }

    if (dto.idImpresora !== undefined) {
      if (dto.idImpresora === null) {
        data.impresora = { disconnect: true };
      } else {
        const impresora = await this.prisma.impresora.findUnique({
          where: { idImpresora: dto.idImpresora },
        });
        if (!impresora) throw new BadRequestException('Impresora no existe');
        data.impresora = { connect: { idImpresora: dto.idImpresora } };
      }
    }

    if (dto.fechaData !== undefined)
      data.fechaData = dto.fechaData ? new Date(dto.fechaData) : null;
    if (dto.fechaCliente !== undefined)
      data.fechaCliente = dto.fechaCliente ? new Date(dto.fechaCliente) : null;
    if (dto.fechaEntregar !== undefined)
      data.fechaEntregar = dto.fechaEntregar
        ? new Date(dto.fechaEntregar)
        : null;
    if (dto.estatus !== undefined) data.estatus = dto.estatus;
    if (dto.prioridad !== undefined) data.prioridad = dto.prioridad;

    // Conjunto COMPLETO, no un delta — se valida ANTES de la transacción
    // para poder rechazar con un mensaje claro en vez de un 500 de FK.
    let tallasNuevas: { idTalla: number; cantidad: number }[] | null = null;
    if (dto.tallas !== undefined) {
      const ids = dto.tallas.map((t) => t.idTalla);
      if (new Set(ids).size !== ids.length)
        throw new BadRequestException(
          'Hay una talla repetida en la lista — cada talla va una sola vez.',
        );
      const existentes = await this.prisma.talla.count({
        where: { idTalla: { in: ids } },
      });
      if (existentes !== ids.length)
        throw new BadRequestException(
          'Alguna de las tallas no existe en el catálogo.',
        );
      tallasNuevas = dto.tallas;
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0)
        await tx.lineaProduccion.update({
          where: { idLineaProduccion: idLinea },
          data,
        });
      if (tallasNuevas) {
        await tx.lineaProduccionTalla.deleteMany({
          where: { idLineaProduccion: idLinea },
        });
        await tx.lineaProduccionTalla.createMany({
          data: tallasNuevas.map((t) => ({
            idLineaProduccion: idLinea,
            idTalla: t.idTalla,
            cantidad: t.cantidad,
          })),
        });
      }
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.linea_produccion',
      idEntidad: String(idLinea),
      accion: 'UPDATE',
      datosAnteriores: {
        producto: anterior.producto.codigo,
        tallas: anterior.tallas.length,
        idImpresora: anterior.idImpresora,
        estatus: anterior.estatus,
        prioridad: anterior.prioridad,
      },
      datosNuevos: {
        ...(dto.idProducto !== undefined ? { idProducto: dto.idProducto } : {}),
        ...(tallasNuevas ? { tallas: tallasNuevas.length } : {}),
        ...(dto.idImpresora !== undefined
          ? { idImpresora: dto.idImpresora }
          : {}),
        ...(dto.estatus !== undefined ? { estatus: dto.estatus } : {}),
        ...(dto.prioridad !== undefined ? { prioridad: dto.prioridad } : {}),
      },
    });

    return { actualizado: true };
  }

  /**
   * Elimina un ítem — solo si no tiene NINGÚN consumo de papel, ni siquiera
   * anulado: si lo tiene es historia real, no un error de carga, y la
   * convención de este proyecto es no borrar eso físicamente (ver
   * `costeo-rollos` para el mismo criterio con rollos consumidos fuera).
   */
  async eliminarLinea(
    idLinea: number,
    idEmpresa: number,
    idUsuarioActor: number,
  ) {
    const linea = await this.prisma.lineaProduccion.findFirst({
      where: { idLineaProduccion: idLinea, idEmpresa },
      include: {
        producto: { select: { codigo: true } },
        tallas: { select: { idTalla: true } },
        consumosPapel: { select: { idConsumoPapel: true }, take: 1 },
      },
    });
    if (!linea) throw new NotFoundException('Ítem no encontrado');
    if (linea.consumosPapel.length > 0)
      throw new ConflictException(
        'Este ítem tiene consumo de papel registrado (aunque esté anulado) y no se puede eliminar.',
      );

    // `linea_produccion_talla` tiene onDelete: Cascade hacia esta tabla —
    // no hace falta borrarlas antes.
    await this.prisma.lineaProduccion.delete({
      where: { idLineaProduccion: idLinea },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.linea_produccion',
      idEntidad: String(idLinea),
      accion: 'DELETE',
      datosAnteriores: {
        codigoLine: linea.codigoLine,
        producto: linea.producto.codigo,
        tallas: linea.tallas.length,
      },
    });

    return { eliminado: true };
  }

  /**
   * Elimina una OP entera — solo si no tiene consumo de papel, reposiciones
   * ni asignaciones de OF (ni anuladas). Con cualquiera de esas tres cosas
   * encima, la orden ya es historia real y la salida es corregirla, no
   * borrarla.
   */
  async eliminarOrden(id: number, idEmpresa: number, idUsuarioActor: number) {
    const orden = await this.prisma.ordenProduccion.findFirst({
      where: { idOrdenProduccion: id, idEmpresa },
      include: {
        lineasProduccion: { select: { idLineaProduccion: true } },
        consumosPapel: { select: { idConsumoPapel: true }, take: 1 },
        reposiciones: { select: { idReposicion: true }, take: 1 },
        ofOp: { select: { idOfOp: true }, take: 1 },
      },
    });
    if (!orden)
      throw new NotFoundException('Orden de producción no encontrada');
    if (orden.consumosPapel.length > 0)
      throw new ConflictException(
        'Esta orden tiene consumo de papel registrado (aunque esté anulado) y no se puede eliminar.',
      );
    if (orden.reposiciones.length > 0)
      throw new ConflictException(
        'Esta orden tiene reposiciones registradas y no se puede eliminar.',
      );
    if (orden.ofOp.length > 0)
      throw new ConflictException(
        'Esta orden está o estuvo asignada a una Orden de Facturación y no se puede eliminar.',
      );

    await this.prisma.$transaction(async (tx) => {
      // onDelete: Cascade cubre linea_produccion_talla; linea_produccion no
      // tiene cascade hacia orden_produccion (y no debería), así que las
      // líneas se borran explícitamente antes.
      await tx.lineaProduccion.deleteMany({
        where: { idOrdenProduccion: id },
      });
      await tx.ordenProduccion.delete({ where: { idOrdenProduccion: id } });
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.orden_produccion',
      idEntidad: String(id),
      accion: 'DELETE',
      datosAnteriores: {
        codigo: orden.codigo,
        ordenCompra: orden.ordenCompra,
        idCliente: orden.idCliente,
        lineas: orden.lineasProduccion.length,
      },
    });

    return { eliminado: true };
  }
}
