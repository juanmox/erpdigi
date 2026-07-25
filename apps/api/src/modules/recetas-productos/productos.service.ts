import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { textoCelda } from '../../common/excel-celda';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ReferenciasService } from '../recetas-referencias/referencias.service';
import {
  AgregarLineaRecetaDto,
  EditarLineaRecetaDto,
} from './dto/linea-receta.dto';
import { CambiarActivoProductoDto } from './dto/cambiar-activo-producto.dto';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { EditarProductoDto } from './dto/editar-producto.dto';
import { ListarProductosDto } from './dto/listar-productos.dto';

interface FiltrosInput {
  cliente?: number;
  deporte?: string;
  talla?: string;
  patron?: string;
  desarrollo?: string;
  q?: string;
}

function condiciones(
  filtros: FiltrosInput,
  estadoSql: Prisma.Sql | null,
  excluir?: keyof FiltrosInput,
): Prisma.Sql[] {
  const cond: Prisma.Sql[] = estadoSql ? [estadoSql] : [];
  if (filtros.cliente && excluir !== 'cliente')
    cond.push(Prisma.sql`p.id_cliente = ${filtros.cliente}`);
  if (filtros.deporte && excluir !== 'deporte')
    cond.push(Prisma.sql`lower(p.deporte) = lower(${filtros.deporte})`);
  if (filtros.talla && excluir !== 'talla')
    cond.push(Prisma.sql`p.tamano = ${filtros.talla}`);
  if (filtros.patron && excluir !== 'patron')
    cond.push(Prisma.sql`p.patron = ${filtros.patron}`);
  if (filtros.desarrollo && excluir !== 'desarrollo')
    cond.push(Prisma.sql`p.desarrollo = ${filtros.desarrollo}`);
  if (filtros.q) {
    const like = `%${filtros.q}%`;
    cond.push(
      Prisma.sql`(p.codigo ILIKE ${like} OR p.descripcion ILIKE ${like})`,
    );
  }
  return cond;
}

function whereSql(cond: Prisma.Sql[]): Prisma.Sql {
  return cond.length ? Prisma.join(cond, ' AND ') : Prisma.sql`TRUE`;
}

interface ProductoFila {
  id_producto: number;
  codigo: string;
  descripcion: string;
  desarrollo: string | null;
  tamano: string | null;
  deporte: string | null;
  patron: string | null;
  precio_venta: Prisma.Decimal;
  minutos_mo: Prisma.Decimal;
  costo_mo_minuto: Prisma.Decimal;
  id_cliente: number | null;
  activo: boolean;
  cliente_nombre: string | null;
  costo_unitario: Prisma.Decimal;
}

const AZUL_DIGITEXSA = 'FF203080';

function estiloEncabezado(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: AZUL_DIGITEXSA },
  };
  cell.alignment = { vertical: 'middle' };
}

export interface FilaPreviewAltaProducto {
  fila: number;
  codigo: string;
  descripcion: string;
  clienteCodigo: string | null;
  idCliente: number | null;
  desarrollo: string | null;
  patron: string | null;
  tamano: string | null;
  deporte: string | null;
  precioVenta: number | null;
  minutosMo: number | null;
  costoMoMinuto: number | null;
  error: string | null;
}

interface AltaProductoInput {
  codigo: string;
  descripcion: string;
  idCliente?: number | null;
  desarrollo?: string | null;
  patron?: string | null;
  tamano?: string | null;
  deporte?: string | null;
  precioVenta?: number;
  minutosMo?: number;
  costoMoMinuto?: number;
}

interface ReferenciaRecetas {
  clientes: { codigo: string; nombre: string }[];
  tallas: { nombre: string }[];
  deportes: { nombre: string }[];
  insumos: { codigo: string; descripcion: string; categoria: string }[];
}

@Injectable()
export class ProductosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly referencias: ReferenciasService,
  ) {}

  async listar(dto: ListarProductosDto) {
    const estado = dto.estado ?? 'activos';
    const estadoSql =
      estado === 'activos'
        ? Prisma.sql`p.activo = TRUE`
        : estado === 'inactivos'
          ? Prisma.sql`p.activo = FALSE`
          : null;
    const where = whereSql(condiciones(dto, estadoSql));
    const limit = Math.min(dto.limit ?? 500, 2000);

    const productos = await this.prisma.$queryRaw<ProductoFila[]>`
      SELECT p.id_producto, p.codigo, p.descripcion, p.desarrollo, p.tamano,
             p.deporte, p.patron, p.precio_venta, p.minutos_mo, p.costo_mo_minuto,
             p.id_cliente, p.activo,
             c.nombre AS cliente_nombre,
             round(v.costo_unitario, 4) AS costo_unitario
      FROM recetas.productos p
      JOIN recetas.v_producto_costo v ON v.id_producto = p.id_producto
      LEFT JOIN recetas.clientes c ON c.id_cliente = p.id_cliente
      WHERE ${where}
      ORDER BY p.codigo
      LIMIT ${limit}
    `;
    const [{ total }] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM recetas.productos p WHERE ${where}
    `;

    return {
      productos: productos.map((p) => ({
        idProducto: p.id_producto,
        codigo: p.codigo,
        descripcion: p.descripcion,
        desarrollo: p.desarrollo,
        tamano: p.tamano,
        deporte: p.deporte,
        patron: p.patron,
        precioVenta: p.precio_venta.toNumber(),
        minutosMo: p.minutos_mo.toNumber(),
        costoMoMinuto: p.costo_mo_minuto.toNumber(),
        idCliente: p.id_cliente,
        activo: p.activo,
        clienteNombre: p.cliente_nombre,
        costoUnitario: p.costo_unitario.toNumber(),
      })),
      total,
      limit,
    };
  }

  async filtros(dto: FiltrosInput) {
    const estadoSql = Prisma.sql`p.activo = TRUE`;

    const clientesQ = this.prisma.$queryRaw<{ id: number; nombre: string }[]>`
      SELECT DISTINCT c.id_cliente AS id, c.nombre
      FROM recetas.productos p JOIN recetas.clientes c ON c.id_cliente = p.id_cliente
      WHERE ${whereSql(condiciones(dto, estadoSql, 'cliente'))}
      ORDER BY c.nombre
    `;
    const deportesQ = this.prisma.$queryRaw<{ deporte: string }[]>`
      SELECT deporte FROM (
        SELECT DISTINCT ON (lower(p.deporte)) p.deporte
        FROM recetas.productos p
        WHERE ${whereSql(condiciones(dto, estadoSql, 'deporte'))} AND p.deporte IS NOT NULL
        ORDER BY lower(p.deporte), p.deporte
      ) sub ORDER BY deporte
    `;
    const tallasQ = this.prisma.$queryRaw<{ tamano: string }[]>`
      SELECT p.tamano FROM recetas.productos p
      LEFT JOIN recetas.tallas t ON t.nombre = p.tamano
      WHERE ${whereSql(condiciones(dto, estadoSql, 'talla'))} AND p.tamano IS NOT NULL
      GROUP BY p.tamano, t.orden
      ORDER BY COALESCE(t.orden, 999), p.tamano
    `;
    const patronesQ = this.prisma.$queryRaw<{ patron: string }[]>`
      SELECT DISTINCT p.patron FROM recetas.productos p
      WHERE ${whereSql(condiciones(dto, estadoSql, 'patron'))} AND p.patron IS NOT NULL
      ORDER BY p.patron
    `;
    const desarrollosQ = this.prisma.$queryRaw<{ desarrollo: string }[]>`
      SELECT DISTINCT p.desarrollo FROM recetas.productos p
      WHERE ${whereSql(condiciones(dto, estadoSql, 'desarrollo'))} AND p.desarrollo IS NOT NULL
      ORDER BY p.desarrollo
    `;

    const [clientes, deportes, tallas, patrones, desarrollos] =
      await Promise.all([
        clientesQ,
        deportesQ,
        tallasQ,
        patronesQ,
        desarrollosQ,
      ]);

    return {
      clientes,
      deportes: deportes.map((r) => r.deporte),
      tallas: tallas.map((r) => r.tamano),
      patrones: patrones.map((r) => r.patron),
      desarrollos: desarrollos.map((r) => r.desarrollo),
    };
  }

  async recetaPublica(codigo: string) {
    const [producto] = await this.prisma.$queryRaw<
      {
        id_producto: number;
        codigo: string;
        desarrollo: string | null;
        patron: string | null;
        descripcion: string;
        tamano: string | null;
        deporte: string | null;
        precio_venta: Prisma.Decimal;
        minutos_mo: Prisma.Decimal;
        costo_mo_minuto: Prisma.Decimal;
        cliente_codigo: string | null;
        cliente_nombre: string | null;
        costo_insumos: Prisma.Decimal;
        costo_mano_obra: Prisma.Decimal;
        costo_unitario: Prisma.Decimal;
      }[]
    >`
      SELECT p.id_producto, p.codigo, p.desarrollo, p.patron, p.descripcion,
             p.tamano, p.deporte, p.precio_venta, p.minutos_mo, p.costo_mo_minuto,
             c.codigo AS cliente_codigo, c.nombre AS cliente_nombre,
             round(v.costo_insumos, 4)  AS costo_insumos,
             round(v.costo_mano_obra, 2) AS costo_mano_obra,
             round(v.costo_unitario, 4)  AS costo_unitario
      FROM recetas.productos p
      LEFT JOIN recetas.clientes c ON c.id_cliente = p.id_cliente
      JOIN recetas.v_producto_costo v ON v.id_producto = p.id_producto
      WHERE p.codigo = ${codigo} AND p.activo = TRUE
    `;
    if (!producto) throw new NotFoundException('Producto no encontrado');

    const insumos = await this.prisma.$queryRaw<
      {
        categoria: string;
        orden: number;
        codigo: string;
        descripcion: string;
        consumo: Prisma.Decimal;
        unidad: string;
        area: string | null;
        costo_promedio: Prisma.Decimal;
        costo_total: Prisma.Decimal;
      }[]
    >`
      SELECT cat.nombre AS categoria, cat.orden,
             i.codigo, i.descripcion,
             pi.consumo, um.nombre AS unidad, ar.nombre AS area,
             round(i.costo_promedio, 6) AS costo_promedio,
             round(pi.consumo * i.costo_promedio, 6) AS costo_total
      FROM recetas.producto_insumos pi
      JOIN recetas.insumos i ON i.id_insumo = pi.id_insumo
      JOIN recetas.categorias_insumo cat ON cat.id_categoria = i.id_categoria
      JOIN recetas.unidades_medida um ON um.id_unidad = i.id_unidad
      LEFT JOIN recetas.areas_uso ar ON ar.id_area = pi.id_area
      WHERE pi.id_producto = ${producto.id_producto}
      ORDER BY cat.orden, i.codigo
    `;

    const manoObra = {
      categoria: 'Mano de obra',
      codigo: null,
      descripcion: 'Mano de obra',
      consumo: producto.minutos_mo.toNumber(),
      unidad: 'Minutos',
      area: 'Confeccion',
      costoPromedio: producto.costo_mo_minuto.toNumber(),
      costoTotal: producto.costo_mano_obra.toNumber(),
    };

    return {
      producto: {
        idProducto: producto.id_producto,
        codigo: producto.codigo,
        desarrollo: producto.desarrollo,
        patron: producto.patron,
        descripcion: producto.descripcion,
        tamano: producto.tamano,
        deporte: producto.deporte,
        precioVenta: producto.precio_venta.toNumber(),
        minutosMo: producto.minutos_mo.toNumber(),
        costoMoMinuto: producto.costo_mo_minuto.toNumber(),
        clienteCodigo: producto.cliente_codigo,
        clienteNombre: producto.cliente_nombre,
        costoInsumos: producto.costo_insumos.toNumber(),
        costoManoObra: producto.costo_mano_obra.toNumber(),
        costoUnitario: producto.costo_unitario.toNumber(),
      },
      insumos: insumos.map((i) => ({
        categoria: i.categoria,
        orden: i.orden,
        codigo: i.codigo,
        descripcion: i.descripcion,
        consumo: i.consumo.toNumber(),
        unidad: i.unidad,
        area: i.area,
        costoPromedio: i.costo_promedio.toNumber(),
        costoTotal: i.costo_total.toNumber(),
      })),
      manoObra,
    };
  }

  // ---------- Export de catálogo ----------

  async exportarExcel(dto: FiltrosInput): Promise<ExcelJS.Buffer> {
    const where = whereSql(condiciones(dto, Prisma.sql`p.activo = TRUE`));
    const rows = await this.prisma.$queryRaw<
      {
        codigo: string;
        descripcion: string;
        cliente: string | null;
        deporte: string | null;
        tamano: string | null;
        patron: string | null;
        desarrollo: string | null;
        precio_venta: Prisma.Decimal;
        costo_unitario: Prisma.Decimal;
      }[]
    >`
      SELECT p.codigo, p.descripcion, c.nombre AS cliente, p.deporte, p.tamano,
             p.patron, p.desarrollo, p.precio_venta,
             round(v.costo_unitario, 4) AS costo_unitario
      FROM recetas.productos p
      JOIN recetas.v_producto_costo v ON v.id_producto = p.id_producto
      LEFT JOIN recetas.clientes c ON c.id_cliente = p.id_cliente
      WHERE ${where}
      ORDER BY p.codigo
    `;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet('Productos');

    ws.mergeCells('A1:I1');
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Listado de productos';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells('A2:I2');
    ws.getCell('A2').value =
      `Generado: ${new Date().toLocaleString('es-GT')}   |   Total: ${rows.length}`;
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };

    const headerRow = ws.getRow(4);
    headerRow.values = [
      'Código',
      'Descripción',
      'Cliente',
      'Deporte',
      'Talla',
      'Patrón',
      'Desarrollo',
      'Precio venta (USD)',
      'Costo unitario (GTQ)',
    ];
    headerRow.eachCell(estiloEncabezado);

    for (const r of rows) {
      ws.addRow([
        r.codigo,
        r.descripcion,
        r.cliente,
        r.deporte,
        r.tamano,
        r.patron,
        r.desarrollo,
        r.precio_venta.toNumber(),
        r.costo_unitario.toNumber(),
      ]);
    }

    const anchos = [16, 48, 18, 14, 10, 20, 14, 16, 18];
    anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.getColumn(8).numFmt = '#,##0.00';
    ws.getColumn(9).numFmt = '#,##0.0000';
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 9 } };

    return wb.xlsx.writeBuffer();
  }

  // ---------- CRUD de cabecera ----------

  async crear(dto: CrearProductoDto, idUsuarioActor: number) {
    if (!(await this.referencias.deporteEsValido(dto.deporte))) {
      throw new BadRequestException(`Deporte "${dto.deporte}" no reconocido`);
    }
    try {
      const producto = await this.prisma.producto.create({
        data: {
          codigo: dto.codigo.trim(),
          descripcion: dto.descripcion.trim(),
          idCliente: dto.idCliente ?? null,
          desarrollo: dto.desarrollo?.trim() || null,
          patron: dto.patron?.trim() || null,
          tamano: dto.tamano?.trim() || null,
          deporte: dto.deporte?.trim() || null,
          precioVenta: dto.precioVenta ?? 0,
          minutosMo: dto.minutosMo ?? 0,
          costoMoMinuto: dto.costoMoMinuto ?? 0.33,
        },
      });
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'productos',
        idEntidad: String(producto.idProducto),
        accion: 'CREATE',
        datosNuevos: {
          idProducto: producto.idProducto,
          codigo: producto.codigo,
        },
      });
      return { idProducto: producto.idProducto };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002')
          throw new BadRequestException(
            `Ya existe un producto con el código "${dto.codigo}"`,
          );
        if (e.code === 'P2003')
          throw new BadRequestException('Cliente no existe');
      }
      throw e;
    }
  }

  async editar(id: number, dto: EditarProductoDto, idUsuarioActor: number) {
    const anterior = await this.prisma.producto.findUnique({
      where: { idProducto: id },
    });
    if (!anterior) throw new NotFoundException('Producto no encontrado');
    if (!(await this.referencias.deporteEsValido(dto.deporte))) {
      throw new BadRequestException(`Deporte "${dto.deporte}" no reconocido`);
    }
    try {
      await this.prisma.producto.update({
        where: { idProducto: id },
        data: {
          descripcion: dto.descripcion?.trim(),
          idCliente: dto.idCliente ?? null,
          desarrollo: dto.desarrollo?.trim() || null,
          patron: dto.patron?.trim() || null,
          tamano: dto.tamano?.trim() || null,
          deporte: dto.deporte?.trim() || null,
          precioVenta: dto.precioVenta,
          minutosMo: dto.minutosMo,
          costoMoMinuto: dto.costoMoMinuto,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException('Cliente no existe');
      }
      throw e;
    }
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'productos',
      idEntidad: String(id),
      accion: 'UPDATE',
      datosAnteriores: anterior,
      datosNuevos: dto as unknown as Record<string, unknown>,
    });
    return { actualizado: true };
  }

  async cambiarActivo(
    id: number,
    dto: CambiarActivoProductoDto,
    idUsuarioActor: number,
  ) {
    const anterior = await this.prisma.producto.findUnique({
      where: { idProducto: id },
    });
    if (!anterior) throw new NotFoundException('Producto no encontrado');
    await this.prisma.producto.update({
      where: { idProducto: id },
      data: { activo: dto.activo },
    });
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'productos',
      idEntidad: String(id),
      accion: 'UPDATE',
      datosAnteriores: { activo: anterior.activo },
      datosNuevos: { activo: dto.activo },
    });
    return { activo: dto.activo };
  }

  // ---------- Alta masiva de productos ----------

  async previewImportarAltas(
    buffer: Buffer,
  ): Promise<{ filas: FilaPreviewAltaProducto[] }> {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');

    const crudo: {
      fila: number;
      codigo: string;
      descripcion: string;
      clienteCodigo: string;
      desarrollo: string;
      patron: string;
      talla: string;
      deporte: string;
      precioCell: unknown;
      minutosCell: unknown;
      costoMoCell: unknown;
    }[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      crudo.push({
        fila: rowNumber,
        codigo: textoCelda(row.getCell(1).value).trim(),
        descripcion: textoCelda(row.getCell(2).value).trim(),
        clienteCodigo: textoCelda(row.getCell(3).value).trim(),
        desarrollo: textoCelda(row.getCell(4).value).trim(),
        patron: textoCelda(row.getCell(5).value).trim(),
        talla: textoCelda(row.getCell(6).value).trim(),
        deporte: textoCelda(row.getCell(7).value).trim(),
        precioCell: row.getCell(8).value,
        minutosCell: row.getCell(9).value,
        costoMoCell: row.getCell(10).value,
      });
    });

    const [clientes, tallas, deportes, existentes] = await Promise.all([
      this.prisma.cliente.findMany(),
      this.prisma.talla.findMany(),
      this.prisma.deporte.findMany(),
      this.prisma.producto.findMany({ select: { codigo: true } }),
    ]);
    const clientePorCodigo = new Map(
      clientes.map((c) => [c.codigo.toLowerCase(), c.idCliente]),
    );
    const tallasValidas = new Set(tallas.map((t) => t.nombre.toLowerCase()));
    const deportesValidos = new Set(
      deportes.map((d) => d.nombre.toLowerCase()),
    );
    const codigosExistentes = new Set(existentes.map((e) => e.codigo));

    const vistos = new Set<string>();
    const filas: FilaPreviewAltaProducto[] = crudo.map((r) => {
      const precio =
        r.precioCell == null || r.precioCell === '' ? 0 : Number(r.precioCell);
      const minutos =
        r.minutosCell == null || r.minutosCell === ''
          ? 0
          : Number(r.minutosCell);
      const costoMo =
        r.costoMoCell == null || r.costoMoCell === ''
          ? 0.33
          : Number(r.costoMoCell);

      let error: string | null = null;
      if (!r.codigo) error = 'Código vacío';
      else if (vistos.has(r.codigo)) error = 'Código duplicado en el archivo';
      else if (codigosExistentes.has(r.codigo))
        error = 'Ya existe un producto con ese código';
      else if (!r.descripcion) error = 'Descripción vacía';
      else if (
        r.clienteCodigo &&
        !clientePorCodigo.has(r.clienteCodigo.toLowerCase())
      )
        error = `Cliente "${r.clienteCodigo}" no reconocido`;
      else if (r.talla && !tallasValidas.has(r.talla.toLowerCase()))
        error = `Talla "${r.talla}" no reconocida`;
      else if (r.deporte && !deportesValidos.has(r.deporte.toLowerCase()))
        error = `Deporte "${r.deporte}" no reconocido`;
      else if (!Number.isFinite(precio) || precio < 0)
        error = 'Precio de venta inválido';
      else if (!Number.isFinite(minutos) || minutos < 0)
        error = 'Minutos de mano de obra inválidos';
      else if (!Number.isFinite(costoMo) || costoMo < 0)
        error = 'Costo de mano de obra por minuto inválido';
      if (r.codigo) vistos.add(r.codigo);

      return {
        fila: r.fila,
        codigo: r.codigo,
        descripcion: r.descripcion,
        clienteCodigo: r.clienteCodigo || null,
        idCliente: r.clienteCodigo
          ? (clientePorCodigo.get(r.clienteCodigo.toLowerCase()) ?? null)
          : null,
        desarrollo: r.desarrollo || null,
        patron: r.patron || null,
        tamano: r.talla || null,
        deporte: r.deporte || null,
        precioVenta: Number.isFinite(precio) ? precio : null,
        minutosMo: Number.isFinite(minutos) ? minutos : null,
        costoMoMinuto: Number.isFinite(costoMo) ? costoMo : null,
        error,
      };
    });

    return { filas };
  }

  async altas(altas: AltaProductoInput[], idUsuarioActor: number) {
    if (!altas || altas.length === 0)
      throw new BadRequestException('No hay altas para guardar');

    return this.prisma.$transaction(async (tx) => {
      const errores: { codigo: string; motivo: string }[] = [];
      let creados = 0;
      for (const a of altas) {
        try {
          await tx.producto.create({
            data: {
              codigo: a.codigo,
              descripcion: a.descripcion,
              idCliente: a.idCliente ?? null,
              desarrollo: a.desarrollo ?? null,
              patron: a.patron ?? null,
              tamano: a.tamano ?? null,
              deporte: a.deporte ?? null,
              precioVenta: a.precioVenta ?? 0,
              minutosMo: a.minutosMo ?? 0,
              costoMoMinuto: a.costoMoMinuto ?? 0.33,
            },
          });
          creados++;
        } catch (e) {
          const motivo =
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
              ? 'código ya existe'
              : 'error al insertar';
          errores.push({ codigo: a.codigo, motivo });
        }
      }
      if (errores.length > 0) {
        throw new BadRequestException({
          error: 'Hay altas con error, no se aplicó nada',
          detalle: errores,
        });
      }
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'productos',
        idEntidad: altas.map((a) => a.codigo).join(','),
        accion: 'CREATE',
        datosNuevos: { creados },
      });
      return { creados };
    });
  }

  async plantillaAlta(): Promise<ExcelJS.Buffer> {
    const [clientes, tallas, deportes] = await Promise.all([
      this.prisma.cliente.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.talla.findMany({ orderBy: { orden: 'asc' } }),
      this.prisma.deporte.findMany({ orderBy: { nombre: 'asc' } }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Altas de productos');
    ws.mergeCells('A1:J1');
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Alta masiva de productos';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells('A2:J2');
    ws.getCell('A2').value =
      'Completar una fila por producto nuevo. Cliente (código), Talla y Deporte ' +
      'son opcionales, pero si se llenan deben coincidir con la hoja "Clientes y tallas válidas".';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };
    const headerRow = ws.getRow(4);
    headerRow.values = [
      'Código',
      'Descripción',
      'Cliente (código)',
      'Desarrollo',
      'Patrón',
      'Talla',
      'Deporte',
      'Precio venta',
      'Minutos MO',
      'Costo MO/min',
    ];
    headerRow.eachCell(estiloEncabezado);
    const anchos = [16, 40, 16, 14, 16, 10, 14, 14, 12, 12];
    anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.getColumn(8).numFmt = '#,##0.00';
    ws.getColumn(10).numFmt = '#,##0.0000';
    ws.views = [{ state: 'frozen', ySplit: 4 }];

    const wsRef = wb.addWorksheet('Clientes y tallas válidas');
    wsRef.getRow(1).values = [
      'Código cliente',
      'Nombre cliente',
      'Talla',
      'Deporte',
    ];
    wsRef.getRow(1).font = { bold: true };
    const maxLen = Math.max(clientes.length, tallas.length, deportes.length);
    for (let i = 0; i < maxLen; i++) {
      wsRef.getRow(i + 2).getCell(1).value = clientes[i]?.codigo ?? '';
      wsRef.getRow(i + 2).getCell(2).value = clientes[i]?.nombre ?? '';
      wsRef.getRow(i + 2).getCell(3).value = tallas[i]?.nombre ?? '';
      wsRef.getRow(i + 2).getCell(4).value = deportes[i]?.nombre ?? '';
    }
    wsRef.getColumn(1).width = 16;
    wsRef.getColumn(2).width = 28;
    wsRef.getColumn(3).width = 10;
    wsRef.getColumn(4).width = 14;

    return wb.xlsx.writeBuffer();
  }

  // ---------- Líneas de receta (producto_insumos) ----------

  async listarLineasReceta(idProducto: number) {
    const rows = await this.prisma.$queryRaw<
      {
        id_producto_insumo: number;
        id_insumo: number;
        codigo: string;
        descripcion: string;
        categoria: string;
        orden_categoria: number;
        unidad: string;
        consumo: Prisma.Decimal;
        id_area: number | null;
        area: string | null;
      }[]
    >`
      SELECT pi.id_producto_insumo, pi.id_insumo, i.codigo, i.descripcion,
             cat.nombre AS categoria, cat.orden AS orden_categoria, um.nombre AS unidad,
             pi.consumo, pi.id_area, ar.nombre AS area
      FROM recetas.producto_insumos pi
      JOIN recetas.insumos i ON i.id_insumo = pi.id_insumo
      JOIN recetas.categorias_insumo cat ON cat.id_categoria = i.id_categoria
      JOIN recetas.unidades_medida um ON um.id_unidad = i.id_unidad
      LEFT JOIN recetas.areas_uso ar ON ar.id_area = pi.id_area
      WHERE pi.id_producto = ${idProducto}
      ORDER BY cat.orden, i.codigo
    `;
    return rows.map((r) => ({
      idProductoInsumo: r.id_producto_insumo,
      idInsumo: r.id_insumo,
      codigo: r.codigo,
      descripcion: r.descripcion,
      categoria: r.categoria,
      ordenCategoria: r.orden_categoria,
      unidad: r.unidad,
      consumo: r.consumo.toNumber(),
      idArea: r.id_area,
      area: r.area,
    }));
  }

  async agregarLineaReceta(
    idProducto: number,
    dto: AgregarLineaRecetaDto,
    idUsuarioActor: number,
  ) {
    const insumo = await this.prisma.insumo.findFirst({
      where: { idInsumo: dto.idInsumo, activo: true },
    });
    if (!insumo)
      throw new BadRequestException('El insumo no existe o está inactivo');
    try {
      const linea = await this.prisma.productoInsumo.create({
        data: {
          idProducto,
          idInsumo: dto.idInsumo,
          consumo: dto.consumo,
          idArea: dto.idArea ?? null,
        },
      });
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'producto_insumos',
        idEntidad: String(linea.idProductoInsumo),
        accion: 'CREATE',
        datosNuevos: {
          idProducto,
          idInsumo: dto.idInsumo,
          consumo: dto.consumo,
          idArea: dto.idArea,
        },
      });
      return { idProductoInsumo: linea.idProductoInsumo };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002')
          throw new BadRequestException(
            'Ese insumo ya está en la receta en esa misma área',
          );
        if (e.code === 'P2003')
          throw new BadRequestException('Producto, insumo o área no existe');
      }
      throw e;
    }
  }

  async editarLineaReceta(
    idProducto: number,
    idLinea: number,
    dto: EditarLineaRecetaDto,
    idUsuarioActor: number,
  ) {
    try {
      const r = await this.prisma.productoInsumo.updateMany({
        where: { idProductoInsumo: idLinea, idProducto },
        data: { consumo: dto.consumo, idArea: dto.idArea ?? null },
      });
      if (r.count === 0)
        throw new NotFoundException('Línea de receta no encontrada');
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002')
          throw new BadRequestException(
            'Ya existe otra línea con ese insumo en esa misma área',
          );
        if (e.code === 'P2003') throw new BadRequestException('Área no existe');
      }
      throw e;
    }
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'producto_insumos',
      idEntidad: String(idLinea),
      accion: 'UPDATE',
      datosNuevos: { consumo: dto.consumo, idArea: dto.idArea },
    });
    return { actualizado: true };
  }

  async eliminarLineaReceta(
    idProducto: number,
    idLinea: number,
    idUsuarioActor: number,
  ) {
    const r = await this.prisma.productoInsumo.deleteMany({
      where: { idProductoInsumo: idLinea, idProducto },
    });
    if (r.count === 0)
      throw new NotFoundException('Línea de receta no encontrada');
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'producto_insumos',
      idEntidad: String(idLinea),
      accion: 'DELETE',
      datosAnteriores: { idProducto, idProductoInsumo: idLinea },
    });
    return { eliminado: true };
  }

  // ---------- Import/export de recetas (Excel, dos hojas) ----------

  private async obtenerReferenciaRecetas(): Promise<ReferenciaRecetas> {
    const [clientes, tallas, deportes, insumos] = await Promise.all([
      this.prisma.cliente.findMany({
        orderBy: { nombre: 'asc' },
        select: { codigo: true, nombre: true },
      }),
      this.prisma.talla.findMany({
        orderBy: { orden: 'asc' },
        select: { nombre: true },
      }),
      this.prisma.deporte.findMany({
        orderBy: { nombre: 'asc' },
        select: { nombre: true },
      }),
      this.prisma.insumo.findMany({
        where: { activo: true },
        include: { categoria: true },
        orderBy: [{ categoria: { orden: 'asc' } }, { codigo: 'asc' }],
      }),
    ]);
    return {
      clientes,
      tallas,
      deportes,
      insumos: insumos.map((i) => ({
        codigo: i.codigo,
        descripcion: i.descripcion,
        categoria: i.categoria.nombre,
      })),
    };
  }

  private agregarHojaProductosReceta(
    wb: ExcelJS.Workbook,
    filas: (string | number | null)[][],
  ) {
    const ws = wb.addWorksheet('Productos');
    const headerRow = ws.getRow(1);
    headerRow.values = [
      'Código',
      'Descripción',
      'Cliente (código)',
      'Desarrollo',
      'Patrón',
      'Talla',
      'Deporte',
      'Precio venta',
      'Minutos MO',
      'Costo MO/min',
    ];
    headerRow.eachCell(estiloEncabezado);
    filas.forEach((f) => ws.addRow(f));
    const anchos = [16, 40, 16, 14, 16, 10, 14, 14, 12, 12];
    anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.getColumn(8).numFmt = '#,##0.00';
    ws.getColumn(10).numFmt = '#,##0.0000';
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return ws;
  }

  private agregarHojaLineasReceta(
    wb: ExcelJS.Workbook,
    filas: (string | number | null)[][],
  ) {
    const ws = wb.addWorksheet('Receta');
    const headerRow = ws.getRow(1);
    headerRow.values = [
      'Código de producto',
      'Código de insumo',
      'Consumo',
      'Área',
    ];
    headerRow.eachCell(estiloEncabezado);
    filas.forEach((f) => ws.addRow(f));
    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 12;
    ws.getColumn(4).width = 16;
    ws.getColumn(3).numFmt = '#,##0.000000';
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    return ws;
  }

  private agregarHojaReferenciaRecetas(
    wb: ExcelJS.Workbook,
    ref: ReferenciaRecetas,
  ) {
    const ws = wb.addWorksheet('Clientes, tallas, deportes e insumos válidos');
    ws.getRow(1).values = [
      'Código cliente',
      'Nombre cliente',
      'Talla',
      'Deporte',
      'Código insumo',
      'Descripción insumo',
      'Categoría insumo',
    ];
    ws.getRow(1).font = { bold: true };
    const maxLen = Math.max(
      ref.clientes.length,
      ref.tallas.length,
      ref.deportes.length,
      ref.insumos.length,
    );
    for (let i = 0; i < maxLen; i++) {
      ws.getRow(i + 2).getCell(1).value = ref.clientes[i]?.codigo ?? '';
      ws.getRow(i + 2).getCell(2).value = ref.clientes[i]?.nombre ?? '';
      ws.getRow(i + 2).getCell(3).value = ref.tallas[i]?.nombre ?? '';
      ws.getRow(i + 2).getCell(4).value = ref.deportes[i]?.nombre ?? '';
      ws.getRow(i + 2).getCell(5).value = ref.insumos[i]?.codigo ?? '';
      ws.getRow(i + 2).getCell(6).value = ref.insumos[i]?.descripcion ?? '';
      ws.getRow(i + 2).getCell(7).value = ref.insumos[i]?.categoria ?? '';
    }
    const anchos = [16, 24, 10, 14, 16, 36, 16];
    anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  }

  async plantillaRecetas(): Promise<ExcelJS.Buffer> {
    const ref = await this.obtenerReferenciaRecetas();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();
    this.agregarHojaProductosReceta(wb, []);
    this.agregarHojaLineasReceta(wb, []);
    this.agregarHojaReferenciaRecetas(wb, ref);
    return wb.xlsx.writeBuffer();
  }

  async exportarPlantillaReceta(
    idProducto: number,
  ): Promise<{ buffer: ExcelJS.Buffer; codigo: string }> {
    const p = await this.prisma.producto.findUnique({
      where: { idProducto },
      include: { cliente: true },
    });
    if (!p) throw new NotFoundException('Producto no encontrado');
    const lineas = await this.prisma.$queryRaw<
      { insumo_codigo: string; consumo: Prisma.Decimal; area: string | null }[]
    >`
      SELECT i.codigo AS insumo_codigo, pi.consumo, ar.nombre AS area
      FROM recetas.producto_insumos pi
      JOIN recetas.insumos i ON i.id_insumo = pi.id_insumo
      LEFT JOIN recetas.areas_uso ar ON ar.id_area = pi.id_area
      WHERE pi.id_producto = ${idProducto}
      ORDER BY i.codigo
    `;

    const ref = await this.obtenerReferenciaRecetas();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();
    this.agregarHojaProductosReceta(wb, [
      [
        p.codigo,
        p.descripcion,
        p.cliente?.codigo ?? '',
        p.desarrollo ?? '',
        p.patron ?? '',
        p.tamano ?? '',
        p.deporte ?? '',
        p.precioVenta.toNumber(),
        p.minutosMo.toNumber(),
        p.costoMoMinuto.toNumber(),
      ],
    ]);
    this.agregarHojaLineasReceta(
      wb,
      lineas.map((l) => [
        p.codigo,
        l.insumo_codigo,
        l.consumo.toNumber(),
        l.area ?? '',
      ]),
    );
    this.agregarHojaReferenciaRecetas(wb, ref);

    return { buffer: await wb.xlsx.writeBuffer(), codigo: p.codigo };
  }

  async previewImportarRecetas(buffer: Buffer) {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const wsProductos = wb.getWorksheet('Productos');
    const wsReceta = wb.getWorksheet('Receta');
    if (!wsReceta)
      throw new BadRequestException('El archivo debe tener una hoja "Receta"');

    const crudoProductos: {
      fila: number;
      codigo: string;
      descripcion: string;
      clienteCodigo: string;
      desarrollo: string;
      patron: string;
      talla: string;
      deporte: string;
      precioCell: unknown;
      minutosCell: unknown;
      costoMoCell: unknown;
    }[] = [];
    wsProductos?.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const codigo = textoCelda(row.getCell(1).value).trim();
      const descripcion = textoCelda(row.getCell(2).value).trim();
      if (!codigo && !descripcion) return;
      crudoProductos.push({
        fila: rowNumber,
        codigo,
        descripcion,
        clienteCodigo: textoCelda(row.getCell(3).value).trim(),
        desarrollo: textoCelda(row.getCell(4).value).trim(),
        patron: textoCelda(row.getCell(5).value).trim(),
        talla: textoCelda(row.getCell(6).value).trim(),
        deporte: textoCelda(row.getCell(7).value).trim(),
        precioCell: row.getCell(8).value,
        minutosCell: row.getCell(9).value,
        costoMoCell: row.getCell(10).value,
      });
    });

    const crudoReceta: {
      fila: number;
      productoCodigo: string;
      insumoCodigo: string;
      consumoCell: unknown;
      area: string;
    }[] = [];
    wsReceta.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const productoCodigo = textoCelda(row.getCell(1).value).trim();
      const insumoCodigo = textoCelda(row.getCell(2).value).trim();
      if (!productoCodigo && !insumoCodigo) return;
      crudoReceta.push({
        fila: rowNumber,
        productoCodigo,
        insumoCodigo,
        consumoCell: row.getCell(3).value,
        area: textoCelda(row.getCell(4).value).trim(),
      });
    });

    const [
      clientes,
      tallas,
      deportes,
      productosExistentes,
      insumosExistentes,
      areas,
    ] = await Promise.all([
      this.prisma.cliente.findMany(),
      this.prisma.talla.findMany(),
      this.prisma.deporte.findMany(),
      this.prisma.producto.findMany({ select: { codigo: true } }),
      this.prisma.insumo.findMany({
        where: { activo: true },
        select: { codigo: true },
      }),
      this.prisma.areaUso.findMany(),
    ]);
    const clientePorCodigo = new Map(
      clientes.map((c) => [c.codigo.toLowerCase(), c.idCliente]),
    );
    const tallasValidas = new Set(tallas.map((t) => t.nombre.toLowerCase()));
    const deportesValidos = new Set(
      deportes.map((d) => d.nombre.toLowerCase()),
    );
    const productosExistentesSet = new Set(
      productosExistentes.map((p) => p.codigo.toLowerCase()),
    );
    const insumosValidosSet = new Set(
      insumosExistentes.map((i) => i.codigo.toLowerCase()),
    );
    const areasValidasSet = new Set(areas.map((a) => a.nombre.toLowerCase()));

    const vistosProductos = new Set<string>();
    const codigosNuevosValidos = new Set<string>();
    const productos = crudoProductos.map((r) => {
      const precio =
        r.precioCell == null || r.precioCell === '' ? 0 : Number(r.precioCell);
      const minutos =
        r.minutosCell == null || r.minutosCell === ''
          ? 0
          : Number(r.minutosCell);
      const costoMo =
        r.costoMoCell == null || r.costoMoCell === ''
          ? 0.33
          : Number(r.costoMoCell);
      const yaExiste = productosExistentesSet.has(r.codigo.toLowerCase());

      let error: string | null = null;
      if (!r.codigo) error = 'Código vacío';
      else if (vistosProductos.has(r.codigo.toLowerCase()))
        error = 'Código duplicado en el archivo';
      else if (!yaExiste && !r.descripcion) error = 'Descripción vacía';
      else if (
        r.clienteCodigo &&
        !clientePorCodigo.has(r.clienteCodigo.toLowerCase())
      )
        error = `Cliente "${r.clienteCodigo}" no reconocido`;
      else if (r.talla && !tallasValidas.has(r.talla.toLowerCase()))
        error = `Talla "${r.talla}" no reconocida`;
      else if (r.deporte && !deportesValidos.has(r.deporte.toLowerCase()))
        error = `Deporte "${r.deporte}" no reconocido`;
      else if (!Number.isFinite(precio) || precio < 0)
        error = 'Precio de venta inválido';
      else if (!Number.isFinite(minutos) || minutos < 0)
        error = 'Minutos de mano de obra inválidos';
      else if (!Number.isFinite(costoMo) || costoMo < 0)
        error = 'Costo de mano de obra por minuto inválido';
      if (r.codigo) vistosProductos.add(r.codigo.toLowerCase());
      if (!error && !yaExiste) codigosNuevosValidos.add(r.codigo.toLowerCase());

      return {
        fila: r.fila,
        codigo: r.codigo,
        descripcion: r.descripcion,
        yaExiste,
        clienteCodigo: r.clienteCodigo || null,
        idCliente: r.clienteCodigo
          ? (clientePorCodigo.get(r.clienteCodigo.toLowerCase()) ?? null)
          : null,
        desarrollo: r.desarrollo || null,
        patron: r.patron || null,
        tamano: r.talla || null,
        deporte: r.deporte || null,
        precioVenta: Number.isFinite(precio) ? precio : null,
        minutosMo: Number.isFinite(minutos) ? minutos : null,
        costoMoMinuto: Number.isFinite(costoMo) ? costoMo : null,
        error,
      };
    });

    const receta = crudoReceta.map((r) => {
      const consumo = Number(r.consumoCell);
      const productoExisteYa = productosExistentesSet.has(
        r.productoCodigo.toLowerCase(),
      );
      const productoSeCreara = codigosNuevosValidos.has(
        r.productoCodigo.toLowerCase(),
      );

      let error: string | null = null;
      if (!r.productoCodigo) error = 'Código de producto vacío';
      else if (!productoExisteYa && !productoSeCreara)
        error = `Producto "${r.productoCodigo}" no existe ni se va a crear en este archivo`;
      else if (!r.insumoCodigo) error = 'Código de insumo vacío';
      else if (!insumosValidosSet.has(r.insumoCodigo.toLowerCase()))
        error = `Insumo "${r.insumoCodigo}" no reconocido o inactivo`;
      else if (!Number.isFinite(consumo) || consumo <= 0)
        error = 'Consumo inválido (debe ser numérico y mayor que 0)';
      else if (r.area && !areasValidasSet.has(r.area.toLowerCase()))
        error = `Área "${r.area}" no reconocida`;

      return {
        fila: r.fila,
        productoCodigo: r.productoCodigo,
        insumoCodigo: r.insumoCodigo,
        consumo: Number.isFinite(consumo) ? consumo : null,
        area: r.area || null,
        productoNuevo: !productoExisteYa && productoSeCreara,
        error,
      };
    });

    return { productos, receta };
  }

  async aplicarImportarRecetas(
    productosNuevos: AltaProductoInput[],
    lineasReceta: {
      productoCodigo: string;
      insumoCodigo: string;
      consumo: number;
      area?: string | null;
    }[],
    idUsuarioActor: number,
  ) {
    if (
      (!productosNuevos || productosNuevos.length === 0) &&
      (!lineasReceta || lineasReceta.length === 0)
    ) {
      throw new BadRequestException('No hay nada para aplicar');
    }

    const erroresProductos: { codigo: string; motivo: string }[] = [];
    const productosValidos: AltaProductoInput[] = [];
    for (const p of productosNuevos ?? []) {
      const codigo = String(p.codigo || '').trim();
      const descripcion = String(p.descripcion || '').trim();
      if (!codigo) erroresProductos.push({ codigo, motivo: 'código vacío' });
      else if (!descripcion)
        erroresProductos.push({ codigo, motivo: 'descripción vacía' });
      else productosValidos.push({ ...p, codigo, descripcion });
    }

    const erroresReceta: {
      productoCodigo: string;
      insumoCodigo: string;
      motivo: string;
    }[] = [];
    const recetaValida: {
      productoCodigo: string;
      insumoCodigo: string;
      consumo: number;
      area: string | null;
    }[] = [];
    for (const l of lineasReceta ?? []) {
      const productoCodigo = String(l.productoCodigo || '').trim();
      const insumoCodigo = String(l.insumoCodigo || '').trim();
      const consumo = Number(l.consumo);
      if (!productoCodigo)
        erroresReceta.push({
          productoCodigo,
          insumoCodigo,
          motivo: 'código de producto vacío',
        });
      else if (!insumoCodigo)
        erroresReceta.push({
          productoCodigo,
          insumoCodigo,
          motivo: 'código de insumo vacío',
        });
      else if (!Number.isFinite(consumo) || consumo <= 0)
        erroresReceta.push({
          productoCodigo,
          insumoCodigo,
          motivo: 'consumo inválido',
        });
      else
        recetaValida.push({
          productoCodigo,
          insumoCodigo,
          consumo,
          area: l.area || null,
        });
    }

    if (erroresProductos.length > 0 || erroresReceta.length > 0) {
      throw new BadRequestException({
        error: 'Hay datos inválidos, no se aplicó nada',
        detalleProductos: erroresProductos,
        detalleReceta: erroresReceta,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      for (const p of productosValidos) {
        await tx.$executeRaw`
          INSERT INTO recetas.productos (codigo, descripcion, id_cliente, desarrollo, patron, tamano, deporte,
                                          precio_venta, minutos_mo, costo_mo_minuto)
          VALUES (${p.codigo}, ${p.descripcion}, ${p.idCliente ?? null}, ${p.desarrollo ?? null}, ${p.patron ?? null},
                  ${p.tamano ?? null}, ${p.deporte ?? null}, ${p.precioVenta ?? 0}, ${p.minutosMo ?? 0}, ${p.costoMoMinuto ?? 0.33})
          ON CONFLICT (codigo) DO NOTHING
        `;
      }

      const codigosProducto = [
        ...new Set(recetaValida.map((l) => l.productoCodigo)),
      ];
      const codigosInsumo = [
        ...new Set(recetaValida.map((l) => l.insumoCodigo)),
      ];
      const [prodRows, insumoRows, areaRows] = await Promise.all([
        tx.producto.findMany({
          where: { codigo: { in: codigosProducto } },
          select: { idProducto: true, codigo: true },
        }),
        tx.insumo.findMany({
          where: { codigo: { in: codigosInsumo }, activo: true },
          select: { idInsumo: true, codigo: true },
        }),
        tx.areaUso.findMany(),
      ]);
      const idProductoPorCodigo = new Map(
        prodRows.map((r) => [r.codigo.toLowerCase(), r.idProducto]),
      );
      const idInsumoPorCodigo = new Map(
        insumoRows.map((r) => [r.codigo.toLowerCase(), r.idInsumo]),
      );
      const idAreaPorNombre = new Map(
        areaRows.map((r) => [r.nombre.toLowerCase(), r.idArea]),
      );

      const erroresAplicar: {
        productoCodigo: string;
        insumoCodigo: string;
        motivo: string;
      }[] = [];
      let aplicadas = 0;
      for (const l of recetaValida) {
        const idProducto = idProductoPorCodigo.get(
          l.productoCodigo.toLowerCase(),
        );
        const idInsumo = idInsumoPorCodigo.get(l.insumoCodigo.toLowerCase());
        const idArea = l.area
          ? idAreaPorNombre.get(l.area.toLowerCase())
          : null;
        if (!idProducto) {
          erroresAplicar.push({
            productoCodigo: l.productoCodigo,
            insumoCodigo: l.insumoCodigo,
            motivo: 'producto no encontrado',
          });
          continue;
        }
        if (!idInsumo) {
          erroresAplicar.push({
            productoCodigo: l.productoCodigo,
            insumoCodigo: l.insumoCodigo,
            motivo: 'insumo no encontrado o inactivo',
          });
          continue;
        }
        if (l.area && !idArea) {
          erroresAplicar.push({
            productoCodigo: l.productoCodigo,
            insumoCodigo: l.insumoCodigo,
            motivo: 'área no encontrada',
          });
          continue;
        }
        await tx.$executeRaw`
          INSERT INTO recetas.producto_insumos (id_producto, id_insumo, consumo, id_area)
          VALUES (${idProducto}, ${idInsumo}, ${l.consumo}, ${idArea ?? null})
          ON CONFLICT (id_producto, id_insumo, id_area) DO UPDATE SET consumo = EXCLUDED.consumo
        `;
        aplicadas++;
      }

      if (erroresAplicar.length > 0) {
        throw new BadRequestException({
          error: 'Hubo líneas que no se pudieron aplicar, no se aplicó nada',
          detalle: erroresAplicar,
        });
      }

      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'productos',
        idEntidad: productosValidos.map((p) => p.codigo).join(',') || '-',
        accion: 'CREATE',
        datosNuevos: {
          productosCreados: productosValidos.length,
          lineasAplicadas: aplicadas,
        },
      });

      return {
        productosCreados: productosValidos.length,
        lineasAplicadas: aplicadas,
      };
    });
  }
}
