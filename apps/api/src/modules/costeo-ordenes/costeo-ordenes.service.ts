import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { fechaCelda, textoCelda } from '../../common/excel-celda';
import { parsearCodigoOp } from '../../common/op-codigo';
import { mensajeOpNoEncontrada } from '../../common/op-otra-empresa';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  FilaPreviewLinea,
  FilaTallaCantidad,
  TALLAS_IMPORT_LINEAS,
} from './costeo-ordenes.types';
import { CrearLineaProductoDto } from './dto/crear-linea-producto.dto';

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
  // ⚠️ Esta columna NO es el deporte. Es `costeo.linea_producto`, la
  // agrupación comercial POR CLIENTE heredada del legacy (donde el campo
  // CLIENTE traía "BSN Basketball", "BSN Jersey"), y por eso contiene también
  // prendas como Jersey o Short.
  //
  // Llegó a llamarse "Deporte" unas horas el 2026-10-07 y se revirtió el mismo
  // día: el deporte REAL vive en `recetas.productos.deporte`, validado contra
  // el catálogo `recetas.deportes`. Dos campos llamados igual —uno de ellos
  // sin catálogo cerrado— eran la receta para que una estadística por deporte
  // diera números distintos según de dónde se leyera.
  //
  // Los cuatro alias se conservan para que cargue cualquier archivo ya armado,
  // con el nombre de siempre o con el que existió ese rato.
  lineaProducto: [
    'linea de producto (nombre, opcional)',
    'linea de producto',
    'deporte (opcional)',
    'deporte',
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

  return { idx, tallas };
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
        lineaProducto: true,
        lineasProduccion: {
          include: {
            producto: true,
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
    return {
      ...orden,
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
          lineaProducto: { select: { nombre: true } },
          lineasProduccion: {
            where: estado === 'pendientes' ? lineaPendiente : undefined,
            include: {
              producto: { select: { codigo: true, descripcion: true } },
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
          let totalPiezas = 0;
          for (const t of l.tallas) {
            cantidades[t.talla.nombre] = t.cantidad;
            totalPiezas += t.cantidad;
          }
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
          };
        });
        return {
          idOrdenProduccion: o.idOrdenProduccion,
          codigo: o.codigo,
          cliente: o.cliente?.nombre ?? null,
          lineaProducto: o.lineaProducto?.nombre ?? null,
          ordenCompra: o.ordenCompra,
          fechaCompromiso: o.fechaCompromiso,
          lineas,
          totalPiezas: lineas.reduce((acc, l) => acc + l.total, 0),
          lineasImpresas: lineas.filter((l) => l.impresa).length,
        };
      }),
    };
  }

  listarClientes() {
    return this.prisma.cliente.findMany({ orderBy: { nombre: 'asc' } });
  }

  listarLineasProducto() {
    return this.prisma.lineaProducto.findMany({
      include: { cliente: true },
      orderBy: [{ cliente: { nombre: 'asc' } }, { nombre: 'asc' }],
    });
  }

  // Cliente + Línea de producto vienen colapsados en un solo campo de texto
  // libre en el sistema legacy (ANEXO_A_Hallazgos.md §2.3) — acá quedan
  // separados en catálogos con FK. A diferencia de Producto (que tiene alta
  // en /catalogo con receta/costos asociados), Línea de producto es un
  // catálogo liviano sin relaciones adicionales, así que se da de alta
  // directo, sin flujo de aprobación.
  async crearLineaProducto(dto: CrearLineaProductoDto, idUsuarioActor: number) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { idCliente: dto.idCliente },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const existente = await this.prisma.lineaProducto.findUnique({
      where: {
        idCliente_nombre: { idCliente: dto.idCliente, nombre: dto.nombre },
      },
    });
    if (existente)
      throw new ConflictException(
        `Ya existe la línea "${dto.nombre}" para este cliente`,
      );

    const linea = await this.prisma.lineaProducto.create({
      data: { idCliente: dto.idCliente, nombre: dto.nombre },
      include: { cliente: true },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.linea_producto',
      idEntidad: String(linea.idLineaProducto),
      accion: 'CREATE',
      datosNuevos: { idCliente: dto.idCliente, nombre: dto.nombre },
    });

    return linea;
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
    const { idx, tallas: colTallas } = resolverColumnas(ws);
    const texto = (row: ExcelJS.Row, c: ClaveColumna) =>
      idx[c] == null ? '' : textoCelda(row.getCell(idx[c]).value).trim();
    const fecha = (row: ExcelJS.Row, c: ClaveColumna) =>
      idx[c] == null ? null : fechaCelda(row.getCell(idx[c]).value);

    const crudo: {
      fila: number;
      op: string;
      cliente: string;
      lineaProducto: string;
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
        lineaProducto: texto(row, 'lineaProducto'),
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
      });
    });

    const [clientes, lineasProducto, productos, impresoras, existentesLine] =
      await Promise.all([
        this.prisma.cliente.findMany({
          select: { idCliente: true, codigo: true },
        }),
        this.prisma.lineaProducto.findMany({
          select: { idLineaProducto: true, idCliente: true, nombre: true },
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
      clientes.map((c) => [c.codigo.toLowerCase(), c.idCliente]),
    );
    const lineaProductoPorClienteYNombre = new Map(
      lineasProducto.map((l) => [
        `${l.idCliente}::${l.nombre.toLowerCase()}`,
        l.idLineaProducto,
      ]),
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
      const idCliente = r.cliente
        ? (clientePorCodigo.get(r.cliente.toLowerCase()) ?? null)
        : null;
      const idLineaProducto =
        r.lineaProducto && idCliente != null
          ? (lineaProductoPorClienteYNombre.get(
              `${idCliente}::${r.lineaProducto.toLowerCase()}`,
            ) ?? null)
          : null;
      const idProducto = r.producto
        ? (productoPorCodigo.get(r.producto.toLowerCase()) ?? null)
        : null;
      const idImpresora = r.impresora
        ? (impresoraPorCodigo.get(r.impresora.toLowerCase()) ?? null)
        : null;
      const totalPiezas = r.tallas.reduce((acc, t) => acc + t.cantidad, 0);

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
        error = `Cliente "${r.cliente}" no reconocido`;
      else if (r.lineaProducto && idLineaProducto === null)
        error = `Línea de producto "${r.lineaProducto}" no existe para el cliente "${r.cliente}" — dar de alta primero desde Órdenes de Producción → "Líneas de producto"`;
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
      else if (totalPiezas <= 0)
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
        lineaProductoNombre: r.lineaProducto || null,
        idLineaProducto,
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
        consumoEnBlanco: r.enBlanco === true,
        error,
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

    asignarItems(filas, codigosExistentes);

    return { filas };
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
                idLineaProducto: f.idLineaProducto,
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
    // Los catálogos van EN la plantilla, en hojas aparte: sin ellos hay que
    // adivinar el código del cliente y el nombre exacto de la línea, que es
    // justo lo que deja filas pendientes en el preview. Mismo patrón que la
    // hoja "Tipos de papel" del import de rollos.
    const [clientes, lineas] = await Promise.all([
      this.prisma.cliente.findMany({
        select: { codigo: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.lineaProducto.findMany({
        select: {
          nombre: true,
          cliente: { select: { codigo: true, nombre: true } },
        },
        orderBy: [{ cliente: { nombre: 'asc' } }, { nombre: 'asc' }],
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Órdenes e ítems');
    const totalCols = 15 + TALLAS_IMPORT_LINEAS.length + 1;
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
      'Línea de producto es opcional, pero si se indica debe existir ya para ese Cliente — ver las hojas "Clientes" y "Líneas de producto". Igual que Producto, si no existe la fila queda pendiente y no se crea automáticamente. ' +
      'El Item lo asigna el sistema: es la Orden de compra más un correlativo que arranca en 1 (7011883171-1, -2, -3…), en el orden en que van las filas. Por eso la Orden de compra es obligatoria y el orden de las filas importa.';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };

    const headerRow = ws.getRow(4);
    headerRow.values = [
      'OP (ej. 26OP014154)',
      'Cliente (código)',
      // NO es el deporte — ver la nota de ALIAS_COLUMNAS. El parser acepta los
      // dos nombres, así que cualquier archivo ya armado sigue cargando.
      'Línea de producto (nombre, opcional)',
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
      22, // Línea de producto
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

    // --- Hoja "Líneas de producto": el valor válido depende del CLIENTE ---
    //
    // Por eso lleva las dos columnas y no solo el nombre: la misma línea de dos
    // clientes son dos registros distintos, así que una lista suelta de nombres
    // haría elegir una que no existe para ese cliente.
    const wsLineas = wb.addWorksheet('Líneas de producto');
    const encLineas = wsLineas.getRow(1);
    encLineas.values = ['Cliente (código)', 'Cliente', 'Línea de producto'];
    encLineas.eachCell(estiloEncabezado);
    [18, 40, 28].forEach((w, i) => (wsLineas.getColumn(i + 1).width = w));
    lineas.forEach((l) =>
      wsLineas.addRow([l.cliente.codigo, l.cliente.nombre, l.nombre]),
    );
    if (lineas.length === 0)
      wsLineas.addRow([
        '',
        '',
        'Todavía no hay líneas dadas de alta — se crean desde Órdenes de Producción → "Líneas de producto".',
      ]);

    return wb.xlsx.writeBuffer();
  }
}
