import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { fechaCelda, textoCelda } from '../../common/excel-celda';
import { parsearCodigoOp } from '../../common/op-codigo';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  FilaPreviewLinea,
  FilaTallaCantidad,
  TALLAS_IMPORT_LINEAS,
} from './costeo-ordenes.types';
import { CrearLineaProductoDto } from './dto/crear-linea-producto.dto';

const AZUL_DIGITEXSA = 'FF203080';

function estiloEncabezado(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: AZUL_DIGITEXSA },
  };
}

@Injectable()
export class CosteoOrdenesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async buscarPorCodigo(codigo: string) {
    const parsed = parsearCodigoOp(codigo);
    if (!parsed)
      throw new BadRequestException(
        'Código de OP inválido (formato esperado: 26OP014154)',
      );

    const orden = await this.prisma.ordenProduccion.findUnique({
      where: {
        anio_correlativo: {
          anio: parsed.anio,
          correlativo: parsed.correlativo,
        },
      },
      include: {
        cliente: true,
        lineaProducto: true,
        lineasProduccion: {
          include: { producto: true, tallas: { include: { talla: true } } },
          orderBy: { idLineaProduccion: 'asc' },
        },
      },
    });
    if (!orden)
      throw new NotFoundException(`No existe la orden de producción ${codigo}`);
    return orden;
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
  ): Promise<{ filas: FilaPreviewLinea[] }> {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');

    const IDX_TALLA_INICIO = 18;

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
      tallas: FilaTallaCantidad[];
    }[] = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
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
          select: { idProducto: true, codigo: true },
        }),
        this.prisma.impresora.findMany({
          select: { idImpresora: true, codigo: true },
        }),
        this.prisma.lineaProduccion.findMany({ select: { codigoLine: true } }),
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
      else if (r.impresora && idImpresora === null)
        error = `Impresora "${r.impresora}" no reconocida`;
      else if (!Number.isFinite(enguiamientoYd) || enguiamientoYd < 0)
        error = 'Enguiamiento inválido';
      else if (totalPiezas <= 0)
        error = 'Sin cantidad en ninguna talla reconocida';
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
        error,
      } satisfies FilaPreviewLinea;
    });

    return { filas };
  }

  async aplicarImportarLineas(
    filas: FilaPreviewLinea[],
    idUsuarioActor: number,
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
              anio_correlativo: {
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
                anio: f.opAnio,
                correlativo: f.opCorrelativo,
                idCliente: f.idCliente,
                idLineaProducto: f.idLineaProducto,
                ordenCompra: f.ordenCompraOp,
                desarrollo: f.desarrollo,
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
    const totalCols = 17 + TALLAS_IMPORT_LINEAS.length;
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
    ];
    anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));

    return wb.xlsx.writeBuffer();
  }
}
