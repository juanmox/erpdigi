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
import { CambiarActivoDto } from './dto/cambiar-activo.dto';
import { CrearInsumoDto } from './dto/crear-insumo.dto';
import { EditarInsumoDto } from './dto/editar-insumo.dto';
import { GuardarPreciosDto } from './dto/guardar-precios.dto';

const AZUL_DIGITEXSA = 'FF203080';
// Las plantillas de este archivo tienen título (fila 1) + instrucciones
// (fila 2, celda combinada) + fila en blanco (3) + encabezado (4) antes de
// los datos. Bug real encontrado en costeo-estandar/costeo-ordenes/
// productos con el mismo patrón: al saltar solo la fila 1, las filas 2 y 4
// se leían como si fueran datos.
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

export interface FilaPreviewPrecio {
  fila: number;
  codigo: string;
  encontrado: boolean;
  idInsumo: number | null;
  descripcion: string | null;
  costoActual: number | null;
  costoNuevo: number | null;
  delta: number | null;
  error: string | null;
}

export interface FilaPreviewAlta {
  fila: number;
  codigo: string;
  descripcion: string;
  categoria: string;
  unidad: string;
  idCategoria: number | null;
  idUnidad: number | null;
  costoInicial: number | null;
  error: string | null;
}

@Injectable()
export class InsumosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(estado: 'activos' | 'inactivos' | 'todos' = 'activos') {
    const where: Prisma.InsumoWhereInput =
      estado === 'activos'
        ? { activo: true }
        : estado === 'inactivos'
          ? { activo: false }
          : {};
    const rows = await this.prisma.insumo.findMany({
      where,
      include: { categoria: true, unidad: true },
      orderBy: [{ categoria: { orden: 'asc' } }, { codigo: 'asc' }],
    });
    return rows.map((i) => ({
      idInsumo: i.idInsumo,
      codigo: i.codigo,
      descripcion: i.descripcion,
      activo: i.activo,
      idCategoria: i.idCategoria,
      idUnidad: i.idUnidad,
      costoPromedio: i.costoPromedio.toNumber(),
      categoria: i.categoria.nombre,
      ordenCategoria: i.categoria.orden,
      unidad: i.unidad.nombre,
    }));
  }

  async guardarPrecios(dto: GuardarPreciosDto, idUsuarioActor: number) {
    const cambios = dto.cambios ?? [];
    if (cambios.length === 0) {
      throw new BadRequestException('No hay cambios para guardar');
    }
    for (const c of cambios) {
      if (!(c.costoPromedio >= 0)) {
        throw new BadRequestException(
          'Hay cambios inválidos, no se aplicó nada',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const errores: { idInsumo: number; motivo: string }[] = [];
      let actualizados = 0;
      for (const c of cambios) {
        const r = await tx.insumo.updateMany({
          where: { idInsumo: c.idInsumo, activo: true },
          data: { costoPromedio: c.costoPromedio },
        });
        if (r.count === 0) {
          errores.push({
            idInsumo: c.idInsumo,
            motivo: 'insumo no encontrado o inactivo',
          });
        } else {
          actualizados += r.count;
        }
      }
      if (errores.length > 0) {
        throw new BadRequestException({
          error: 'Hay insumos no encontrados o inactivos, no se aplicó nada',
          detalle: errores,
        });
      }
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'insumos',
        idEntidad: cambios.map((c) => c.idInsumo).join(','),
        accion: 'UPDATE',
        datosNuevos: { cambios: cambios as unknown as Record<string, unknown> },
      });
      return { actualizados };
    });
  }

  async previewImportarPrecios(
    buffer: Buffer,
  ): Promise<{ filas: FilaPreviewPrecio[] }> {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');

    const crudo: { fila: number; codigo: string; costo: number }[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber < FILA_INICIO_DATOS) return;
      const codigo = textoCelda(row.getCell(1).value).trim();
      const costoCell = row.getCell(2).value;
      const costo =
        costoCell === null || costoCell === undefined || costoCell === ''
          ? NaN
          : Number(costoCell);
      crudo.push({ fila: rowNumber, codigo, costo });
    });

    const codigos = [...new Set(crudo.map((r) => r.codigo).filter(Boolean))];
    const existentes = codigos.length
      ? await this.prisma.insumo.findMany({
          where: { codigo: { in: codigos }, activo: true },
        })
      : [];
    const porCodigo = new Map(existentes.map((r) => [r.codigo, r]));

    const vistos = new Set<string>();
    const filas: FilaPreviewPrecio[] = crudo.map((r) => {
      let error: string | null = null;
      if (!r.codigo) error = 'Código vacío';
      else if (vistos.has(r.codigo)) error = 'Código duplicado en el archivo';
      else if (!Number.isFinite(r.costo) || r.costo < 0)
        error = 'Costo nuevo inválido (debe ser numérico y >= 0)';
      else if (!porCodigo.has(r.codigo))
        error = 'Código no encontrado o inactivo';
      if (r.codigo) vistos.add(r.codigo);

      const existente = porCodigo.get(r.codigo);
      const costoActual = existente ? existente.costoPromedio.toNumber() : null;
      return {
        fila: r.fila,
        codigo: r.codigo,
        encontrado: !!existente,
        idInsumo: existente ? existente.idInsumo : null,
        descripcion: existente ? existente.descripcion : null,
        costoActual,
        costoNuevo: Number.isFinite(r.costo) ? r.costo : null,
        delta:
          existente && Number.isFinite(r.costo)
            ? r.costo - (costoActual as number)
            : null,
        error,
      };
    });

    return { filas };
  }

  // No existía ninguna plantilla descargable para este import — a
  // diferencia de altas de insumos/productos/consumo estándar/órdenes, que
  // sí la tienen. Encontrado al revisar la pantalla de Precios con el
  // usuario. Mismo patrón visual que plantillaAlta().
  async plantillaPrecios(): Promise<ExcelJS.Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Precios');
    ws.mergeCells('A1:B1');
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Actualización masiva de precios de insumos';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells('A2:B2');
    ws.getCell('A2').value =
      'Una fila por insumo a actualizar. El código debe coincidir con uno ya existente y activo — ' +
      'un código que no exista o esté inactivo queda pendiente, no se crea ni se reactiva nada automáticamente.';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };
    const headerRow = ws.getRow(4);
    headerRow.values = ['Código', 'Costo nuevo'];
    headerRow.eachCell(estiloEncabezado);
    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 14;
    ws.getColumn(2).numFmt = '#,##0.0000';
    ws.views = [{ state: 'frozen', ySplit: 4 }];

    return wb.xlsx.writeBuffer();
  }

  async exportarExcel(): Promise<ExcelJS.Buffer> {
    const rows = await this.prisma.insumo.findMany({
      where: { activo: true },
      include: { categoria: true, unidad: true },
      orderBy: [{ categoria: { orden: 'asc' } }, { codigo: 'asc' }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();
    const ws = wb.addWorksheet('Insumos');

    ws.mergeCells('A1:E1');
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Precios de insumos';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells('A2:E2');
    ws.getCell('A2').value =
      `Generado: ${new Date().toLocaleString('es-GT')}   |   Total: ${rows.length}` +
      `   |   Para reimportar: editar la columna "Costo nuevo" y subir este mismo archivo`;
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };

    const headerRow = ws.getRow(4);
    headerRow.values = [
      'Código',
      'Costo nuevo',
      'Descripción',
      'Categoría',
      'Unidad',
    ];
    headerRow.eachCell(estiloEncabezado);

    for (const r of rows) {
      ws.addRow([
        r.codigo,
        r.costoPromedio.toNumber(),
        r.descripcion,
        r.categoria.nombre,
        r.unidad.nombre,
      ]);
    }

    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 48;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 14;
    ws.getColumn(2).numFmt = '#,##0.0000';
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 5 } };

    return wb.xlsx.writeBuffer();
  }

  async crear(dto: CrearInsumoDto, idUsuarioActor: number) {
    try {
      const insumo = await this.prisma.insumo.create({
        data: {
          codigo: dto.codigo.trim(),
          descripcion: dto.descripcion.trim(),
          idCategoria: dto.idCategoria,
          idUnidad: dto.idUnidad,
          costoPromedio: dto.costoPromedio ?? 0,
        },
      });
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'insumos',
        idEntidad: String(insumo.idInsumo),
        accion: 'CREATE',
        datosNuevos: { idInsumo: insumo.idInsumo, codigo: insumo.codigo },
      });
      return { idInsumo: insumo.idInsumo };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002')
          throw new BadRequestException(
            `Ya existe un insumo con el código "${dto.codigo}"`,
          );
        if (e.code === 'P2003')
          throw new BadRequestException('Categoría o unidad no existe');
      }
      throw e;
    }
  }

  async editar(id: number, dto: EditarInsumoDto, idUsuarioActor: number) {
    const anterior = await this.prisma.insumo.findUnique({
      where: { idInsumo: id },
    });
    if (!anterior) throw new NotFoundException('Insumo no encontrado');
    try {
      await this.prisma.insumo.update({
        where: { idInsumo: id },
        data: {
          descripcion: dto.descripcion.trim(),
          idCategoria: dto.idCategoria,
          idUnidad: dto.idUnidad,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException('Categoría o unidad no existe');
      }
      throw e;
    }
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'insumos',
      idEntidad: String(id),
      accion: 'UPDATE',
      datosAnteriores: {
        descripcion: anterior.descripcion,
        idCategoria: anterior.idCategoria,
        idUnidad: anterior.idUnidad,
      },
      datosNuevos: {
        descripcion: dto.descripcion,
        idCategoria: dto.idCategoria,
        idUnidad: dto.idUnidad,
      },
    });
    return { actualizado: true };
  }

  async cambiarActivo(
    id: number,
    dto: CambiarActivoDto,
    idUsuarioActor: number,
  ) {
    const anterior = await this.prisma.insumo.findUnique({
      where: { idInsumo: id },
    });
    if (!anterior) throw new NotFoundException('Insumo no encontrado');
    await this.prisma.insumo.update({
      where: { idInsumo: id },
      data: { activo: dto.activo },
    });
    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'insumos',
      idEntidad: String(id),
      accion: 'UPDATE',
      datosAnteriores: { activo: anterior.activo },
      datosNuevos: { activo: dto.activo },
    });
    return { activo: dto.activo };
  }

  async previewImportarAltas(
    buffer: Buffer,
  ): Promise<{ filas: FilaPreviewAlta[] }> {
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
      categoria: string;
      unidad: string;
      costoCell: unknown;
    }[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber < FILA_INICIO_DATOS) return;
      crudo.push({
        fila: rowNumber,
        codigo: textoCelda(row.getCell(1).value).trim(),
        descripcion: textoCelda(row.getCell(2).value).trim(),
        categoria: textoCelda(row.getCell(3).value).trim(),
        unidad: textoCelda(row.getCell(4).value).trim(),
        costoCell: row.getCell(5).value,
      });
    });

    const [categorias, unidades, existentes] = await Promise.all([
      this.prisma.categoriaInsumo.findMany(),
      this.prisma.unidadMedida.findMany(),
      this.prisma.insumo.findMany({ select: { codigo: true } }),
    ]);
    const catPorNombre = new Map(
      categorias.map((c) => [c.nombre.toLowerCase(), c.idCategoria]),
    );
    const umPorNombre = new Map(
      unidades.map((u) => [u.nombre.toLowerCase(), u.idUnidad]),
    );
    const codigosExistentes = new Set(existentes.map((e) => e.codigo));

    const vistos = new Set<string>();
    const filas: FilaPreviewAlta[] = crudo.map((r) => {
      const costo =
        r.costoCell === null || r.costoCell === undefined || r.costoCell === ''
          ? 0
          : Number(r.costoCell);
      let error: string | null = null;
      if (!r.codigo) error = 'Código vacío';
      else if (vistos.has(r.codigo)) error = 'Código duplicado en el archivo';
      else if (codigosExistentes.has(r.codigo))
        error = 'Ya existe un insumo con ese código';
      else if (!r.descripcion) error = 'Descripción vacía';
      else if (!catPorNombre.has(r.categoria.toLowerCase()))
        error = `Categoría "${r.categoria}" no reconocida`;
      else if (!umPorNombre.has(r.unidad.toLowerCase()))
        error = `Unidad "${r.unidad}" no reconocida`;
      else if (!Number.isFinite(costo) || costo < 0)
        error = 'Costo inicial inválido';
      if (r.codigo) vistos.add(r.codigo);

      return {
        fila: r.fila,
        codigo: r.codigo,
        descripcion: r.descripcion,
        categoria: r.categoria,
        unidad: r.unidad,
        idCategoria: catPorNombre.get(r.categoria.toLowerCase()) ?? null,
        idUnidad: umPorNombre.get(r.unidad.toLowerCase()) ?? null,
        costoInicial: Number.isFinite(costo) ? costo : null,
        error,
      };
    });

    return { filas };
  }

  async altas(
    altas: {
      codigo: string;
      descripcion: string;
      idCategoria: number;
      idUnidad: number;
      costoPromedio?: number;
    }[],
    idUsuarioActor: number,
  ) {
    if (!altas || altas.length === 0)
      throw new BadRequestException('No hay altas para guardar');

    return this.prisma.$transaction(async (tx) => {
      const errores: { codigo: string; motivo: string }[] = [];
      let creados = 0;
      for (const a of altas) {
        try {
          await tx.insumo.create({
            data: {
              codigo: a.codigo,
              descripcion: a.descripcion,
              idCategoria: a.idCategoria,
              idUnidad: a.idUnidad,
              costoPromedio: a.costoPromedio ?? 0,
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
        entidad: 'insumos',
        idEntidad: altas.map((a) => a.codigo).join(','),
        accion: 'CREATE',
        datosNuevos: { creados },
      });
      return { creados };
    });
  }

  async plantillaAlta(): Promise<ExcelJS.Buffer> {
    const [categorias, unidades] = await Promise.all([
      this.prisma.categoriaInsumo.findMany({
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      }),
      this.prisma.unidadMedida.findMany({ orderBy: { nombre: 'asc' } }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Altas de insumos');
    ws.mergeCells('A1:E1');
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Alta masiva de insumos';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells('A2:E2');
    ws.getCell('A2').value =
      'Completar una fila por insumo nuevo. Categoría y Unidad deben coincidir ' +
      'exactamente con los nombres de la hoja "Categorías y unidades válidas".';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };
    const headerRow = ws.getRow(4);
    headerRow.values = [
      'Código',
      'Descripción',
      'Categoría',
      'Unidad',
      'Costo inicial',
    ];
    headerRow.eachCell(estiloEncabezado);
    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 48;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 14;
    ws.getColumn(5).width = 14;
    ws.getColumn(5).numFmt = '#,##0.0000';
    ws.views = [{ state: 'frozen', ySplit: 4 }];

    const wsRef = wb.addWorksheet('Categorías y unidades válidas');
    wsRef.getRow(1).values = ['Categorías', 'Unidades'];
    wsRef.getRow(1).font = { bold: true };
    const maxLen = Math.max(categorias.length, unidades.length);
    for (let i = 0; i < maxLen; i++) {
      wsRef.getRow(i + 2).getCell(1).value = categorias[i]?.nombre ?? '';
      wsRef.getRow(i + 2).getCell(2).value = unidades[i]?.nombre ?? '';
    }
    wsRef.getColumn(1).width = 20;
    wsRef.getColumn(2).width = 20;

    return wb.xlsx.writeBuffer();
  }
}
