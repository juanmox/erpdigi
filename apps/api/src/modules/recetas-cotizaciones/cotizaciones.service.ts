import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TipoCambioService } from '../recetas-tipo-cambio/tipo-cambio.service';
import { CrearCotizacionDto } from './dto/crear-cotizacion.dto';
import { ResumenMaterialDto } from './dto/resumen-material.dto';

@Injectable()
export class CotizacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tipoCambio: TipoCambioService,
  ) {}

  async crear(dto: CrearCotizacionDto) {
    const items = dto.items ?? [];
    if (items.length === 0) {
      throw new BadRequestException('No hay productos en la cotización');
    }
    const moneda = dto.moneda === 'USD' ? 'USD' : 'GTQ';
    let tasa: number | null = null;
    if (moneda === 'USD') {
      const tc = await this.tipoCambio.obtenerTipoCambio();
      tasa = tc.tasa;
    }

    return this.prisma.$transaction(
      async (tx) => {
        const [{ folio }] = await tx.$queryRaw<{ folio: string }[]>`
          SELECT recetas.fn_siguiente_folio() AS folio
        `;
        const cabecera = await tx.$queryRaw<
          { id_cotizacion: number; fecha_creacion: Date }[]
        >`
          INSERT INTO recetas.cotizaciones (folio, total_cantidad, total_costo, notas, moneda, tasa_cambio)
          VALUES (${folio}, 0, 0, ${dto.notas ?? null}, ${moneda}, ${tasa})
          RETURNING id_cotizacion, fecha_creacion
        `;
        const idCotizacion = cabecera[0].id_cotizacion;

        let totalCantidad = 0;
        let totalCosto = 0;

        for (const item of items) {
          const cantidad = Number(item.cantidad);
          if (!item.codigo || !(cantidad > 0)) continue;

          const productos = await tx.$queryRaw<
            {
              id_producto: number;
              descripcion: string;
              minutos_mo: Prisma.Decimal;
              costo_mo_minuto: Prisma.Decimal;
              desarrollo: string | null;
              patron: string | null;
              tamano: string | null;
              deporte: string | null;
              precio_venta: Prisma.Decimal;
              cliente_codigo: string | null;
              cliente_nombre: string | null;
              costo_unitario: Prisma.Decimal;
            }[]
          >`
            -- Mano de obra del DESARROLLO (2026-08-26): las columnas
            -- homónimas de productos son legacy de 01_erp.
            SELECT p.id_producto, p.descripcion,
                   COALESCE(d.minutos_mo, 0)      AS minutos_mo,
                   COALESCE(d.costo_mo_minuto, 0) AS costo_mo_minuto,
                   p.desarrollo, p.patron, p.tamano, p.deporte, p.precio_venta,
                   c.codigo AS cliente_codigo, c.nombre AS cliente_nombre,
                   round(v.costo_unitario, 6) AS costo_unitario
            FROM recetas.productos p
            JOIN recetas.v_producto_costo v ON v.id_producto = p.id_producto
            LEFT JOIN recetas.clientes c ON c.id_cliente = p.id_cliente
            LEFT JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
            WHERE p.codigo = ${item.codigo}
          `;
          if (productos.length === 0) continue;
          const prod = productos[0];
          const costoUnit = prod.costo_unitario.toNumber();
          const subtotal = costoUnit * cantidad;
          totalCantidad += cantidad;
          totalCosto += subtotal;

          const clienteTxt = prod.cliente_codigo
            ? `(${prod.cliente_codigo}) ${prod.cliente_nombre ?? ''}`.trim()
            : (prod.cliente_nombre ?? null);

          const detalle = await tx.$queryRaw<{ id_detalle: number }[]>`
            INSERT INTO recetas.cotizacion_detalle
              (id_cotizacion, id_producto, codigo_producto, descripcion,
               cantidad, costo_unitario, costo_total,
               desarrollo, patron, tamano, deporte, cliente, precio_venta)
            VALUES (${idCotizacion}, ${prod.id_producto}, ${item.codigo}, ${prod.descripcion},
                    ${cantidad}, ${costoUnit}, ${subtotal},
                    ${prod.desarrollo}, ${prod.patron}, ${prod.tamano}, ${prod.deporte},
                    ${clienteTxt}, ${prod.precio_venta})
            RETURNING id_detalle
          `;
          const idDetalle = detalle[0].id_detalle;

          const insumos = await tx.$queryRaw<
            {
              id_insumo: number;
              codigo: string;
              descripcion: string;
              categoria: string;
              orden: number;
              unidad: string;
              area: string | null;
              consumo: Prisma.Decimal;
              costo_promedio: Prisma.Decimal;
              costo_total: Prisma.Decimal;
            }[]
          >`
            -- La receta que se congela en el snapshot es la del DESARROLLO
            -- del producto (2026-08-26). Debe salir de la misma fuente que
            -- v_producto_costo, o el total y el detalle no cuadrarían.
            SELECT i.id_insumo, i.codigo, i.descripcion,
                   cat.nombre AS categoria, cat.orden,
                   um.nombre AS unidad, ar.nombre AS area,
                   di.consumo, i.costo_promedio,
                   (di.consumo * i.costo_promedio) AS costo_total
            FROM recetas.productos p
            JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
            JOIN recetas.desarrollo_insumos di ON di.id_desarrollo = d.id_desarrollo
            JOIN recetas.insumos i ON i.id_insumo = di.id_insumo
            JOIN recetas.categorias_insumo cat ON cat.id_categoria = i.id_categoria
            JOIN recetas.unidades_medida um ON um.id_unidad = i.id_unidad
            LEFT JOIN recetas.areas_uso ar ON ar.id_area = di.id_area
            WHERE p.id_producto = ${prod.id_producto}
            ORDER BY cat.orden, i.codigo
          `;

          for (const ins of insumos) {
            await tx.$executeRaw`
              INSERT INTO recetas.cotizacion_detalle_insumo
                (id_detalle, id_insumo, codigo, descripcion, categoria, orden_categoria,
                 unidad, area, consumo, costo_promedio, costo_total, es_mano_obra)
              VALUES (${idDetalle}, ${ins.id_insumo}, ${ins.codigo}, ${ins.descripcion},
                      ${ins.categoria}, ${ins.orden}, ${ins.unidad}, ${ins.area},
                      ${ins.consumo}, ${ins.costo_promedio}, ${ins.costo_total}, FALSE)
            `;
          }

          const minutos = prod.minutos_mo.toNumber();
          const costoMin = prod.costo_mo_minuto.toNumber();
          if (minutos > 0) {
            await tx.$executeRaw`
              INSERT INTO recetas.cotizacion_detalle_insumo
                (id_detalle, id_insumo, codigo, descripcion, categoria, orden_categoria,
                 unidad, area, consumo, costo_promedio, costo_total, es_mano_obra)
              VALUES (${idDetalle}, NULL, NULL, 'Mano de obra', 'Mano de obra', 999,
                      'Minutos', 'Confeccion', ${minutos}, ${costoMin}, ${minutos * costoMin}, TRUE)
            `;
          }
        }

        await tx.$executeRaw`
          UPDATE recetas.cotizaciones SET total_cantidad = ${totalCantidad}, total_costo = ${totalCosto}
          WHERE id_cotizacion = ${idCotizacion}
        `;

        return {
          idCotizacion,
          folio,
          fechaCreacion: cabecera[0].fecha_creacion,
          totalCantidad,
          totalCosto: Number(totalCosto.toFixed(4)),
          moneda,
          tasaCambio: tasa,
        };
      },
      { timeout: 20000 },
    );
  }

  async listar() {
    const rows = await this.prisma.$queryRaw<
      {
        id_cotizacion: number;
        folio: string;
        fecha_creacion: Date;
        total_cantidad: Prisma.Decimal;
        total_costo: Prisma.Decimal;
        notas: string | null;
        moneda: string;
        tasa_cambio: Prisma.Decimal | null;
      }[]
    >`
      SELECT id_cotizacion, folio, fecha_creacion, total_cantidad, total_costo, notas,
             moneda, tasa_cambio
      FROM recetas.cotizaciones ORDER BY fecha_creacion DESC LIMIT 200
    `;
    return rows.map((r) => ({
      idCotizacion: r.id_cotizacion,
      folio: r.folio,
      fechaCreacion: r.fecha_creacion,
      totalCantidad: r.total_cantidad.toNumber(),
      totalCosto: r.total_costo.toNumber(),
      notas: r.notas,
      moneda: r.moneda,
      tasaCambio: r.tasa_cambio ? r.tasa_cambio.toNumber() : null,
    }));
  }

  async obtener(id: number) {
    const cab = await this.prisma.$queryRaw<
      {
        id_cotizacion: number;
        folio: string;
        fecha_creacion: Date;
        total_cantidad: Prisma.Decimal;
        total_costo: Prisma.Decimal;
        notas: string | null;
        moneda: string;
        tasa_cambio: Prisma.Decimal | null;
      }[]
    >`SELECT * FROM recetas.cotizaciones WHERE id_cotizacion = ${id}`;
    if (cab.length === 0) throw new NotFoundException('No encontrada');

    const detalles = await this.prisma.$queryRaw<
      {
        id_detalle: number;
        id_producto: number | null;
        codigo_producto: string;
        descripcion: string;
        cantidad: Prisma.Decimal;
        costo_unitario: Prisma.Decimal;
        costo_total: Prisma.Decimal;
        desarrollo: string | null;
        patron: string | null;
        tamano: string | null;
        deporte: string | null;
        cliente: string | null;
        precio_venta: Prisma.Decimal | null;
      }[]
    >`
      SELECT id_detalle, id_producto, codigo_producto, descripcion, cantidad,
             costo_unitario, costo_total,
             desarrollo, patron, tamano, deporte, cliente, precio_venta
      FROM recetas.cotizacion_detalle WHERE id_cotizacion = ${id} ORDER BY id_detalle
    `;

    const detalle: Record<string, unknown>[] = [];
    for (const linea of detalles) {
      let insumos: Record<string, unknown>[] = [];
      let manoObra: Record<string, unknown> | null = null;

      const snap = await this.prisma.$queryRaw<
        {
          codigo: string | null;
          descripcion: string;
          categoria: string;
          orden: number;
          unidad: string | null;
          area: string | null;
          consumo: Prisma.Decimal;
          costo_promedio: Prisma.Decimal;
          costo_total: Prisma.Decimal;
          es_mano_obra: boolean;
        }[]
      >`
        SELECT codigo, descripcion, categoria, orden_categoria AS orden,
               unidad, area, consumo,
               round(costo_promedio, 6) AS costo_promedio,
               round(costo_total, 6) AS costo_total, es_mano_obra
        FROM recetas.cotizacion_detalle_insumo
        WHERE id_detalle = ${linea.id_detalle}
        ORDER BY orden_categoria, codigo
      `;

      let fuente: 'snapshot' | 'receta_actual' = 'snapshot';
      if (snap.length > 0) {
        for (const r of snap) {
          if (r.es_mano_obra) {
            manoObra = {
              categoria: 'Mano de obra',
              codigo: null,
              descripcion: 'Mano de obra',
              consumo: r.consumo.toNumber(),
              unidad: r.unidad ?? 'Minutos',
              area: r.area ?? 'Confeccion',
              costoPromedio: r.costo_promedio.toNumber(),
              costoTotal: r.costo_total.toNumber(),
            };
          } else {
            insumos.push({
              categoria: r.categoria,
              orden: r.orden,
              codigo: r.codigo,
              descripcion: r.descripcion,
              consumo: r.consumo.toNumber(),
              unidad: r.unidad,
              area: r.area,
              costoPromedio: r.costo_promedio.toNumber(),
              costoTotal: r.costo_total.toNumber(),
            });
          }
        }
      } else if (linea.id_producto) {
        fuente = 'receta_actual';
        const ins = await this.prisma.$queryRaw<
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
          -- Receta actual = la del desarrollo del producto (2026-08-26).
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
          WHERE p.id_producto = ${linea.id_producto}
          ORDER BY cat.orden, i.codigo
        `;
        insumos = ins.map((r) => ({
          categoria: r.categoria,
          orden: r.orden,
          codigo: r.codigo,
          descripcion: r.descripcion,
          consumo: r.consumo.toNumber(),
          unidad: r.unidad,
          area: r.area,
          costoPromedio: r.costo_promedio.toNumber(),
          costoTotal: r.costo_total.toNumber(),
        }));
        const prodRows = await this.prisma.$queryRaw<
          { minutos_mo: Prisma.Decimal; costo_mo_minuto: Prisma.Decimal }[]
        >`SELECT COALESCE(d.minutos_mo, 0) AS minutos_mo,
                 COALESCE(d.costo_mo_minuto, 0) AS costo_mo_minuto
            FROM recetas.productos p
            LEFT JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
           WHERE p.id_producto = ${linea.id_producto}`;
        if (prodRows.length > 0) {
          const p = prodRows[0];
          manoObra = {
            categoria: 'Mano de obra',
            codigo: null,
            descripcion: 'Mano de obra',
            consumo: p.minutos_mo.toNumber(),
            unidad: 'Minutos',
            area: 'Confeccion',
            costoPromedio: p.costo_mo_minuto.toNumber(),
            costoTotal: p.minutos_mo.toNumber() * p.costo_mo_minuto.toNumber(),
          };
        }
      }

      detalle.push({
        idDetalle: linea.id_detalle,
        idProducto: linea.id_producto,
        codigoProducto: linea.codigo_producto,
        descripcion: linea.descripcion,
        cantidad: linea.cantidad.toNumber(),
        costoUnitario: linea.costo_unitario.toNumber(),
        costoTotal: linea.costo_total.toNumber(),
        desarrollo: linea.desarrollo,
        patron: linea.patron,
        tamano: linea.tamano,
        deporte: linea.deporte,
        cliente: linea.cliente,
        precioVenta: linea.precio_venta ? linea.precio_venta.toNumber() : null,
        insumos,
        manoObra,
        fuente,
      });
    }

    const c = cab[0];
    return {
      cotizacion: {
        idCotizacion: c.id_cotizacion,
        folio: c.folio,
        fechaCreacion: c.fecha_creacion,
        totalCantidad: c.total_cantidad.toNumber(),
        totalCosto: c.total_costo.toNumber(),
        notas: c.notas,
        moneda: c.moneda,
        tasaCambio: c.tasa_cambio ? c.tasa_cambio.toNumber() : null,
      },
      detalle,
    };
  }

  async resumenMaterial(dto: ResumenMaterialDto) {
    const pares = (dto.items ?? [])
      .map((it) => ({
        codigo: String(it.codigo || ''),
        cantidad: Number(it.cantidad),
      }))
      .filter((it) => it.codigo && it.cantidad > 0);
    if (pares.length === 0) {
      throw new BadRequestException('Productos inválidos');
    }

    const valores = Prisma.join(
      pares.map((p) => Prisma.sql`(${p.codigo}, ${p.cantidad}::numeric)`),
      ',',
    );

    const insumos = await this.prisma.$queryRaw<
      {
        categoria: string;
        codigo: string;
        descripcion: string;
        unidad: string;
        cantidad_total: Prisma.Decimal;
        costo_total: Prisma.Decimal;
      }[]
    >`
      WITH pedido(codigo, cantidad) AS (VALUES ${valores})
      SELECT cat.nombre AS categoria, cat.orden,
             i.codigo, i.descripcion, um.nombre AS unidad,
             SUM(di.consumo * ped.cantidad) AS cantidad_total,
             SUM(di.consumo * ped.cantidad * i.costo_promedio) AS costo_total
      FROM pedido ped
      JOIN recetas.productos p ON p.codigo = ped.codigo
      JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
      JOIN recetas.desarrollo_insumos di ON di.id_desarrollo = d.id_desarrollo
      JOIN recetas.insumos i ON i.id_insumo = di.id_insumo
      JOIN recetas.categorias_insumo cat ON cat.id_categoria = i.id_categoria
      JOIN recetas.unidades_medida um ON um.id_unidad = i.id_unidad
      GROUP BY cat.nombre, cat.orden, i.codigo, i.descripcion, um.nombre
      ORDER BY cat.orden, i.codigo
    `;

    const [mo] = await this.prisma.$queryRaw<
      {
        minutos_total: Prisma.Decimal | null;
        costo_total: Prisma.Decimal | null;
      }[]
    >`
      WITH pedido(codigo, cantidad) AS (VALUES ${valores})
      -- LEFT JOIN + COALESCE: un producto sin desarrollo aporta 0 minutos,
      -- pero no debe desaparecer del resumen.
      SELECT SUM(COALESCE(d.minutos_mo, 0) * ped.cantidad) AS minutos_total,
             SUM(COALESCE(d.minutos_mo, 0) * ped.cantidad * COALESCE(d.costo_mo_minuto, 0)) AS costo_total
      FROM pedido ped
      JOIN recetas.productos p ON p.codigo = ped.codigo
      LEFT JOIN recetas.desarrollos d ON d.codigo = p.desarrollo
    `;

    const [venta] = await this.prisma.$queryRaw<
      { venta_total_usd: Prisma.Decimal | null }[]
    >`
      WITH pedido(codigo, cantidad) AS (VALUES ${valores})
      SELECT SUM(p.precio_venta * ped.cantidad) AS venta_total_usd
      FROM pedido ped
      JOIN recetas.productos p ON p.codigo = ped.codigo
    `;

    const totalPrendas = pares.reduce((s, p) => s + p.cantidad, 0);
    const insumosRows = insumos.map((r) => ({
      categoria: r.categoria,
      codigo: r.codigo,
      descripcion: r.descripcion,
      unidad: r.unidad,
      cantidadTotal: r.cantidad_total.toNumber(),
      costoTotal: r.costo_total.toNumber(),
    }));
    const manoObra = {
      minutosTotal: mo?.minutos_total ? mo.minutos_total.toNumber() : 0,
      horasTotal: (mo?.minutos_total ? mo.minutos_total.toNumber() : 0) / 60,
      costoTotal: mo?.costo_total ? mo.costo_total.toNumber() : 0,
    };
    const costoInsumos = insumosRows.reduce((s, r) => s + r.costoTotal, 0);
    const costoGeneral = costoInsumos + manoObra.costoTotal;

    return {
      totalPrendas,
      insumos: insumosRows,
      manoObra,
      costoInsumos,
      costoGeneral,
      ventaTotalUsd: venta?.venta_total_usd
        ? venta.venta_total_usd.toNumber()
        : 0,
    };
  }
}
