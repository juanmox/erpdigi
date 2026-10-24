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
import { CambiarActivoProductoDto } from './dto/cambiar-activo-producto.dto';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { EditarProductoDto } from './dto/editar-producto.dto';
import { ListarProductosDto } from './dto/listar-productos.dto';

interface FiltrosInput {
  cliente?: number;
  deporte?: string;
  estilo?: number;
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
  if (filtros.estilo && excluir !== 'estilo')
    cond.push(Prisma.sql`p.id_estilo = ${filtros.estilo}`);
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

// Identifica qué columna violó una restricción única (P2002) — desde que
// Producto.desarrollo también es único (biunívoco con Producto), no se
// puede asumir que un P2002 siempre es por "código". Con Prisma 7 +
// driver adapters (@prisma/adapter-pg) el campo real NO vive en
// `meta.target` (la forma "clásica" documentada) sino anidado en
// `meta.driverAdapterError.cause.constraint.fields` — verificado con un
// P2002 real disparado a propósito. En vez de depender de esa forma
// exacta (que podría volver a cambiar), se busca el nombre del campo como
// substring en todo el `meta` serializado — el nombre de la restricción en
// Postgres siempre lo incluye (ej. "productos_desarrollo_key").
function violacionUnicaIncluyeCampo(meta: unknown, campo: string): boolean {
  try {
    return JSON.stringify(meta ?? {})
      .toLowerCase()
      .includes(campo.toLowerCase());
  } catch {
    return false;
  }
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
  id_subcliente: number | null;
  id_estilo: number | null;
  id_linea: number | null;
  id_genero: number | null;
  id_composicion: number | null;
  activo: boolean;
  cliente_nombre: string | null;
  subcliente_nombre: string | null;
  estilo_nombre: string | null;
  linea_nombre: string | null;
  genero_nombre: string | null;
  composicion_nombre: string | null;
  costo_unitario: Prisma.Decimal;
  /// Estado del desarrollo asignado (NULL si el producto no tiene uno).
  estado_desarrollo: string | null;
}

const AZUL_DIGITEXSA = 'FF203080';
// La plantilla de plantillaAlta() (y las demás plantillas de este proyecto)
// tiene título (fila 1) + instrucciones (fila 2, celda combinada) + fila en
// blanco (3) + encabezado (4) antes de los datos. Bug real encontrado en
// costeo-estandar/costeo-ordenes con el mismo patrón: al saltar solo la
// fila 1, las filas 2 y 4 se leían como si fueran datos.
const FILA_INICIO_DATOS = 5;

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
  // Atributos de estadística (columnas 11-14 de la plantilla, al final para no
  // mover las existentes). Lo que se escribió y a qué id resolvió.
  estilo: string | null;
  idEstilo: number | null;
  linea: string | null;
  idLinea: number | null;
  genero: string | null;
  idGenero: number | null;
  composicion: string | null;
  idComposicion: number | null;
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
  idEstilo?: number | null;
  idLinea?: number | null;
  idGenero?: number | null;
  idComposicion?: number | null;
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
      -- ⚠️ El JOIN (no LEFT JOIN) contra v_producto_costo solo es seguro
      -- mientras esa vista devuelva una fila por producto, incluidos los que
      -- no tienen desarrollo. Si alguien la redefine y eso se rompe, los
      -- productos afectados desaparecen del catálogo sin ningún error visible.
      SELECT p.id_producto, p.codigo, p.descripcion, p.desarrollo, p.tamano,
             p.deporte, p.patron, p.precio_venta,
             -- Mano de obra: del desarrollo (las columnas de productos son
             -- legacy de 01_erp desde 2026-08-26).
             COALESCE(d.minutos_mo, 0)      AS minutos_mo,
             COALESCE(d.costo_mo_minuto, 0) AS costo_mo_minuto,
             d.estado AS estado_desarrollo,
             p.id_cliente, p.id_subcliente, p.activo,
             p.id_estilo, p.id_linea, p.id_genero, p.id_composicion,
             c.nombre AS cliente_nombre,
             sc.nombre AS subcliente_nombre,
             es.nombre AS estilo_nombre, li.nombre AS linea_nombre,
             ge.nombre AS genero_nombre, co.nombre AS composicion_nombre,
             round(v.costo_unitario, 4) AS costo_unitario
      FROM recetas.productos p
      JOIN recetas.v_producto_costo v ON v.id_producto = p.id_producto
      LEFT JOIN recetas.clientes c ON c.id_cliente = p.id_cliente
      LEFT JOIN recetas.subclientes sc ON sc.id_subcliente = p.id_subcliente
      LEFT JOIN recetas.estilos es ON es.id_estilo = p.id_estilo
      LEFT JOIN recetas.lineas li ON li.id_linea = p.id_linea
      LEFT JOIN recetas.generos ge ON ge.id_genero = p.id_genero
      LEFT JOIN recetas.composiciones co ON co.id_composicion = p.id_composicion
      LEFT JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
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
        idSubcliente: p.id_subcliente,
        activo: p.activo,
        clienteNombre: p.cliente_nombre,
        subclienteNombre: p.subcliente_nombre,
        idEstilo: p.id_estilo,
        idLinea: p.id_linea,
        idGenero: p.id_genero,
        idComposicion: p.id_composicion,
        estiloNombre: p.estilo_nombre,
        lineaNombre: p.linea_nombre,
        generoNombre: p.genero_nombre,
        composicionNombre: p.composicion_nombre,
        costoUnitario: p.costo_unitario.toNumber(),
        estadoDesarrollo: p.estado_desarrollo,
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
             p.tamano, p.deporte, p.precio_venta,
             -- La mano de obra vive en el desarrollo desde 2026-08-26; las
             -- columnas homónimas de productos quedaron como legacy de 01_erp.
             COALESCE(d.minutos_mo, 0)         AS minutos_mo,
             COALESCE(d.costo_mo_minuto, 0)    AS costo_mo_minuto,
             c.codigo AS cliente_codigo, c.nombre AS cliente_nombre,
             round(v.costo_insumos, 4)  AS costo_insumos,
             round(v.costo_mano_obra, 2) AS costo_mano_obra,
             round(v.costo_unitario, 4)  AS costo_unitario
      FROM recetas.productos p
      LEFT JOIN recetas.clientes c ON c.id_cliente = p.id_cliente
      LEFT JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
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
      -- La receta es del DESARROLLO, no del producto (2026-08-26). Un producto
      -- sin desarrollo simplemente no tiene insumos: el JOIN no matchea y la
      -- lista vuelve vacía, sin reventar.
      SELECT cat.nombre AS categoria, cat.orden,
             i.codigo, i.descripcion,
             di.consumo, um.nombre AS unidad, ar.nombre AS area,
             round(i.costo_promedio, 6) AS costo_promedio,
             round(di.consumo * i.costo_promedio, 6) AS costo_total
      FROM recetas.productos p
      JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
      JOIN recetas.desarrollo_insumos di ON di.id_desarrollo = d.id_desarrollo
      JOIN recetas.insumos i ON i.id_insumo = di.id_insumo
      JOIN recetas.categorias_insumo cat ON cat.id_categoria = i.id_categoria
      JOIN recetas.unidades_medida um ON um.id_unidad = i.id_unidad
      LEFT JOIN recetas.areas_uso ar ON ar.id_area = di.id_area
      WHERE p.id_producto = ${producto.id_producto}
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
        estilo: string | null;
        linea: string | null;
        genero: string | null;
        composicion: string | null;
      }[]
    >`
      SELECT p.codigo, p.descripcion, c.nombre AS cliente, p.deporte, p.tamano,
             p.patron, p.desarrollo, p.precio_venta,
             round(v.costo_unitario, 4) AS costo_unitario,
             es.nombre AS estilo, li.nombre AS linea,
             ge.nombre AS genero, co.nombre AS composicion
      FROM recetas.productos p
      JOIN recetas.v_producto_costo v ON v.id_producto = p.id_producto
      LEFT JOIN recetas.clientes c ON c.id_cliente = p.id_cliente
      LEFT JOIN recetas.estilos es ON es.id_estilo = p.id_estilo
      LEFT JOIN recetas.lineas li ON li.id_linea = p.id_linea
      LEFT JOIN recetas.generos ge ON ge.id_genero = p.id_genero
      LEFT JOIN recetas.composiciones co ON co.id_composicion = p.id_composicion
      WHERE ${where}
      ORDER BY p.codigo
    `;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet('Productos');

    ws.mergeCells('A1:M1');
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Listado de productos';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells('A2:M2');
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
      // Al final para no mover ninguna columna que alguien ya use.
      'Estilo',
      'Línea',
      'Género',
      'Composición',
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
        r.estilo,
        r.linea,
        r.genero,
        r.composicion,
      ]);
    }

    const anchos = [16, 48, 18, 14, 10, 20, 14, 16, 18, 14, 22, 14, 22];
    anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
    ws.getColumn(8).numFmt = '#,##0.00';
    ws.getColumn(9).numFmt = '#,##0.0000';
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 13 } };

    return wb.xlsx.writeBuffer();
  }

  // ---------- CRUD de cabecera ----------

  /// Valida que el desarrollo se pueda asignar a un producto.
  ///
  /// Como NO existe una FK productos.desarrollo -> desarrollos.codigo
  /// (deliberado: 01_erp escribe esa columna como texto y sigue en
  /// producción), esta función es la ÚNICA garantía de integridad. Si se
  /// quita, se pueden crear productos apuntando a desarrollos inexistentes.
  private async exigirDesarrolloAsignable(
    codigoDesarrollo: string,
    idProductoActual?: number,
  ) {
    const d = await this.prisma.desarrollo.findUnique({
      where: { codigo: codigoDesarrollo },
      select: { codigo: true, estado: true, activo: true },
    });
    if (!d)
      throw new BadRequestException(
        `El desarrollo "${codigoDesarrollo}" no existe — creálo primero en la pestaña Desarrollos`,
      );
    if (!d.activo)
      throw new BadRequestException(
        `El desarrollo "${codigoDesarrollo}" está inactivo`,
      );
    if (d.estado !== 'APROBADO')
      throw new BadRequestException(
        `El desarrollo "${codigoDesarrollo}" todavía no está aprobado — solo se pueden asignar desarrollos aprobados`,
      );
    // 1:1 — el índice único de productos.desarrollo también lo impide, pero
    // acá el mensaje dice de una vez qué producto lo tiene tomado.
    const tomado = await this.prisma.producto.findFirst({
      where: { desarrollo: codigoDesarrollo },
      select: { idProducto: true, codigo: true },
    });
    if (tomado && tomado.idProducto !== idProductoActual)
      throw new BadRequestException(
        `El desarrollo "${codigoDesarrollo}" ya está asignado al producto "${tomado.codigo}"`,
      );
  }

  /**
   * El subcliente tiene que pertenecer al cliente del producto. Sin esto se
   * podría marcar una prenda de Cliff Keen como "Under Armour", que cuelga de
   * BSN — y la estadística por subcliente quedaría mezclando clientes.
   * La base no puede imponerlo sola: exigiría una FK compuesta y `id_cliente`
   * del producto es nullable.
   */
  private async exigirSubclienteDelCliente(
    idSubcliente: number | null | undefined,
    idCliente: number | null | undefined,
  ) {
    if (idSubcliente == null) return;
    const sub = await this.prisma.subcliente.findUnique({
      where: { idSubcliente },
      select: {
        idCliente: true,
        nombre: true,
        activo: true,
        cliente: { select: { nombre: true } },
      },
    });
    if (!sub) throw new BadRequestException('El subcliente no existe');
    if (!sub.activo)
      throw new BadRequestException(
        `El subcliente "${sub.nombre}" está inactivo`,
      );
    if (idCliente == null)
      throw new BadRequestException(
        `Para asignar el subcliente "${sub.nombre}" el producto necesita cliente (${sub.cliente.nombre})`,
      );
    if (sub.idCliente !== idCliente)
      throw new BadRequestException(
        `El subcliente "${sub.nombre}" pertenece a ${sub.cliente.nombre}, no al cliente elegido`,
      );
  }

  /**
   * Valida los cuatro atributos de estadística (estilo, línea, género,
   * composición): que existan y estén activos.
   *
   * Al editar solo se revisan los que CAMBIAN: un producto que ya apunta a un
   * valor retirado no puede quedar imposible de editar por eso. Retirar un
   * valor lo saca de los selectores, no invalida a quien ya lo usa.
   */
  private async exigirAtributos(
    nuevos: {
      idEstilo?: number | null;
      idLinea?: number | null;
      idGenero?: number | null;
      idComposicion?: number | null;
    },
    actuales?: {
      idEstilo: number | null;
      idLinea: number | null;
      idGenero: number | null;
      idComposicion: number | null;
    },
  ) {
    const cambia = (
      n: number | null | undefined,
      a: number | null | undefined,
    ) => n != null && n !== (a ?? null);
    const p = this.prisma;
    const revisiones: [
      string,
      string,
      () => Promise<{ nombre: string; activo: boolean } | null>,
    ][] = [];
    if (cambia(nuevos.idEstilo, actuales?.idEstilo))
      revisiones.push([
        'El estilo',
        'retirado',
        () => p.estilo.findUnique({ where: { idEstilo: nuevos.idEstilo! } }),
      ]);
    if (cambia(nuevos.idLinea, actuales?.idLinea))
      revisiones.push([
        'La línea',
        'retirada',
        () => p.linea.findUnique({ where: { idLinea: nuevos.idLinea! } }),
      ]);
    if (cambia(nuevos.idGenero, actuales?.idGenero))
      revisiones.push([
        'El género',
        'retirado',
        () => p.genero.findUnique({ where: { idGenero: nuevos.idGenero! } }),
      ]);
    if (cambia(nuevos.idComposicion, actuales?.idComposicion))
      revisiones.push([
        'La composición',
        'retirada',
        () =>
          p.composicion.findUnique({
            where: { idComposicion: nuevos.idComposicion! },
          }),
      ]);
    for (const [etiqueta, retirado, buscar] of revisiones) {
      const x = await buscar();
      if (!x) throw new BadRequestException(`${etiqueta} elegido no existe`);
      if (!x.activo)
        throw new BadRequestException(
          `${etiqueta} "${x.nombre}" está ${retirado}: elegí otro`,
        );
    }
  }

  async crear(dto: CrearProductoDto, idUsuarioActor: number) {
    if (!(await this.referencias.deporteEsValido(dto.deporte))) {
      throw new BadRequestException(`Deporte "${dto.deporte}" no reconocido`);
    }
    // Decisión del usuario (2026-08-26): el desarrollo es OBLIGATORIO al crear
    // un producto — el prototipo va primero, el producto después.
    const desarrollo = dto.desarrollo?.trim() || null;
    if (!desarrollo)
      throw new BadRequestException(
        'Un producto necesita un desarrollo aprobado: la receta y el costo vienen de ahí',
      );
    await this.exigirDesarrolloAsignable(desarrollo);
    await this.exigirSubclienteDelCliente(dto.idSubcliente, dto.idCliente);
    await this.exigirAtributos(dto);

    try {
      const producto = await this.prisma.producto.create({
        data: {
          codigo: dto.codigo.trim(),
          descripcion: dto.descripcion.trim(),
          idCliente: dto.idCliente ?? null,
          idSubcliente: dto.idSubcliente ?? null,
          idEstilo: dto.idEstilo ?? null,
          idLinea: dto.idLinea ?? null,
          idGenero: dto.idGenero ?? null,
          idComposicion: dto.idComposicion ?? null,
          desarrollo,
          patron: dto.patron?.trim() || null,
          tamano: dto.tamano?.trim() || null,
          deporte: dto.deporte?.trim() || null,
          precioVenta: dto.precioVenta ?? 0,
          // minutosMo / costoMoMinuto NO se escriben: la mano de obra vive en
          // el desarrollo. Las columnas quedan en su default, como legacy.
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
        if (e.code === 'P2002') {
          throw new BadRequestException(
            violacionUnicaIncluyeCampo(e.meta, 'desarrollo')
              ? `Ya existe un producto con el desarrollo "${dto.desarrollo}"`
              : `Ya existe un producto con el código "${dto.codigo}"`,
          );
        }
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
    // EditarProductoDto es un PartialType. Antes se escribía
    // `campo: dto.campo?.trim() || null`, así que un PATCH que NO mandara el
    // campo lo ponía en NULL — borraba el cliente, el patrón, la talla o el
    // desarrollo en silencio. Ahora solo se escribe lo que vino de verdad.
    const data: Prisma.ProductoUpdateInput = {};
    if (dto.descripcion !== undefined)
      data.descripcion = dto.descripcion.trim();
    if (dto.idCliente !== undefined)
      data.cliente = dto.idCliente
        ? { connect: { idCliente: dto.idCliente } }
        : { disconnect: true };
    if (dto.patron !== undefined) data.patron = dto.patron?.trim() || null;
    if (dto.tamano !== undefined) data.tamano = dto.tamano?.trim() || null;
    if (dto.deporte !== undefined) data.deporte = dto.deporte?.trim() || null;
    if (dto.precioVenta !== undefined) data.precioVenta = dto.precioVenta;
    if (dto.idSubcliente !== undefined) {
      // El cliente contra el que se valida es el que va a quedar tras el PATCH,
      // no el que había: cambiar cliente y subcliente a la vez debe cuadrar.
      const idClienteFinal =
        dto.idCliente !== undefined ? dto.idCliente : anterior.idCliente;
      await this.exigirSubclienteDelCliente(dto.idSubcliente, idClienteFinal);
      data.subcliente = dto.idSubcliente
        ? { connect: { idSubcliente: dto.idSubcliente } }
        : { disconnect: true };
    } else if (dto.idCliente !== undefined && anterior.idSubcliente != null) {
      // Cambiar de cliente sin tocar el subcliente lo dejaría colgando de otro
      // cliente. Se revalida, y si ya no corresponde se rechaza en vez de
      // arrastrar una marca ajena en silencio.
      await this.exigirSubclienteDelCliente(
        anterior.idSubcliente,
        dto.idCliente,
      );
    }

    // Atributos de estadística. `undefined` = no tocar, `null` = quitar.
    await this.exigirAtributos(dto, anterior);
    if (dto.idEstilo !== undefined)
      data.estilo = dto.idEstilo
        ? { connect: { idEstilo: dto.idEstilo } }
        : { disconnect: true };
    if (dto.idLinea !== undefined)
      data.linea = dto.idLinea
        ? { connect: { idLinea: dto.idLinea } }
        : { disconnect: true };
    if (dto.idGenero !== undefined)
      data.genero = dto.idGenero
        ? { connect: { idGenero: dto.idGenero } }
        : { disconnect: true };
    if (dto.idComposicion !== undefined)
      data.composicion = dto.idComposicion
        ? { connect: { idComposicion: dto.idComposicion } }
        : { disconnect: true };

    if (dto.desarrollo !== undefined) {
      const nuevo = dto.desarrollo?.trim() || null;
      if (!nuevo)
        throw new BadRequestException(
          'No se puede dejar un producto sin desarrollo: la receta y el costo vienen de ahí',
        );
      if (nuevo !== anterior.desarrollo)
        await this.exigirDesarrolloAsignable(nuevo, id);
      // Desde la FK (2026-08-31) esto es una relación, no un escalar: Prisma
      // pide connect. La base ya rechaza un código inexistente por sí sola.
      data.desarrolloRef = { connect: { codigo: nuevo } };
    }

    try {
      await this.prisma.producto.update({ where: { idProducto: id }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2003')
          throw new BadRequestException('Cliente no existe');
        if (e.code === 'P2002') {
          throw new BadRequestException(
            violacionUnicaIncluyeCampo(e.meta, 'desarrollo')
              ? `Ya existe un producto con el desarrollo "${dto.desarrollo}"`
              : 'Ya existe un producto con ese dato único',
          );
        }
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
      estilo: string;
      linea: string;
      genero: string;
      composicion: string;
    }[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber < FILA_INICIO_DATOS) return;
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
        estilo: textoCelda(row.getCell(11).value).trim(),
        linea: textoCelda(row.getCell(12).value).trim(),
        genero: textoCelda(row.getCell(13).value).trim(),
        composicion: textoCelda(row.getCell(14).value).trim(),
      });
    });

    const [
      clientes,
      tallas,
      deportes,
      existentes,
      desarrollos,
      estilos,
      lineas,
      generos,
      composiciones,
    ] = await Promise.all([
      this.prisma.cliente.findMany(),
      this.prisma.talla.findMany(),
      this.prisma.deporte.findMany(),
      this.prisma.producto.findMany({
        select: { codigo: true, desarrollo: true },
      }),
      this.prisma.desarrollo.findMany({
        select: { codigo: true, estado: true, activo: true },
      }),
      // Todos, con su estado: hace falta para decir "está retirado" y no
      // "no existe", que llevan a arreglos distintos.
      this.prisma.estilo.findMany(),
      this.prisma.linea.findMany(),
      this.prisma.genero.findMany(),
      this.prisma.composicion.findMany(),
    ]);
    // Por nombre y sin distinguir mayúsculas: es lo que escribe la gente.
    const estiloPorNombre = new Map(
      estilos.map((x) => [x.nombre.toLowerCase(), x]),
    );
    const lineaPorNombre = new Map(
      lineas.map((x) => [x.nombre.toLowerCase(), x]),
    );
    const generoPorNombre = new Map(
      generos.map((x) => [x.nombre.toLowerCase(), x]),
    );
    const composicionPorNombre = new Map(
      composiciones.map((x) => [x.nombre.toLowerCase(), x]),
    );
    const clientePorCodigo = new Map(
      clientes.map((c) => [c.codigo.toLowerCase(), c.idCliente]),
    );
    const tallasValidas = new Set(tallas.map((t) => t.nombre.toLowerCase()));
    const deportesValidos = new Set(
      deportes.map((d) => d.nombre.toLowerCase()),
    );
    const codigosExistentes = new Set(existentes.map((e) => e.codigo));
    // Desarrollo↔Producto es biunívoco (confirmado 2026-08-20) — mismo
    // criterio anti-duplicado que ya existía para código.
    const desarrollosExistentes = new Set(
      existentes
        .filter((e) => e.desarrollo)
        .map((e) => e.desarrollo.trim().toLowerCase()),
    );
    // Catálogo de desarrollos para resolver la columna del Excel. Como no hay
    // FK, esto es lo único que impide importar productos apuntando a
    // desarrollos inexistentes o sin aprobar.
    const desarrolloPorCodigo = new Map(
      desarrollos.map((d) => [d.codigo.trim().toLowerCase(), d]),
    );

    const vistos = new Set<string>();
    const vistosDesarrollo = new Set<string>();
    const filas: FilaPreviewAltaProducto[] = crudo.map((r) => {
      const precio =
        r.precioCell == null || r.precioCell === '' ? 0 : Number(r.precioCell);
      let error: string | null = null;
      if (!r.codigo) error = 'Código vacío';
      else if (vistos.has(r.codigo)) error = 'Código duplicado en el archivo';
      else if (codigosExistentes.has(r.codigo))
        error = 'Ya existe un producto con ese código';
      else if (!r.descripcion) error = 'Descripción vacía';
      // El desarrollo es obligatorio: la receta y el costo del producto salen
      // de ahí (decisión del usuario, 2026-08-26).
      else if (!r.desarrollo)
        error =
          'Desarrollo vacío — un producto necesita un desarrollo aprobado';
      else if (vistosDesarrollo.has(r.desarrollo.trim().toLowerCase()))
        error = 'Desarrollo duplicado en el archivo';
      else if (desarrollosExistentes.has(r.desarrollo.trim().toLowerCase()))
        error = 'Ya existe un producto con ese desarrollo';
      else if (!desarrolloPorCodigo.has(r.desarrollo.trim().toLowerCase()))
        error = `El desarrollo "${r.desarrollo}" no existe — creálo primero en la pestaña Desarrollos`;
      else if (
        !desarrolloPorCodigo.get(r.desarrollo.trim().toLowerCase())!.activo
      )
        error = `El desarrollo "${r.desarrollo}" está inactivo`;
      else if (
        desarrolloPorCodigo.get(r.desarrollo.trim().toLowerCase())!.estado !==
        'APROBADO'
      )
        error = `El desarrollo "${r.desarrollo}" todavía no está aprobado`;
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
      else if (r.estilo && !estiloPorNombre.get(r.estilo.toLowerCase())?.activo)
        error = estiloPorNombre.has(r.estilo.toLowerCase())
          ? `El estilo "${r.estilo}" está retirado`
          : `Estilo "${r.estilo}" no existe — darlo de alta en Catálogos de producto`;
      else if (r.linea && !lineaPorNombre.get(r.linea.toLowerCase())?.activo)
        error = lineaPorNombre.has(r.linea.toLowerCase())
          ? `La línea "${r.linea}" está retirada`
          : `Línea "${r.linea}" no existe — darla de alta en Catálogos de producto`;
      else if (r.genero && !generoPorNombre.get(r.genero.toLowerCase())?.activo)
        error = generoPorNombre.has(r.genero.toLowerCase())
          ? `El género "${r.genero}" está retirado`
          : `Género "${r.genero}" no existe — darlo de alta en Catálogos de producto`;
      else if (
        r.composicion &&
        !composicionPorNombre.get(r.composicion.toLowerCase())?.activo
      )
        error = composicionPorNombre.has(r.composicion.toLowerCase())
          ? `La composición "${r.composicion}" está retirada`
          : `Composición "${r.composicion}" no existe — darla de alta en Catálogos de producto`;
      if (r.codigo) vistos.add(r.codigo);
      if (r.desarrollo) vistosDesarrollo.add(r.desarrollo.trim().toLowerCase());

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
        estilo: r.estilo || null,
        idEstilo: r.estilo
          ? (estiloPorNombre.get(r.estilo.toLowerCase())?.idEstilo ?? null)
          : null,
        linea: r.linea || null,
        idLinea: r.linea
          ? (lineaPorNombre.get(r.linea.toLowerCase())?.idLinea ?? null)
          : null,
        genero: r.genero || null,
        idGenero: r.genero
          ? (generoPorNombre.get(r.genero.toLowerCase())?.idGenero ?? null)
          : null,
        composicion: r.composicion || null,
        idComposicion: r.composicion
          ? (composicionPorNombre.get(r.composicion.toLowerCase())
              ?.idComposicion ?? null)
          : null,
        error,
      };
    });

    return { filas };
  }

  async altas(altas: AltaProductoInput[], idUsuarioActor: number) {
    if (!altas || altas.length === 0)
      throw new BadRequestException('No hay altas para guardar');

    // El preview corre en el cliente y no obliga a nada: sin esta validación,
    // un POST directo podía crear productos apuntando a desarrollos
    // inexistentes o sin aprobar. Como no hay FK, esto es lo único que
    // garantiza la integridad (mismo criterio que crear()).
    const asignables = new Map(
      (
        await this.prisma.desarrollo.findMany({
          where: { estado: 'APROBADO', activo: true },
          select: { codigo: true },
        })
      ).map((d) => [d.codigo.trim().toLowerCase(), d.codigo]),
    );
    const sinDesarrollo = altas.filter((a) => !a.desarrollo?.trim());
    if (sinDesarrollo.length > 0)
      throw new BadRequestException(
        `Hay ${sinDesarrollo.length} producto(s) sin desarrollo: la receta y el costo vienen de ahí`,
      );
    const noAsignables = altas.filter(
      (a) => !asignables.has(a.desarrollo!.trim().toLowerCase()),
    );
    if (noAsignables.length > 0)
      throw new BadRequestException(
        `Estos desarrollos no existen o no están aprobados: ${noAsignables
          .slice(0, 10)
          .map((a) => a.desarrollo)
          .join(', ')}${noAsignables.length > 10 ? '…' : ''}`,
      );

    // Los ids de estilo/línea/género/composición también viajan por el
    // navegador: se revalidan contra los catálogos, activos, igual que el resto.
    const [estilosOk, lineasOk, generosOk, composicionesOk] = await Promise.all(
      [
        this.prisma.estilo.findMany({
          where: { activo: true },
          select: { idEstilo: true },
        }),
        this.prisma.linea.findMany({
          where: { activo: true },
          select: { idLinea: true },
        }),
        this.prisma.genero.findMany({
          where: { activo: true },
          select: { idGenero: true },
        }),
        this.prisma.composicion.findMany({
          where: { activo: true },
          select: { idComposicion: true },
        }),
      ],
    );
    const okEstilo = new Set(estilosOk.map((x) => x.idEstilo));
    const okLinea = new Set(lineasOk.map((x) => x.idLinea));
    const okGenero = new Set(generosOk.map((x) => x.idGenero));
    const okComposicion = new Set(composicionesOk.map((x) => x.idComposicion));
    const atributoInvalido = altas.find(
      (a) =>
        (a.idEstilo != null && !okEstilo.has(a.idEstilo)) ||
        (a.idLinea != null && !okLinea.has(a.idLinea)) ||
        (a.idGenero != null && !okGenero.has(a.idGenero)) ||
        (a.idComposicion != null && !okComposicion.has(a.idComposicion)),
    );
    if (atributoInvalido)
      throw new BadRequestException(
        `El producto ${atributoInvalido.codigo} trae un estilo, línea, género o composición que no existe o está retirado`,
      );

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
              idEstilo: a.idEstilo ?? null,
              idLinea: a.idLinea ?? null,
              idGenero: a.idGenero ?? null,
              idComposicion: a.idComposicion ?? null,
              // El código canónico sale del catálogo, no del Excel: así una
              // diferencia de mayúsculas no crea un desarrollo "distinto".
              desarrollo: asignables.get(a.desarrollo!.trim().toLowerCase())!,
              patron: a.patron ?? null,
              tamano: a.tamano ?? null,
              deporte: a.deporte ?? null,
              precioVenta: a.precioVenta ?? 0,
              // minutosMo / costoMoMinuto NO se escriben: la mano de obra vive
              // en el desarrollo (mismo criterio que crear()).
            },
          });
          creados++;
        } catch (e) {
          let motivo = 'error al insertar';
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            motivo = violacionUnicaIncluyeCampo(e.meta, 'desarrollo')
              ? 'ya existe un producto con ese desarrollo'
              : 'código ya existe';
          }
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
    const [
      clientes,
      tallas,
      deportes,
      estilos,
      lineas,
      generos,
      composiciones,
    ] = await Promise.all([
      this.prisma.cliente.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.talla.findMany({ orderBy: { orden: 'asc' } }),
      this.prisma.deporte.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.estilo.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.linea.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.genero.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.composicion.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Altas de productos');
    ws.mergeCells('A1:N1');
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Alta masiva de productos';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells('A2:N2');
    ws.getCell('A2').value =
      'Completar una fila por producto nuevo. Desarrollo es OBLIGATORIO y debe existir ya aprobado ' +
      '(pestaña Desarrollos). Cliente (código), Talla y Deporte son opcionales, pero si se llenan deben ' +
      'coincidir con la hoja "Clientes y tallas válidas". Estilo, Línea, Género y Composición (últimas ' +
      'cuatro columnas) son opcionales y deben existir en la hoja "Atributos válidos"; para agregar uno ' +
      'nuevo, darlo de alta antes en Catálogos de producto.';
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
      // Se conservan las dos columnas (para que los archivos ya armados sigan
      // cargando) pero se ignoran: la mano de obra vive en el desarrollo.
      'Minutos MO (ignorado)',
      'Costo MO/min (ignorado)',
      // Al final: agregar columnas en el medio correría las siguientes y un
      // archivo armado con la plantilla anterior cargaría datos corridos.
      'Estilo (opcional)',
      'Línea (opcional)',
      'Género (opcional)',
      'Composición (opcional)',
    ];
    headerRow.eachCell(estiloEncabezado);
    const anchos = [16, 40, 16, 14, 16, 10, 14, 14, 18, 18, 18, 22, 16, 24];
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

    // Los valores válidos de los cuatro atributos, para no tener que adivinar
    // cómo está escrito cada uno.
    const wsAtr = wb.addWorksheet('Atributos válidos');
    wsAtr.getRow(1).values = ['Estilo', 'Línea', 'Género', 'Composición'];
    wsAtr.getRow(1).font = { bold: true };
    const maxAtr = Math.max(
      estilos.length,
      lineas.length,
      generos.length,
      composiciones.length,
    );
    for (let i = 0; i < maxAtr; i++) {
      wsAtr.getRow(i + 2).getCell(1).value = estilos[i]?.nombre ?? '';
      wsAtr.getRow(i + 2).getCell(2).value = lineas[i]?.nombre ?? '';
      wsAtr.getRow(i + 2).getCell(3).value = generos[i]?.nombre ?? '';
      wsAtr.getRow(i + 2).getCell(4).value = composiciones[i]?.nombre ?? '';
    }
    [18, 26, 18, 30].forEach((w, i) => (wsAtr.getColumn(i + 1).width = w));

    return wb.xlsx.writeBuffer();
  }

  // ---------- Líneas de receta ----------
  //
  // ELIMINADAS (2026-08-26). La receta pasó a ser del Desarrollo, no del
  // Producto: ver recetas-desarrollos/desarrollos.service.ts
  // (listarLineas / agregarLinea / editarLinea / eliminarLinea).
  // No se dejaron como código muerto porque seguían escribiendo en
  // recetas.producto_insumos, que quedó congelada y que ya nadie lee para
  // calcular costos: cualquier llamada habría perdido datos en silencio.

  // ---------- Import/export de recetas ----------
  // ELIMINADO (2026-08-26): plantillaRecetas / previewImportarRecetas /
  // aplicarImportarRecetas y sus helpers armaban y escribían el BOM en
  // recetas.producto_insumos, congelada al mudar la receta al Desarrollo.
  // El flujo equivalente vive ahora en
  // recetas-desarrollos/desarrollos-import.service.ts (hojas "Desarrollos"
  // + "Insumos"), que escribe donde de verdad se costea.
}
