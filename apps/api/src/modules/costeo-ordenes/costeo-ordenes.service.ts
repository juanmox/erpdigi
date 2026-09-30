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
import { EditarLineaProduccionDto } from './dto/editar-linea-produccion.dto';

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
    // `enviada` sale del mismo criterio que usa Impresión de OPs. La pantalla lo
    // necesita para bloquear el checkbox de "En blanco": una vez capturada, el
    // valor quedó congelado en `consumo_papel` y tocarlo ya no cambia nada.
    return {
      ...orden,
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

  // consumo_en_blanco/factor_en_blanco ya existen desde F1 (default false/0.6),
  // pero el import de OP (arriba) nunca los toca — se importan siempre
  // apagados, a propósito: es una decisión que el operador de Diseño toma al
  // momento de imprimir/capturar consumo, no algo que se sepa de antemano al
  // cargar la OP. Este endpoint es la única forma de prenderlo, editable
  // libremente después de importar.
  async editarLineaProduccion(
    idLineaProduccion: number,
    dto: EditarLineaProduccionDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    // findFirst y no findUnique: una línea de otra empresa tiene que verse
    // como inexistente, no como existente-pero-prohibida.
    const linea = await this.prisma.lineaProduccion.findFirst({
      where: { idLineaProduccion, idEmpresa },
    });
    if (!linea)
      throw new NotFoundException('Línea de producción no encontrada');

    // El "en blanco" se CONGELA al capturar: `capturarUna()` calcula
    // `cantidad * factorEnBlanco` con el flag que la línea tenía en ese
    // instante y lo guarda en `consumo_papel.en_blanco_yd`. Cambiarlo después
    // no toca esa fila, así que dejarlo editable era una trampa: el reenvío es
    // idempotente (saltea las tallas ya enviadas), con lo cual alguien podía
    // prender el checkbox, reenviar, y creer razonablemente que lo había
    // corregido cuando no cambió nada. Encontrado en datos reales: la OP
    // 26OP012625 tiene líneas con el flag en true y `en_blanco_yd` en 0.
    const yaEnviada = await this.prisma.consumoPapel.findFirst({
      where: {
        idLineaProduccion,
        origen: 'PRODUCCION',
        anuladoEn: null,
      },
      select: { idConsumoPapel: true },
    });
    if (yaEnviada)
      throw new ConflictException(
        'Esta línea ya se envió a imprimir, así que el consumo en blanco quedó congelado como se capturó. Para cambiarlo hay que anular el envío y volver a capturarlo.',
      );

    const actualizada = await this.prisma.lineaProduccion.update({
      where: { idLineaProduccion },
      data: { consumoEnBlanco: dto.consumoEnBlanco },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.linea_produccion',
      idEntidad: String(idLineaProduccion),
      accion: 'UPDATE',
      datosNuevos: { consumoEnBlanco: actualizada.consumoEnBlanco },
    });

    return actualizada;
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

    const IDX_TALLA_INICIO = 18;

    // La columna "En blanco" se ubica por su encabezado (fila 4), no por
    // índice: ver la nota de ENCABEZADO_EN_BLANCO.
    const filaEncabezado = ws.getRow(FILA_INICIO_DATOS - 1);
    let idxEnBlanco = 0;
    filaEncabezado.eachCell((celda, col) => {
      if (
        textoCelda(celda.value).trim().toLowerCase() ===
        ENCABEZADO_EN_BLANCO.toLowerCase()
      )
        idxEnBlanco = col;
    });

    const crudo: {
      fila: number;
      op: string;
      cliente: string;
      lineaProducto: string;
      ordenCompra: string;
      fechaRecibidoOp: Date | null;
      fechaCompromisoOp: Date | null;
      codigoLine: string;
      producto: string;
      desarrollo: string;
      impresora: string;
      enguiamiento: unknown;
      fechaData: Date | null;
      fechaCliente: Date | null;
      fechaEntregar: Date | null;
      estatus: string;
      prioridad: string;
      imagen: string;
      /** null = la celda traía texto que no se pudo interpretar. */
      enBlanco: boolean | null;
      tallas: FilaTallaCantidad[];
    }[] = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber < FILA_INICIO_DATOS) return;
      const op = textoCelda(row.getCell(1).value).trim();
      if (!op) return;

      const tallas: FilaTallaCantidad[] = [];
      TALLAS_IMPORT_LINEAS.forEach((talla, i) => {
        const valor = row.getCell(IDX_TALLA_INICIO + i).value;
        const cantidad = valor == null || valor === '' ? 0 : Number(valor);
        if (Number.isFinite(cantidad) && cantidad > 0)
          tallas.push({ talla, cantidad });
      });

      crudo.push({
        fila: rowNumber,
        enBlanco: idxEnBlanco
          ? leerEnBlanco(row.getCell(idxEnBlanco).value)
          : false,
        op,
        cliente: textoCelda(row.getCell(2).value).trim(),
        lineaProducto: textoCelda(row.getCell(3).value).trim(),
        ordenCompra: textoCelda(row.getCell(4).value).trim(),
        fechaRecibidoOp: fechaCelda(row.getCell(5).value),
        fechaCompromisoOp: fechaCelda(row.getCell(6).value),
        codigoLine: textoCelda(row.getCell(7).value).trim(),
        producto: textoCelda(row.getCell(8).value).trim(),
        desarrollo: textoCelda(row.getCell(9).value).trim(),
        impresora: textoCelda(row.getCell(10).value).trim(),
        enguiamiento: row.getCell(11).value,
        fechaData: fechaCelda(row.getCell(12).value),
        fechaCliente: fechaCelda(row.getCell(13).value),
        fechaEntregar: fechaCelda(row.getCell(14).value),
        estatus: textoCelda(row.getCell(15).value).trim(),
        prioridad: textoCelda(row.getCell(16).value).trim(),
        imagen: textoCelda(row.getCell(17).value).trim(),
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
        // Solo los LINE de ESTA empresa: el código de línea es único por
        // empresa, así que marcar duplicado contra los de la otra rechazaría
        // importaciones perfectamente válidas.
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
    const codigosLineExistentes = new Set(
      existentesLine.map((l) => l.codigoLine),
    );

    const vistosLine = new Set<string>();
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
      const enguiamientoYd =
        r.enguiamiento == null || r.enguiamiento === ''
          ? 0
          : Number(r.enguiamiento);
      const totalPiezas = r.tallas.reduce((acc, t) => acc + t.cantidad, 0);

      let error: string | null = null;
      if (!opParsed)
        error = `OP "${r.op}" con formato inválido (esperado 26OP014154)`;
      else if (!r.codigoLine) error = 'Código de línea vacío';
      else if (vistosLine.has(r.codigoLine))
        error = 'Código de línea duplicado en el archivo';
      else if (codigosLineExistentes.has(r.codigoLine))
        error = 'Ya existe una línea de producción con ese código';
      else if (!r.cliente) error = 'Cliente vacío';
      else if (idCliente === null)
        error = `Cliente "${r.cliente}" no reconocido`;
      else if (r.lineaProducto && idLineaProducto === null)
        error = `Línea de producto "${r.lineaProducto}" no existe para el cliente "${r.cliente}" — dar de alta primero`;
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
      else if (!Number.isFinite(enguiamientoYd) || enguiamientoYd < 0)
        error = 'Enguiamiento inválido';
      else if (totalPiezas <= 0)
        error = 'Sin cantidad en ninguna talla reconocida';
      // Un typo en esa celda tiene que verse, no convertirse en un `false`
      // silencioso: es justo el dato que después no se puede corregir.
      else if (r.enBlanco === null)
        error =
          'La columna "En blanco" no se pudo interpretar (usá SI o NO, o dejala vacía)';
      if (r.codigoLine) vistosLine.add(r.codigoLine);

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
        codigoLine: r.codigoLine,
        productoCodigo: r.producto || null,
        idProducto,
        desarrollo: r.desarrollo || null,
        impresoraCodigo: r.impresora || null,
        idImpresora,
        enguiamientoYd: Number.isFinite(enguiamientoYd) ? enguiamientoYd : 0,
        fechaData: r.fechaData?.toISOString() ?? null,
        fechaCliente: r.fechaCliente?.toISOString() ?? null,
        fechaEntregar: r.fechaEntregar?.toISOString() ?? null,
        estatus: r.estatus || 'ABIERTO',
        prioridad: r.prioridad || null,
        imagen: r.imagen || null,
        tallas: r.tallas,
        totalPiezas,
        consumoEnBlanco: r.enBlanco === true,
        error,
      } satisfies FilaPreviewLinea;
    });

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
                creadoPor: idUsuarioActor,
              },
            });
            idOrdenPorCodigo.set(f.opTexto, creada.idOrdenProduccion);
            ordenesCreadas++;
          }
        }
        const idOrdenProduccion = idOrdenPorCodigo.get(f.opTexto)!;

        const linea = await tx.lineaProduccion.create({
          data: {
            codigoLine: f.codigoLine,
            idOrdenProduccion,
            // La FK compuesta de la base rechaza cualquier desajuste con la
            // empresa de la OP; esto solo se lo dice a Prisma.
            idEmpresa,
            idProducto: f.idProducto,
            idImpresora: f.idImpresora,
            enguiamientoYd: f.enguiamientoYd,
            fechaData: f.fechaData ? new Date(f.fechaData) : null,
            fechaRecibido: f.fechaRecibidoOp
              ? new Date(f.fechaRecibidoOp)
              : null,
            fechaCliente: f.fechaCliente ? new Date(f.fechaCliente) : null,
            fechaEntregar: f.fechaEntregar ? new Date(f.fechaEntregar) : null,
            estatus: f.estatus,
            imagen: f.imagen,
            prioridad: f.prioridad,
            // Viene de la plantilla: los operarios saben antes de imprimir
            // cuáles llevan papel en blanco. Se puede corregir desde Órdenes
            // hasta que la línea se envíe, momento en que queda congelado.
            consumoEnBlanco: f.consumoEnBlanco === true,
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
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Órdenes e ítems');
    const totalCols = 17 + TALLAS_IMPORT_LINEAS.length + 1;
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
      'Línea de producto es opcional, pero si se indica debe existir ya para ese Cliente (Cliente + Línea, ej. "BSN SPORTS" + "Basketball") — igual que Producto, si no existe la fila queda pendiente, no se crea automáticamente.';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };

    const headerRow = ws.getRow(4);
    headerRow.values = [
      'OP (ej. 26OP014154)',
      'Cliente (código)',
      'Línea de producto (nombre, opcional)',
      'Orden de compra',
      'Fecha recibido (OP)',
      'Fecha compromiso (OP)',
      'Código de línea',
      'Producto (código)',
      'Desarrollo',
      'Impresora (código, opcional)',
      'Enguiamiento (yd)',
      'Fecha data',
      'Fecha cliente',
      'Fecha entregar',
      'Estatus',
      'Prioridad (opcional)',
      'Imagen (opcional)',
      ...TALLAS_IMPORT_LINEAS,
      ENCABEZADO_EN_BLANCO,
    ];
    headerRow.eachCell(estiloEncabezado);
    const anchos = [
      16,
      16,
      22,
      14,
      14,
      14,
      16,
      16,
      12,
      20,
      12,
      12,
      12,
      12,
      12,
      12,
      16,
      ...TALLAS_IMPORT_LINEAS.map(() => 8),
      16,
    ];
    anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));

    return wb.xlsx.writeBuffer();
  }
}
