import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  AgregarLineaRecetaDto,
  EditarLineaRecetaDto,
} from '../recetas-productos/dto/linea-receta.dto';
import { CrearDesarrolloDto } from './dto/crear-desarrollo.dto';
import { EditarDesarrolloDto } from './dto/editar-desarrollo.dto';
import { ListarDesarrollosDto } from './dto/listar-desarrollos.dto';

interface DesarrolloFila {
  id_desarrollo: number;
  codigo: string;
  descripcion: string;
  estado: string;
  id_cliente: number | null;
  cliente_nombre: string | null;
  id_talla_base: number | null;
  talla_base: string | null;
  minutos_mo: Prisma.Decimal;
  costo_mo_minuto: Prisma.Decimal;
  notas: string | null;
  activo: boolean;
  aprobado_en: Date | null;
  producto_codigo: string | null;
  producto_activo: boolean | null;
  costo_insumos: Prisma.Decimal;
  costo_mano_obra: Prisma.Decimal;
  costo_unitario: Prisma.Decimal;
  lineas: number;
}

interface LineaFila {
  id_desarrollo_insumo: number;
  id_insumo: number;
  codigo: string;
  descripcion: string;
  categoria: string;
  orden_categoria: number;
  unidad: string;
  consumo: Prisma.Decimal;
  costo_promedio: Prisma.Decimal;
  costo_total: Prisma.Decimal;
  id_area: number | null;
  area: string | null;
}

@Injectable()
export class DesarrollosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ---------- Lectura ----------

  async listar(dto: ListarDesarrollosDto) {
    const cond: Prisma.Sql[] = [];
    if (!dto.incluirInactivos) cond.push(Prisma.sql`d.activo = TRUE`);
    if (dto.estado && dto.estado !== 'todos')
      cond.push(Prisma.sql`d.estado = ${dto.estado}`);
    if (dto.idCliente) cond.push(Prisma.sql`d.id_cliente = ${dto.idCliente}`);
    // "Sin producto" es lo que necesita el selector de Desarrollo al dar de
    // alta un producto: solo los que todavía no están tomados.
    if (dto.sinProducto) cond.push(Prisma.sql`pr.id_producto IS NULL`);
    if (dto.q) {
      const like = `%${dto.q}%`;
      cond.push(
        Prisma.sql`(d.codigo ILIKE ${like} OR d.descripcion ILIKE ${like})`,
      );
    }
    const where = cond.length ? Prisma.join(cond, ' AND ') : Prisma.sql`TRUE`;
    const limit = Math.min(dto.limit ?? 500, 2000);

    const filas = await this.prisma.$queryRaw<DesarrolloFila[]>`
      SELECT d.id_desarrollo, d.codigo, d.descripcion, d.estado,
             d.id_cliente, c.nombre AS cliente_nombre,
             d.id_talla_base, t.nombre AS talla_base,
             d.minutos_mo, d.costo_mo_minuto, d.notas, d.activo, d.aprobado_en,
             pr.codigo AS producto_codigo, pr.activo AS producto_activo,
             round(v.costo_insumos, 4)   AS costo_insumos,
             round(v.costo_mano_obra, 4) AS costo_mano_obra,
             round(v.costo_unitario, 4)  AS costo_unitario,
             (SELECT count(*)::int FROM recetas.desarrollo_insumos di
               WHERE di.id_desarrollo = d.id_desarrollo) AS lineas
      FROM recetas.desarrollos d
      JOIN recetas.v_desarrollo_costo v ON v.id_desarrollo = d.id_desarrollo
      LEFT JOIN recetas.clientes c ON c.id_cliente = d.id_cliente
      LEFT JOIN recetas.tallas   t ON t.id_talla   = d.id_talla_base
      LEFT JOIN recetas.productos pr ON pr.desarrollo = d.codigo
      WHERE ${where}
      ORDER BY d.codigo
      LIMIT ${limit}
    `;

    const [{ total }] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM recetas.desarrollos d
      LEFT JOIN recetas.productos pr ON pr.desarrollo = d.codigo
      WHERE ${where}
    `;

    return {
      desarrollos: filas.map((d) => this.mapCabecera(d)),
      total,
      limit,
    };
  }

  async obtener(idDesarrollo: number) {
    const filas = await this.prisma.$queryRaw<DesarrolloFila[]>`
      SELECT d.id_desarrollo, d.codigo, d.descripcion, d.estado,
             d.id_cliente, c.nombre AS cliente_nombre,
             d.id_talla_base, t.nombre AS talla_base,
             d.minutos_mo, d.costo_mo_minuto, d.notas, d.activo, d.aprobado_en,
             pr.codigo AS producto_codigo, pr.activo AS producto_activo,
             round(v.costo_insumos, 4)   AS costo_insumos,
             round(v.costo_mano_obra, 4) AS costo_mano_obra,
             round(v.costo_unitario, 4)  AS costo_unitario,
             (SELECT count(*)::int FROM recetas.desarrollo_insumos di
               WHERE di.id_desarrollo = d.id_desarrollo) AS lineas
      FROM recetas.desarrollos d
      JOIN recetas.v_desarrollo_costo v ON v.id_desarrollo = d.id_desarrollo
      LEFT JOIN recetas.clientes c ON c.id_cliente = d.id_cliente
      LEFT JOIN recetas.tallas   t ON t.id_talla   = d.id_talla_base
      LEFT JOIN recetas.productos pr ON pr.desarrollo = d.codigo
      WHERE d.id_desarrollo = ${idDesarrollo}
    `;
    const cabecera = filas[0];
    if (!cabecera) throw new NotFoundException('Desarrollo no encontrado');

    const insumos = await this.listarLineas(idDesarrollo);

    // Fila sintética de mano de obra, mismo shape que recetaPublica() para que
    // el frontend pueda reusar los componentes de la Cotización.
    const minutos = cabecera.minutos_mo.toNumber();
    const costoMin = cabecera.costo_mo_minuto.toNumber();
    const manoObra =
      minutos > 0
        ? {
            categoria: 'Mano de obra',
            descripcion: 'Mano de obra',
            consumo: minutos,
            unidad: 'Minutos',
            area: 'Confeccion',
            costoPromedio: costoMin,
            costoTotal: minutos * costoMin,
          }
        : null;

    return { ...this.mapCabecera(cabecera), insumos, manoObra };
  }

  async listarLineas(idDesarrollo: number) {
    const rows = await this.prisma.$queryRaw<LineaFila[]>`
      SELECT di.id_desarrollo_insumo, di.id_insumo, i.codigo, i.descripcion,
             cat.nombre AS categoria, cat.orden AS orden_categoria,
             um.nombre AS unidad, di.consumo,
             round(i.costo_promedio, 6) AS costo_promedio,
             round(di.consumo * i.costo_promedio, 6) AS costo_total,
             di.id_area, ar.nombre AS area
      FROM recetas.desarrollo_insumos di
      JOIN recetas.insumos i            ON i.id_insumo = di.id_insumo
      JOIN recetas.categorias_insumo cat ON cat.id_categoria = i.id_categoria
      JOIN recetas.unidades_medida um    ON um.id_unidad = i.id_unidad
      LEFT JOIN recetas.areas_uso ar     ON ar.id_area = di.id_area
      WHERE di.id_desarrollo = ${idDesarrollo}
      ORDER BY cat.orden, i.codigo
    `;
    return rows.map((r) => ({
      idDesarrolloInsumo: r.id_desarrollo_insumo,
      idInsumo: r.id_insumo,
      codigo: r.codigo,
      descripcion: r.descripcion,
      categoria: r.categoria,
      ordenCategoria: r.orden_categoria,
      unidad: r.unidad,
      consumo: r.consumo.toNumber(),
      costoPromedio: r.costo_promedio.toNumber(),
      costoTotal: r.costo_total.toNumber(),
      idArea: r.id_area,
      area: r.area,
    }));
  }

  private mapCabecera(d: DesarrolloFila) {
    return {
      idDesarrollo: d.id_desarrollo,
      codigo: d.codigo,
      descripcion: d.descripcion,
      estado: d.estado,
      idCliente: d.id_cliente,
      clienteNombre: d.cliente_nombre,
      idTallaBase: d.id_talla_base,
      tallaBase: d.talla_base,
      minutosMo: d.minutos_mo.toNumber(),
      costoMoMinuto: d.costo_mo_minuto.toNumber(),
      notas: d.notas,
      activo: d.activo,
      aprobadoEn: d.aprobado_en,
      productoCodigo: d.producto_codigo,
      productoActivo: d.producto_activo,
      costoInsumos: d.costo_insumos.toNumber(),
      costoManoObra: d.costo_mano_obra.toNumber(),
      costoUnitario: d.costo_unitario.toNumber(),
      lineas: d.lineas,
    };
  }

  // ---------- Escritura de la cabecera ----------

  async crear(dto: CrearDesarrolloDto, idUsuarioActor: number) {
    try {
      const d = await this.prisma.desarrollo.create({
        data: {
          codigo: dto.codigo.trim(),
          descripcion: dto.descripcion.trim(),
          idCliente: dto.idCliente ?? null,
          idTallaBase: dto.idTallaBase ?? null,
          minutosMo: dto.minutosMo ?? 0,
          costoMoMinuto: dto.costoMoMinuto ?? 0.33,
          notas: dto.notas?.trim() || null,
          creadoPor: idUsuarioActor,
        },
      });
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'desarrollos',
        idEntidad: String(d.idDesarrollo),
        accion: 'CREATE',
        datosNuevos: { codigo: d.codigo, descripcion: d.descripcion },
      });
      return { idDesarrollo: d.idDesarrollo };
    } catch (e) {
      throw this.traducirError(e, dto.codigo);
    }
  }

  async editar(
    idDesarrollo: number,
    dto: EditarDesarrolloDto,
    idUsuarioActor: number,
  ) {
    const anterior = await this.prisma.desarrollo.findUnique({
      where: { idDesarrollo },
    });
    if (!anterior) throw new NotFoundException('Desarrollo no encontrado');

    // Solo se escriben los campos que vinieron. Un PATCH parcial NO debe
    // borrar lo que no mandó — es el bug que arrastra productos.editar().
    const data: Prisma.DesarrolloUpdateInput = {};
    if (dto.descripcion !== undefined)
      data.descripcion = dto.descripcion.trim();
    if (dto.idCliente !== undefined)
      data.cliente = dto.idCliente
        ? { connect: { idCliente: dto.idCliente } }
        : { disconnect: true };
    if (dto.idTallaBase !== undefined)
      data.tallaBase = dto.idTallaBase
        ? { connect: { idTalla: dto.idTallaBase } }
        : { disconnect: true };
    if (dto.minutosMo !== undefined) data.minutosMo = dto.minutosMo;
    if (dto.costoMoMinuto !== undefined) data.costoMoMinuto = dto.costoMoMinuto;
    if (dto.notas !== undefined) data.notas = dto.notas?.trim() || null;
    // Misma regla que reabrir(): retirar el prototipo del que cuelga un
    // producto activo dejaría ese producto vendible, costeado desde un
    // desarrollo inactivo y sin poder reasignarse (el selector del alta solo
    // ofrece aprobados y activos). Antes esto pasaba sin ninguna validación.
    if (dto.activo === false && anterior.activo) {
      const producto = await this.prisma.producto.findFirst({
        where: { desarrollo: anterior.codigo },
        select: { codigo: true, activo: true },
      });
      if (producto?.activo)
        throw new ConflictException(
          `No se puede desactivar: el producto "${producto.codigo}" está activo y depende de este desarrollo. Desactivalo primero.`,
        );
    }
    if (dto.activo !== undefined) data.activo = dto.activo;

    try {
      await this.prisma.desarrollo.update({ where: { idDesarrollo }, data });
    } catch (e) {
      throw this.traducirError(e, anterior.codigo);
    }

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'desarrollos',
      idEntidad: String(idDesarrollo),
      accion: 'UPDATE',
      datosAnteriores: anterior,
      datosNuevos: dto as unknown as Record<string, unknown>,
    });
    return { actualizado: true };
  }

  async aprobar(idDesarrollo: number, idUsuarioActor: number) {
    const d = await this.prisma.desarrollo.findUnique({
      where: { idDesarrollo },
      include: { _count: { select: { insumos: true } } },
    });
    if (!d) throw new NotFoundException('Desarrollo no encontrado');
    if (d.estado === 'APROBADO')
      throw new ConflictException('El desarrollo ya está aprobado');
    if (!d.activo)
      throw new ConflictException('No se puede aprobar un desarrollo inactivo');
    // Un prototipo sin insumos no es costeable — aprobarlo dejaría un producto
    // con costo cero sin que nadie lo note.
    if (d._count.insumos === 0)
      throw new BadRequestException(
        'No se puede aprobar un desarrollo sin insumos: primero cargá su receta',
      );

    await this.prisma.desarrollo.update({
      where: { idDesarrollo },
      data: {
        estado: 'APROBADO',
        aprobadoEn: new Date(),
        aprobadoPor: idUsuarioActor,
      },
    });
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'desarrollos',
      idEntidad: String(idDesarrollo),
      accion: 'UPDATE',
      datosNuevos: { estado: 'APROBADO' },
    });
    return { aprobado: true };
  }

  async reabrir(idDesarrollo: number, idUsuarioActor: number) {
    const d = await this.prisma.desarrollo.findUnique({
      where: { idDesarrollo },
    });
    if (!d) throw new NotFoundException('Desarrollo no encontrado');
    if (d.estado === 'BORRADOR')
      throw new ConflictException('El desarrollo ya está en borrador');

    // Decisión del usuario (2026-08-26): no se reabre un desarrollo cuyo
    // producto sigue activo — habría un producto vendible colgando de un
    // prototipo sin aprobar. Hay que desactivar el producto primero.
    const producto = await this.prisma.producto.findFirst({
      where: { desarrollo: d.codigo },
      select: { codigo: true, activo: true },
    });
    if (producto?.activo)
      throw new ConflictException(
        `No se puede reabrir: el producto "${producto.codigo}" está activo y depende de este desarrollo. Desactivalo primero.`,
      );

    await this.prisma.desarrollo.update({
      where: { idDesarrollo },
      data: { estado: 'BORRADOR', aprobadoEn: null, aprobadoPor: null },
    });
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'desarrollos',
      idEntidad: String(idDesarrollo),
      accion: 'UPDATE',
      datosNuevos: { estado: 'BORRADOR' },
    });
    return { reabierto: true };
  }

  // ---------- Líneas de receta (BOM) ----------

  async agregarLinea(
    idDesarrollo: number,
    dto: AgregarLineaRecetaDto,
    idUsuarioActor: number,
  ) {
    await this.exigirDesarrollo(idDesarrollo);
    const insumo = await this.prisma.insumo.findFirst({
      where: { idInsumo: dto.idInsumo, activo: true },
    });
    if (!insumo)
      throw new BadRequestException('El insumo no existe o está inactivo');
    try {
      const linea = await this.prisma.desarrolloInsumo.create({
        data: {
          idDesarrollo,
          idInsumo: dto.idInsumo,
          consumo: dto.consumo,
          idArea: dto.idArea ?? null,
        },
      });
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'desarrollo_insumos',
        idEntidad: String(linea.idDesarrolloInsumo),
        accion: 'CREATE',
        datosNuevos: {
          idDesarrollo,
          idInsumo: dto.idInsumo,
          consumo: dto.consumo,
          idArea: dto.idArea,
        },
      });
      return { idDesarrolloInsumo: linea.idDesarrolloInsumo };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // Gracias a NULLS NOT DISTINCT esto ahora también salta cuando el área
        // es NULL — en producto_insumos ese caso duplicaba la línea en silencio.
        if (e.code === 'P2002')
          throw new BadRequestException(
            'Ese insumo ya está en la receta en esa misma área',
          );
        if (e.code === 'P2003')
          throw new BadRequestException('Desarrollo, insumo o área no existe');
      }
      throw e;
    }
  }

  async editarLinea(
    idDesarrollo: number,
    idLinea: number,
    dto: EditarLineaRecetaDto,
    idUsuarioActor: number,
  ) {
    try {
      const r = await this.prisma.desarrolloInsumo.updateMany({
        where: { idDesarrolloInsumo: idLinea, idDesarrollo },
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
      entidad: 'desarrollo_insumos',
      idEntidad: String(idLinea),
      accion: 'UPDATE',
      datosNuevos: { consumo: dto.consumo, idArea: dto.idArea },
    });
    return { actualizado: true };
  }

  async eliminarLinea(
    idDesarrollo: number,
    idLinea: number,
    idUsuarioActor: number,
  ) {
    const r = await this.prisma.desarrolloInsumo.deleteMany({
      where: { idDesarrolloInsumo: idLinea, idDesarrollo },
    });
    if (r.count === 0)
      throw new NotFoundException('Línea de receta no encontrada');
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'desarrollo_insumos',
      idEntidad: String(idLinea),
      accion: 'DELETE',
      datosAnteriores: { idDesarrollo, idDesarrolloInsumo: idLinea },
    });
    return { eliminado: true };
  }

  // ---------- Helpers ----------

  private async exigirDesarrollo(idDesarrollo: number) {
    const d = await this.prisma.desarrollo.findUnique({
      where: { idDesarrollo },
      select: { idDesarrollo: true },
    });
    if (!d) throw new NotFoundException('Desarrollo no encontrado');
    return d;
  }

  private traducirError(e: unknown, codigo: string) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002')
        return new BadRequestException(
          `Ya existe un desarrollo con el código "${codigo}"`,
        );
      if (e.code === 'P2003')
        return new BadRequestException('Cliente o talla no existe');
    }
    return e;
  }
}
