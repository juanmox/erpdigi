import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { textoCelda } from '../../common/excel-celda';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

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

// Las plantillas de este proyecto llevan 4 filas de preámbulo (título,
// instrucciones, blanco, encabezado) — los datos arrancan en la 5. Leer desde
// la 2 hacía que la fila de instrucciones se colara como si fuera un dato (bug
// real ya corregido en Órdenes y en Consumo Estándar).
const FILA_INICIO_DATOS = 5;

export interface FilaPreviewDesarrollo {
  fila: number;
  codigo: string;
  descripcion: string;
  clienteCodigo: string | null;
  idCliente: number | null;
  tallaBase: string | null;
  idTallaBase: number | null;
  minutosMo: number | null;
  costoMoMinuto: number | null;
  notas: string | null;
  yaExiste: boolean;
  error: string | null;
}

export interface FilaPreviewInsumoDesarrollo {
  fila: number;
  desarrolloCodigo: string;
  insumoCodigo: string;
  consumo: number | null;
  area: string | null;
  desarrolloNuevo: boolean;
  /** El desarrollo ya tiene ese insumo en esa área: aplicar actualiza el consumo. */
  yaCargada: boolean;
  error: string | null;
}

interface DesarrolloInput {
  codigo: string;
  descripcion: string;
  idCliente?: number | null;
  idTallaBase?: number | null;
  minutosMo?: number | null;
  costoMoMinuto?: number | null;
  notas?: string | null;
}

interface LineaInput {
  desarrolloCodigo: string;
  insumoCodigo: string;
  consumo: number;
  area?: string | null;
}

/**
 * Import masivo de desarrollos + su receta. Reemplaza al import combinado
 * "Productos + Receta" de `recetas-productos`, que escribía el BOM en
 * `recetas.producto_insumos` — congelada desde que el desarrollo es dueño de la
 * receta (2026-08-26).
 *
 * Vive en su propio servicio y no dentro de `DesarrollosService` porque ese ya
 * carga la lectura, la escritura de cabecera y el BOM; mezclarle además el
 * parseo de Excel lo volvería el mismo archivo gigante que se quiso evitar al
 * separar desarrollos de productos.
 */
@Injectable()
export class DesarrollosImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async plantilla(): Promise<ExcelJS.Buffer> {
    const [clientes, tallas, insumos, areas] = await Promise.all([
      this.prisma.cliente.findMany({ orderBy: { nombre: 'asc' } }),
      this.prisma.talla.findMany({ orderBy: { orden: 'asc' } }),
      this.prisma.insumo.findMany({
        where: { activo: true },
        orderBy: { codigo: 'asc' },
        select: {
          codigo: true,
          descripcion: true,
          unidad: { select: { nombre: true } },
        },
      }),
      this.prisma.areaUso.findMany({ orderBy: { nombre: 'asc' } }),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const wsDes = wb.addWorksheet('Desarrollos');
    wsDes.mergeCells('A1:G1');
    wsDes.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Alta masiva de desarrollos';
    wsDes.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    wsDes.mergeCells('A2:G2');
    wsDes.getCell('A2').value =
      'Una fila por desarrollo (el prototipo). Los desarrollos nacen en BORRADOR: hay que aprobarlos ' +
      'antes de poder asignarlos a un producto. Cliente y Talla base son opcionales, pero si se llenan ' +
      'deben coincidir con la hoja "Referencias".';
    wsDes.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };
    const filaEncDes = wsDes.getRow(4);
    filaEncDes.values = [
      'Código',
      'Descripción',
      'Cliente (código)',
      'Talla base',
      'Minutos MO',
      'Costo MO/min',
      'Notas',
    ];
    filaEncDes.eachCell(estiloEncabezado);
    [16, 44, 16, 12, 12, 14, 40].forEach(
      (w, i) => (wsDes.getColumn(i + 1).width = w),
    );
    wsDes.getColumn(6).numFmt = '#,##0.0000';
    wsDes.views = [{ state: 'frozen', ySplit: 4 }];

    const wsIns = wb.addWorksheet('Insumos');
    wsIns.mergeCells('A1:D1');
    wsIns.getCell('A1').value = 'Receta de cada desarrollo (insumo por fila)';
    wsIns.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    wsIns.mergeCells('A2:D2');
    wsIns.getCell('A2').value =
      'El código de desarrollo debe existir ya, o venir en la hoja "Desarrollos" de este mismo archivo. ' +
      'Área es opcional. El consumo debe ser mayor que 0.';
    wsIns.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };
    const filaEncIns = wsIns.getRow(4);
    filaEncIns.values = [
      'Código desarrollo',
      'Código insumo',
      'Consumo',
      'Área',
    ];
    filaEncIns.eachCell(estiloEncabezado);
    [20, 20, 14, 20].forEach((w, i) => (wsIns.getColumn(i + 1).width = w));
    wsIns.getColumn(3).numFmt = '#,##0.000000';
    wsIns.views = [{ state: 'frozen', ySplit: 4 }];

    const wsRef = wb.addWorksheet('Referencias');
    wsRef.getRow(1).values = [
      'Código cliente',
      'Nombre cliente',
      'Talla',
      'Área',
      'Código insumo',
      'Descripción insumo',
      'Unidad',
    ];
    wsRef.getRow(1).font = { bold: true };
    const filas = Math.max(
      clientes.length,
      tallas.length,
      areas.length,
      insumos.length,
    );
    for (let i = 0; i < filas; i++) {
      const row = wsRef.getRow(i + 2);
      row.getCell(1).value = clientes[i]?.codigo ?? '';
      row.getCell(2).value = clientes[i]?.nombre ?? '';
      row.getCell(3).value = tallas[i]?.nombre ?? '';
      row.getCell(4).value = areas[i]?.nombre ?? '';
      row.getCell(5).value = insumos[i]?.codigo ?? '';
      row.getCell(6).value = insumos[i]?.descripcion ?? '';
      row.getCell(7).value = insumos[i]?.unidad.nombre ?? '';
    }
    [16, 28, 10, 20, 18, 44, 10].forEach(
      (w, i) => (wsRef.getColumn(i + 1).width = w),
    );

    return wb.xlsx.writeBuffer();
  }

  async preview(buffer: Buffer) {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const wsDes = wb.getWorksheet('Desarrollos');
    const wsIns = wb.getWorksheet('Insumos');
    if (!wsDes && !wsIns)
      throw new BadRequestException(
        'El archivo debe tener una hoja "Desarrollos" y/o una hoja "Insumos"',
      );

    const crudoDes: {
      fila: number;
      codigo: string;
      descripcion: string;
      clienteCodigo: string;
      tallaBase: string;
      minutosCell: unknown;
      costoMoCell: unknown;
      notas: string;
    }[] = [];
    wsDes?.eachRow((row, n) => {
      if (n < FILA_INICIO_DATOS) return;
      const codigo = textoCelda(row.getCell(1).value).trim();
      const descripcion = textoCelda(row.getCell(2).value).trim();
      if (!codigo && !descripcion) return;
      crudoDes.push({
        fila: n,
        codigo,
        descripcion,
        clienteCodigo: textoCelda(row.getCell(3).value).trim(),
        tallaBase: textoCelda(row.getCell(4).value).trim(),
        minutosCell: row.getCell(5).value,
        costoMoCell: row.getCell(6).value,
        notas: textoCelda(row.getCell(7).value).trim(),
      });
    });

    const crudoIns: {
      fila: number;
      desarrolloCodigo: string;
      insumoCodigo: string;
      consumoCell: unknown;
      area: string;
    }[] = [];
    wsIns?.eachRow((row, n) => {
      if (n < FILA_INICIO_DATOS) return;
      const desarrolloCodigo = textoCelda(row.getCell(1).value).trim();
      const insumoCodigo = textoCelda(row.getCell(2).value).trim();
      if (!desarrolloCodigo && !insumoCodigo) return;
      crudoIns.push({
        fila: n,
        desarrolloCodigo,
        insumoCodigo,
        consumoCell: row.getCell(3).value,
        area: textoCelda(row.getCell(4).value).trim(),
      });
    });

    const [clientes, tallas, existentes, insumos, areas, lineasExistentes] =
      await Promise.all([
        this.prisma.cliente.findMany({
          select: { codigo: true, idCliente: true },
        }),
        this.prisma.talla.findMany({ select: { nombre: true, idTalla: true } }),
        this.prisma.desarrollo.findMany({ select: { codigo: true } }),
        this.prisma.insumo.findMany({
          where: { activo: true },
          select: { codigo: true },
        }),
        this.prisma.areaUso.findMany({
          select: { idArea: true, nombre: true },
        }),
        // Para avisar en el preview cuáles líneas ya están cargadas: sin esto,
        // el usuario solo se enteraba al aplicar.
        this.prisma.desarrolloInsumo.findMany({
          select: {
            idArea: true,
            desarrollo: { select: { codigo: true } },
            insumo: { select: { codigo: true } },
          },
        }),
      ]);
    const yaCargadas = new Set(
      lineasExistentes.map(
        (l) =>
          `${l.desarrollo.codigo.toLowerCase()}|${l.insumo.codigo.toLowerCase()}|${l.idArea ?? ''}`,
      ),
    );
    const clientePorCodigo = new Map(
      clientes.map((c) => [c.codigo.toLowerCase(), c.idCliente]),
    );
    const tallaPorNombre = new Map(
      tallas.map((t) => [t.nombre.toLowerCase(), t.idTalla]),
    );
    const existentesSet = new Set(
      existentes.map((d) => d.codigo.trim().toLowerCase()),
    );
    const insumosValidos = new Set(insumos.map((i) => i.codigo.toLowerCase()));
    const areasValidas = new Set(areas.map((a) => a.nombre.toLowerCase()));
    const areasPorNombre = new Map(
      areas.map((a) => [a.nombre.toLowerCase(), a.idArea]),
    );

    const vistos = new Set<string>();
    const nuevosValidos = new Set<string>();
    const desarrollos: FilaPreviewDesarrollo[] = crudoDes.map((r) => {
      const clave = r.codigo.toLowerCase();
      const minutos =
        r.minutosCell == null || r.minutosCell === ''
          ? 0
          : Number(r.minutosCell);
      const costoMo =
        r.costoMoCell == null || r.costoMoCell === ''
          ? 0.33
          : Number(r.costoMoCell);
      const yaExiste = existentesSet.has(clave);

      let error: string | null = null;
      if (!r.codigo) error = 'Código vacío';
      else if (vistos.has(clave)) error = 'Código duplicado en el archivo';
      else if (yaExiste)
        error = `Ya existe un desarrollo con el código "${r.codigo}"`;
      else if (!r.descripcion) error = 'Descripción vacía';
      else if (
        r.clienteCodigo &&
        !clientePorCodigo.has(r.clienteCodigo.toLowerCase())
      )
        error = `Cliente "${r.clienteCodigo}" no reconocido`;
      else if (r.tallaBase && !tallaPorNombre.has(r.tallaBase.toLowerCase()))
        error = `Talla "${r.tallaBase}" no reconocida`;
      else if (!Number.isFinite(minutos) || minutos < 0)
        error = 'Minutos de mano de obra inválidos';
      else if (!Number.isFinite(costoMo) || costoMo < 0)
        error = 'Costo de mano de obra por minuto inválido';

      if (r.codigo) vistos.add(clave);
      if (!error) nuevosValidos.add(clave);

      return {
        fila: r.fila,
        codigo: r.codigo,
        descripcion: r.descripcion,
        clienteCodigo: r.clienteCodigo || null,
        idCliente: r.clienteCodigo
          ? (clientePorCodigo.get(r.clienteCodigo.toLowerCase()) ?? null)
          : null,
        tallaBase: r.tallaBase || null,
        idTallaBase: r.tallaBase
          ? (tallaPorNombre.get(r.tallaBase.toLowerCase()) ?? null)
          : null,
        minutosMo: Number.isFinite(minutos) ? minutos : null,
        costoMoMinuto: Number.isFinite(costoMo) ? costoMo : null,
        notas: r.notas || null,
        yaExiste,
        error,
      };
    });

    // Un mismo insumo+área no puede repetirse dentro del mismo desarrollo: la
    // base lo rechaza con el UNIQUE ... NULLS NOT DISTINCT, así que conviene
    // marcarlo acá y no dejar que reviente la transacción entera.
    const vistosLinea = new Set<string>();
    const lineas: FilaPreviewInsumoDesarrollo[] = crudoIns.map((r) => {
      const clave = r.desarrolloCodigo.toLowerCase();
      const consumo = Number(r.consumoCell);
      const existeYa = existentesSet.has(clave);
      const seCreara = nuevosValidos.has(clave);
      const claveLinea = `${clave}|${r.insumoCodigo.toLowerCase()}|${r.area.toLowerCase()}`;

      let error: string | null = null;
      if (!r.desarrolloCodigo) error = 'Código de desarrollo vacío';
      else if (!existeYa && !seCreara)
        error = `Desarrollo "${r.desarrolloCodigo}" no existe ni se va a crear en este archivo`;
      else if (!r.insumoCodigo) error = 'Código de insumo vacío';
      else if (!insumosValidos.has(r.insumoCodigo.toLowerCase()))
        error = `Insumo "${r.insumoCodigo}" no reconocido o inactivo`;
      else if (!Number.isFinite(consumo) || consumo <= 0)
        error = 'Consumo inválido (debe ser numérico y mayor que 0)';
      else if (r.area && !areasValidas.has(r.area.toLowerCase()))
        error = `Área "${r.area}" no reconocida`;
      else if (vistosLinea.has(claveLinea))
        error = 'Insumo repetido para ese desarrollo y área en el archivo';

      if (!error) vistosLinea.add(claveLinea);

      // No es error: al aplicar se actualiza el consumo. Se marca para que el
      // usuario vea que va a pisar un valor ya cargado y no lo tome por alta.
      const idAreaExistente = r.area
        ? areasPorNombre.get(r.area.toLowerCase())
        : null;
      const yaCargada =
        !error &&
        existeYa &&
        yaCargadas.has(
          `${clave}|${r.insumoCodigo.toLowerCase()}|${idAreaExistente ?? ''}`,
        );

      return {
        fila: r.fila,
        desarrolloCodigo: r.desarrolloCodigo,
        insumoCodigo: r.insumoCodigo,
        consumo: Number.isFinite(consumo) ? consumo : null,
        area: r.area || null,
        desarrolloNuevo: !existeYa && seCreara,
        yaCargada,
        error,
      };
    });

    return { desarrollos, lineas };
  }

  async aplicar(
    desarrollos: DesarrolloInput[],
    lineas: LineaInput[],
    idUsuarioActor: number,
  ) {
    if (
      (!desarrollos || desarrollos.length === 0) &&
      (!lineas || lineas.length === 0)
    )
      throw new BadRequestException('No hay nada para aplicar');

    // El preview corre en el cliente: se revalida todo acá antes de escribir
    // (convención #1 — nunca confiar en lo que manda el cliente).
    const [insumos, areas] = await Promise.all([
      this.prisma.insumo.findMany({
        where: { activo: true },
        select: { idInsumo: true, codigo: true },
      }),
      this.prisma.areaUso.findMany({ select: { idArea: true, nombre: true } }),
    ]);
    const insumoPorCodigo = new Map(
      insumos.map((i) => [i.codigo.toLowerCase(), i.idInsumo]),
    );
    const areaPorNombre = new Map(
      areas.map((a) => [a.nombre.toLowerCase(), a.idArea]),
    );

    return this.prisma.$transaction(async (tx) => {
      let creados = 0;
      const idPorCodigo = new Map<string, number>();

      for (const d of desarrollos ?? []) {
        const codigo = String(d.codigo || '').trim();
        const descripcion = String(d.descripcion || '').trim();
        if (!codigo || !descripcion)
          throw new BadRequestException(
            `Desarrollo inválido en el archivo: "${codigo || '(sin código)'}"`,
          );
        const creado = await tx.desarrollo.create({
          data: {
            codigo,
            descripcion,
            idCliente: d.idCliente ?? null,
            idTallaBase: d.idTallaBase ?? null,
            minutosMo: d.minutosMo ?? 0,
            costoMoMinuto: d.costoMoMinuto ?? 0.33,
            notas: d.notas?.trim() || null,
            creadoPor: idUsuarioActor,
          },
          select: { idDesarrollo: true },
        });
        idPorCodigo.set(codigo.toLowerCase(), creado.idDesarrollo);
        creados++;
      }

      // Los desarrollos que la receta menciona pero no vienen en este archivo
      // ya tienen que existir — se resuelven acá, dentro de la transacción.
      const faltantes = [
        ...new Set(
          (lineas ?? [])
            .map((l) =>
              String(l.desarrolloCodigo || '')
                .trim()
                .toLowerCase(),
            )
            .filter((c) => c && !idPorCodigo.has(c)),
        ),
      ];
      if (faltantes.length > 0) {
        const encontrados = await tx.desarrollo.findMany({
          where: { codigo: { in: faltantes, mode: 'insensitive' } },
          select: { idDesarrollo: true, codigo: true },
        });
        for (const e of encontrados)
          idPorCodigo.set(e.codigo.trim().toLowerCase(), e.idDesarrollo);
        const sinResolver = faltantes.filter((c) => !idPorCodigo.has(c));
        if (sinResolver.length > 0)
          throw new BadRequestException(
            `Estos desarrollos no existen: ${sinResolver.slice(0, 10).join(', ')}${
              sinResolver.length > 10 ? '…' : ''
            }`,
          );
      }

      let lineasCreadas = 0;
      let lineasActualizadas = 0;
      for (const l of lineas ?? []) {
        const claveDes = String(l.desarrolloCodigo || '')
          .trim()
          .toLowerCase();
        const idDesarrollo = idPorCodigo.get(claveDes);
        const idInsumo = insumoPorCodigo.get(
          String(l.insumoCodigo || '')
            .trim()
            .toLowerCase(),
        );
        if (!idDesarrollo || !idInsumo)
          throw new BadRequestException(
            `Línea inválida: desarrollo "${l.desarrolloCodigo}" / insumo "${l.insumoCodigo}"`,
          );
        const consumo = Number(l.consumo);
        if (!Number.isFinite(consumo) || consumo <= 0)
          throw new BadRequestException(
            `Consumo inválido para el insumo "${l.insumoCodigo}" del desarrollo "${l.desarrolloCodigo}"`,
          );
        const idArea = l.area
          ? (areaPorNombre.get(l.area.trim().toLowerCase()) ?? null)
          : null;
        if (l.area && idArea === null)
          throw new BadRequestException(`Área "${l.area}" no reconocida`);

        // Si el desarrollo YA tenía ese insumo en esa área, el UNIQUE
        // (... NULLS NOT DISTINCT) rechazaba el insert y el 500 abortaba el
        // import completo. Se actualiza el consumo en su lugar — mismo criterio
        // que el ON CONFLICT DO UPDATE del import que este reemplazó.
        // No se usa upsert() de Prisma porque su clave compuesta no matchea
        // filas con id_area NULL, que es justamente el caso más común acá.
        const existente = await tx.desarrolloInsumo.findFirst({
          where: { idDesarrollo, idInsumo, idArea },
          select: { idDesarrolloInsumo: true },
        });
        if (existente) {
          await tx.desarrolloInsumo.update({
            where: { idDesarrolloInsumo: existente.idDesarrolloInsumo },
            data: { consumo },
          });
          lineasActualizadas++;
        } else {
          await tx.desarrolloInsumo.create({
            data: { idDesarrollo, idInsumo, consumo, idArea },
          });
          lineasCreadas++;
        }
      }

      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'desarrollos',
        idEntidad: (desarrollos ?? []).map((d) => d.codigo).join(','),
        accion: 'CREATE',
        datosNuevos: { creados, lineasCreadas, lineasActualizadas },
      });

      return { creados, lineasCreadas, lineasActualizadas };
    });
  }
}
