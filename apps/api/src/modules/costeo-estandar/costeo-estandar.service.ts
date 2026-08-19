import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { fechaCelda, textoCelda } from '../../common/excel-celda';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CrearConsumoEstandarDto } from './dto/crear-consumo-estandar.dto';
import { FilaPreviewConsumoEstandar } from './costeo-estandar.types';

const AZUL_DIGITEXSA = 'FF203080';

function estiloEncabezado(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: AZUL_DIGITEXSA },
  };
}

// vigente_desde/vigente_hasta son `date` (sin hora) — dos eventos en el
// mismo día calendario truncan a la misma fecha en Postgres, y el CHECK
// `vigente_hasta > vigente_desde` rechazaría cerrar una fila con la misma
// fecha de su propio inicio. Comparar por día evita ese caso (bug real
// encontrado con curl: dos altas del mismo producto+talla en la misma
// sesión de pruebas).
function inicioDelDia(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

@Injectable()
export class CosteoEstandarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // Por defecto solo la versión vigente HOY de cada producto+talla — con el
  // patrón de auto-reemplazo (ver resolverReemplazo más abajo) un producto
  // que se actualiza varias veces acumula una fila por versión, y listarlas
  // todas sería ilegible (ej. 5 actualizaciones × 13 tallas = 65 filas para
  // "un" producto). `incluirHistorial=true` expone todas las versiones.
  listar(productoCodigo?: string, incluirHistorial?: boolean) {
    const hoy = new Date();
    return this.prisma.consumoEstandar.findMany({
      where: {
        ...(productoCodigo
          ? {
              producto: {
                codigo: {
                  contains: productoCodigo,
                  mode: 'insensitive' as const,
                },
              },
            }
          : {}),
        ...(incluirHistorial
          ? {}
          : {
              vigenteDesde: { lte: hoy },
              OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: hoy } }],
            }),
      },
      include: { producto: true, talla: true },
      orderBy: [
        { producto: { codigo: 'asc' } },
        { idTalla: 'asc' },
        { vigenteDesde: 'desc' },
      ],
    });
  }

  // EXCLUDE USING gist (id_producto, id_talla, vigencia) ya lo impide a nivel
  // de base — pero en vez de solo rechazar un solape, si es un caso resoluble
  // se resuelve solo, en dos variantes:
  //  - misma fecha (mismo día que la fila vigente): no se puede representar
  //    como un rango separado (el CHECK exige vigente_hasta > vigente_desde),
  //    así que se CORRIGE el valor de la fila existente en el lugar.
  //  - fecha posterior: se CIERRA la fila anterior (vigente_hasta = la nueva
  //    fecha) y se crea la nueva — mismo patrón que
  //    costeo-rollos.service.ts:montar() con el montaje anterior.
  // Decisión del usuario (2026-08-18): manual sería inmanejable con varias
  // actualizaciones × 13 tallas por producto. Casos genuinamente ambiguos
  // (más de una fila solapada, o la fecha nueva es anterior a la vigente)
  // siguen rechazándose — no se adivina cuál reemplaza a cuál.
  private async resolverReemplazo(
    idProducto: number,
    idTalla: number,
    vigenteDesde: Date,
    vigenteHasta: Date | null,
    excluirId?: number,
  ): Promise<{ idACorregir: number | null; idACerrar: number | null }> {
    const solapados = await this.prisma.consumoEstandar.findMany({
      where: {
        idProducto,
        idTalla,
        ...(excluirId ? { idConsumoEstandar: { not: excluirId } } : {}),
        OR: [{ vigenteHasta: null }, { vigenteHasta: { gt: vigenteDesde } }],
        ...(vigenteHasta ? { vigenteDesde: { lt: vigenteHasta } } : {}),
      },
      include: { producto: true },
    });
    if (solapados.length === 0) return { idACorregir: null, idACerrar: null };
    if (solapados.length === 1 && solapados[0].vigenteHasta === null) {
      const nueva = inicioDelDia(vigenteDesde);
      const existente = inicioDelDia(solapados[0].vigenteDesde);
      if (nueva === existente)
        return { idACorregir: solapados[0].idConsumoEstandar, idACerrar: null };
      if (nueva > existente)
        return { idACorregir: null, idACerrar: solapados[0].idConsumoEstandar };
    }
    const s = solapados[0];
    throw new ConflictException(
      `Ya existe un consumo estándar para "${s.producto.codigo}" + esta talla que se solapa con el rango dado (vigente desde ${s.vigenteDesde.toISOString().slice(0, 10)}${s.vigenteHasta ? ` hasta ${s.vigenteHasta.toISOString().slice(0, 10)}` : ', sin fecha de corte'}) y no se puede reemplazar automáticamente — revisar manualmente.`,
    );
  }

  async crear(dto: CrearConsumoEstandarDto, idUsuarioActor: number) {
    const producto = await this.prisma.producto.findUnique({
      where: { idProducto: dto.idProducto },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    const talla = await this.prisma.talla.findUnique({
      where: { idTalla: dto.idTalla },
    });
    if (!talla) throw new NotFoundException('Talla no encontrada');

    const vigenteDesde = dto.vigenteDesde
      ? new Date(dto.vigenteDesde)
      : new Date();
    const vigenteHasta = dto.vigenteHasta ? new Date(dto.vigenteHasta) : null;
    if (vigenteHasta && vigenteHasta <= vigenteDesde)
      throw new BadRequestException(
        '"Vigente hasta" debe ser posterior a "Vigente desde"',
      );

    const { idACorregir, idACerrar } = await this.resolverReemplazo(
      dto.idProducto,
      dto.idTalla,
      vigenteDesde,
      vigenteHasta,
    );

    const resultado = await this.prisma.$transaction(async (tx) => {
      if (idACorregir)
        return tx.consumoEstandar.update({
          where: { idConsumoEstandar: idACorregir },
          data: { pulgadasPapel: dto.pulgadasPapel },
          include: { producto: true, talla: true },
        });
      if (idACerrar)
        await tx.consumoEstandar.update({
          where: { idConsumoEstandar: idACerrar },
          data: { vigenteHasta: vigenteDesde },
        });
      return tx.consumoEstandar.create({
        data: {
          idProducto: dto.idProducto,
          idTalla: dto.idTalla,
          pulgadasPapel: dto.pulgadasPapel,
          vigenteDesde,
          vigenteHasta,
          creadoPor: idUsuarioActor,
        },
        include: { producto: true, talla: true },
      });
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.consumo_estandar',
      idEntidad: String(resultado.idConsumoEstandar),
      accion: idACorregir ? 'UPDATE' : 'CREATE',
      datosNuevos: {
        idProducto: dto.idProducto,
        idTalla: dto.idTalla,
        pulgadasPapel: dto.pulgadasPapel,
        reemplazo: idACerrar ?? undefined,
      },
    });

    return resultado;
  }

  async previewImportar(
    buffer: Buffer,
  ): Promise<{ filas: FilaPreviewConsumoEstandar[] }> {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');

    const crudo: {
      fila: number;
      productoCodigo: string;
      tallaNombre: string;
      pulgadasPapel: unknown;
      vigenteDesde: Date | null;
      vigenteHasta: Date | null;
    }[] = [];

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const productoCodigo = textoCelda(row.getCell(1).value).trim();
      if (!productoCodigo) return;
      crudo.push({
        fila: rowNumber,
        productoCodigo,
        tallaNombre: textoCelda(row.getCell(2).value).trim(),
        pulgadasPapel: row.getCell(3).value,
        vigenteDesde: fechaCelda(row.getCell(4).value),
        vigenteHasta: fechaCelda(row.getCell(5).value),
      });
    });

    const [productos, tallas, existentes] = await Promise.all([
      this.prisma.producto.findMany({
        select: { idProducto: true, codigo: true },
      }),
      this.prisma.talla.findMany({ select: { idTalla: true, nombre: true } }),
      this.prisma.consumoEstandar.findMany({
        select: {
          idConsumoEstandar: true,
          idProducto: true,
          idTalla: true,
          vigenteDesde: true,
          vigenteHasta: true,
        },
      }),
    ]);
    const productoPorCodigo = new Map(
      productos.map((p) => [p.codigo.toLowerCase(), p.idProducto]),
    );
    const tallaPorNombre = new Map(
      tallas.map((t) => [t.nombre.toLowerCase(), t.idTalla]),
    );

    // Igual que resolverReemplazo() del alta uno-por-uno: misma fecha (mismo
    // día) → corrige la fila existente en el lugar; fecha posterior → cierra
    // la existente y crea una nueva. Casos ambiguos (más de una fila
    // solapada, o fecha nueva anterior a la vigente) quedan pendientes con
    // error — no se adivina cuál reemplaza a cuál.
    function resolverReemplazoOError(
      idProducto: number,
      idTalla: number,
      desde: Date,
      hasta: Date | null,
    ): {
      reemplazaId: number | null;
      corrigeId: number | null;
      error: string | null;
    } {
      const solapados = existentes.filter(
        (e) =>
          e.idProducto === idProducto &&
          e.idTalla === idTalla &&
          (e.vigenteHasta === null || e.vigenteHasta > desde) &&
          (hasta === null || e.vigenteDesde < hasta),
      );
      if (solapados.length === 0)
        return { reemplazaId: null, corrigeId: null, error: null };
      if (solapados.length === 1 && solapados[0].vigenteHasta === null) {
        const nueva = inicioDelDia(desde);
        const existente = inicioDelDia(solapados[0].vigenteDesde);
        if (nueva === existente)
          return {
            reemplazaId: null,
            corrigeId: solapados[0].idConsumoEstandar,
            error: null,
          };
        if (nueva > existente)
          return {
            reemplazaId: solapados[0].idConsumoEstandar,
            corrigeId: null,
            error: null,
          };
      }
      return {
        reemplazaId: null,
        corrigeId: null,
        error:
          'Ya existe un consumo estándar para ese producto+talla que no se puede reemplazar automáticamente (fechas ambiguas) — revisar manualmente',
      };
    }

    // Dentro del mismo archivo también puede haber dos filas para el mismo
    // producto+talla con fechas que se solapan — se valida igual que contra
    // la base, acumulando las filas ya vistas y válidas.
    const vistasValidas: {
      idProducto: number;
      idTalla: number;
      vigenteDesde: Date;
      vigenteHasta: Date | null;
    }[] = [];

    const filas: FilaPreviewConsumoEstandar[] = crudo.map((r) => {
      const idProducto =
        productoPorCodigo.get(r.productoCodigo.toLowerCase()) ?? null;
      const idTalla = tallaPorNombre.get(r.tallaNombre.toLowerCase()) ?? null;
      const pulgadasPapel =
        r.pulgadasPapel == null || r.pulgadasPapel === ''
          ? NaN
          : Number(r.pulgadasPapel);
      // Decisión del usuario (2026-08-18): el legacy "Consumos" no trae
      // fecha — en blanco = hoy, nunca se inventa una fecha pasada.
      const vigenteDesde = r.vigenteDesde ?? new Date();
      const vigenteHasta = r.vigenteHasta;

      let error: string | null = null;
      let reemplazaId: number | null = null;
      let corrigeId: number | null = null;
      if (!r.productoCodigo) error = 'Producto vacío';
      else if (idProducto === null)
        error = `Producto "${r.productoCodigo}" no existe — dar de alta primero`;
      else if (!r.tallaNombre) error = 'Talla vacía';
      else if (idTalla === null)
        error = `Talla "${r.tallaNombre}" no reconocida`;
      else if (!Number.isFinite(pulgadasPapel) || pulgadasPapel <= 0)
        error = 'Pulgadas de papel inválidas (debe ser mayor a 0)';
      else if (vigenteHasta && vigenteHasta <= vigenteDesde)
        error = '"Vigente hasta" debe ser posterior a "Vigente desde"';
      else if (
        vistasValidas.some(
          (v) =>
            v.idProducto === idProducto &&
            v.idTalla === idTalla &&
            (v.vigenteHasta === null || v.vigenteHasta > vigenteDesde) &&
            (vigenteHasta === null || v.vigenteDesde < vigenteHasta),
        )
      )
        error =
          'Se solapa con otra fila del mismo archivo (mismo producto+talla)';
      else {
        const r2 = resolverReemplazoOError(
          idProducto,
          idTalla,
          vigenteDesde,
          vigenteHasta,
        );
        reemplazaId = r2.reemplazaId;
        corrigeId = r2.corrigeId;
        error = r2.error;
      }

      if (!error && idProducto !== null && idTalla !== null)
        vistasValidas.push({ idProducto, idTalla, vigenteDesde, vigenteHasta });

      return {
        fila: r.fila,
        productoCodigo: r.productoCodigo,
        idProducto,
        tallaNombre: r.tallaNombre,
        idTalla,
        pulgadasPapel: Number.isFinite(pulgadasPapel) ? pulgadasPapel : 0,
        vigenteDesde: vigenteDesde.toISOString(),
        vigenteHasta: vigenteHasta ? vigenteHasta.toISOString() : null,
        reemplazaId,
        corrigeId,
        error,
      } satisfies FilaPreviewConsumoEstandar;
    });

    return { filas };
  }

  async aplicarImportar(
    filas: FilaPreviewConsumoEstandar[],
    idUsuarioActor: number,
  ) {
    if (!filas || filas.length === 0)
      throw new BadRequestException('No hay filas para importar');

    const validas = filas.filter((f) => !f.error && f.idProducto && f.idTalla);

    const resultado = await this.prisma.$transaction(async (tx) => {
      let creados = 0;
      let reemplazados = 0;
      let corregidos = 0;
      for (const f of validas) {
        if (f.corrigeId) {
          await tx.consumoEstandar.update({
            where: { idConsumoEstandar: f.corrigeId },
            data: { pulgadasPapel: f.pulgadasPapel },
          });
          corregidos++;
          continue;
        }
        if (f.reemplazaId) {
          await tx.consumoEstandar.update({
            where: { idConsumoEstandar: f.reemplazaId },
            data: { vigenteHasta: new Date(f.vigenteDesde!) },
          });
          reemplazados++;
        }
        await tx.consumoEstandar.create({
          data: {
            idProducto: f.idProducto!,
            idTalla: f.idTalla!,
            pulgadasPapel: f.pulgadasPapel,
            vigenteDesde: new Date(f.vigenteDesde!),
            vigenteHasta: f.vigenteHasta ? new Date(f.vigenteHasta) : null,
            creadoPor: idUsuarioActor,
          },
        });
        creados++;
      }
      return { creados, reemplazados, corregidos };
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'costeo.consumo_estandar',
      idEntidad: 'import',
      accion: 'CREATE',
      datosNuevos: resultado,
    });

    return resultado;
  }

  async plantillaImportar(): Promise<ExcelJS.Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Consumo estándar');
    ws.mergeCells(1, 1, 1, 5);
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Carga de Consumo Estándar de Papel (producto + talla → pulgadas)';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells(2, 1, 2, 5);
    ws.getCell('A2').value =
      'Una fila por combinación Producto + Talla. Producto y Talla deben coincidir con códigos ya existentes — si no existen, la fila queda pendiente, no se crea nada automáticamente. ' +
      '"Vigente desde" es opcional — en blanco se usa la fecha de hoy. "Vigente hasta" es opcional — en blanco significa vigente sin fecha de corte. ' +
      'No se permite una fila que se solape en fechas con un consumo ya existente (o con otra fila de este mismo archivo) para el mismo producto+talla.';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };

    const headerRow = ws.getRow(4);
    headerRow.values = [
      'Producto (código)',
      'Talla',
      'Pulgadas de papel',
      'Vigente desde (opcional)',
      'Vigente hasta (opcional)',
    ];
    headerRow.eachCell(estiloEncabezado);
    [20, 12, 16, 18, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));

    return wb.xlsx.writeBuffer();
  }
}
