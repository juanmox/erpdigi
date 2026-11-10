import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { rangoDeDiasGT } from '../../common/dia-guatemala';
import { textoCelda } from '../../common/excel-celda';
import { parsearCodigoOp } from '../../common/op-codigo';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type {
  FilaPreviewMaterial,
  FiltrosMateriales,
  PermisosMateriales,
} from './costeo-materiales.types';
import {
  type CambioMaterial,
  crearEventos,
  nombreParaHistorial,
  textoCambio,
} from './materiales-historial';
import type { FilaAplicarMaterialDto } from './dto/aplicar-importar.dto';
import type {
  AnularMaterialesDto,
  EditarMaterialDto,
  EntregaMaterialesDto,
} from './dto/acciones.dto';

const AZUL_DIGITEXSA = 'FF203080';
/** Fila de datos de la plantilla propia (título + instrucciones + blanco + encabezado). */
const FILA_INICIO_DATOS = 5;
/** El archivo del SAC trae el encabezado en la fila 1: se busca en las primeras filas. */
const FILAS_A_REVISAR = 15;
const TOPE_LISTADO = 2000;

function estiloEncabezado(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: AZUL_DIGITEXSA },
  };
}

function normalizarEncabezado(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nombres aceptados por columna, ya normalizados. El primero es el de la
 * plantilla; los demás son los del Excel del SAC que hoy se usa, para poder
 * subirlo tal cual.
 */
const COLUMNAS = {
  fecha: ['fecha planificador', 'fecha'],
  planificador: [
    'orden de planificacion',
    'orden planificacion',
    'planificador',
    'id_planificador',
    'id planificador',
  ],
  op: ['op', 'op (ej. 25op020325)', 'op (codigo)'],
  codigo: ['codigo insumo', 'codigo (insumo)', 'codigo'],
  cantidad: ['cantidad'],
  salida: ['salida sac', 'salida'],
  comentario: ['comentario', 'comentarios'],
  // La descripción viene en el archivo del SAC pero NO se usa: manda el catálogo.
  descripcion: ['descripcion', 'descripcion insumo'],
} as const;
type ClaveColumna = keyof typeof COLUMNAS;

const OBLIGATORIAS: [ClaveColumna, string][] = [
  ['fecha', 'Fecha planificador'],
  ['planificador', 'Orden de planificación'],
  ['op', 'OP'],
  ['codigo', 'Código insumo'],
  ['cantidad', 'Cantidad'],
];

/**
 * Busca el encabezado en las primeras filas: la plantilla lo trae en la fila 4
 * (con preámbulo) y el Excel del SAC en la 1. Sin esto habría que pedirle a
 * planificación que reacomode el archivo antes de subirlo.
 */
function resolverColumnas(ws: ExcelJS.Worksheet): {
  idx: Record<ClaveColumna, number | null>;
  filaEncabezado: number;
} {
  let mejor: {
    idx: Record<ClaveColumna, number | null>;
    fila: number;
    aciertos: number;
  } | null = null;

  for (let r = 1; r <= Math.min(FILAS_A_REVISAR, ws.rowCount); r++) {
    const porNombre = new Map<string, number>();
    ws.getRow(r).eachCell((cell, col) => {
      const n = normalizarEncabezado(textoCelda(cell.value));
      if (n && !porNombre.has(n)) porNombre.set(n, col);
    });
    const idx = {} as Record<ClaveColumna, number | null>;
    for (const [clave, alias] of Object.entries(COLUMNAS) as [
      ClaveColumna,
      readonly string[],
    ][])
      idx[clave] =
        alias.map((a) => porNombre.get(a)).find((c) => c != null) ?? null;
    const aciertos = OBLIGATORIAS.filter(([c]) => idx[c] != null).length;
    if (!mejor || aciertos > mejor.aciertos) mejor = { idx, fila: r, aciertos };
    if (aciertos === OBLIGATORIAS.length) break;
  }

  const faltan = mejor
    ? OBLIGATORIAS.filter(([c]) => mejor.idx[c] == null).map(([, n]) => n)
    : OBLIGATORIAS.map(([, n]) => n);
  if (!mejor || faltan.length > 0)
    throw new BadRequestException(
      `No se encontró la fila de encabezado en las primeras ${FILAS_A_REVISAR} filas: faltan las columnas ` +
        `${faltan.join(', ')}. Descargá la plantilla o usá el archivo del SAC con sus encabezados.`,
    );
  return { idx: mejor.idx, filaEncabezado: mejor.fila };
}

/** `(25, 20325)` -> `"25OP020325"`, el mismo formato que la columna GENERATED de la OP. */
function codigoOpDe(anio: number, correlativo: number) {
  return `${String(anio).padStart(2, '0')}OP${String(correlativo).padStart(6, '0')}`;
}

/** "25OP020325"; tolera el cero en lugar de la letra O ("250P020325"), que no es un código válido. */
function normalizarOp(texto: string): {
  anio: number;
  correlativo: number;
  codigo: string;
} | null {
  const limpio = texto
    .trim()
    .toUpperCase()
    .replace(/^(\d{2})0P/, '$1OP');
  const p = parsearCodigoOp(limpio);
  return p ? { ...p, codigo: codigoOpDe(p.anio, p.correlativo) } : null;
}

/**
 * Fecha del archivo. El SAC y Excel en Guatemala escriben día/mes/año, así que
 * "12/01/2026" es el 12 de enero y NO el 1 de diciembre: `new Date(texto)` lo
 * leería al revés, por eso no se usa. Devuelve `yyyy-mm-dd` o null.
 */
function parsearFecha(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  let a: number, m: number, d: number;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t))) {
    [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) {
    [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
  } else if (/^\d{5}(\.\d+)?$/.test(t)) {
    // Número de serie de Excel (celda con fecha sin formato).
    const base = Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86400000;
    const f = new Date(base);
    [a, m, d] = [f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()];
  } else return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (
    f.getUTCFullYear() !== a ||
    f.getUTCMonth() !== m - 1 ||
    f.getUTCDate() !== d ||
    a < 2000 ||
    a > 2100
  )
    return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const aFecha = (yyyymmdd: string) => new Date(`${yyyymmdd}T00:00:00.000Z`);
const aDia = (d: Date) => d.toISOString().slice(0, 10);

function parsearNumero(texto: string): number | null {
  let t = texto.trim();
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
}

/** "10142.0" (número leído de Excel) -> "10142". */
function normalizarSalida(texto: string): string | null {
  const t = texto.trim().replace(/^(\d+)\.0+$/, '$1');
  return t || null;
}

/** Valor de una celda como texto; las fechas reales de Excel salen como yyyy-mm-dd. */
function textoDeCelda(valor: ExcelJS.CellValue): string {
  if (valor instanceof Date) return aDia(valor);
  if (
    valor &&
    typeof valor === 'object' &&
    'result' in valor &&
    valor.result instanceof Date
  )
    return aDia(valor.result);
  return textoCelda(valor).trim();
}

interface Cruda {
  fila: number;
  fechaTexto: string;
  planificadorTexto: string;
  opTexto: string;
  codigoTexto: string;
  cantidadTexto: string;
  salidaTexto: string;
  comentarioTexto: string;
}

interface Resuelta {
  cruda: Cruda;
  error: string | null;
  aviso: string | null;
  datos: {
    fecha: string;
    planificador: string;
    codigoOp: string;
    idOrdenProduccion: number | null;
    idInsumo: number;
    insumoCodigo: string;
    insumoDescripcion: string;
    unidad: string;
    costoPromedio: number;
    cantidad: number;
    salida: string | null;
    comentario: string | null;
  } | null;
}

type Db = Pick<PrismaService, 'ordenProduccion' | 'insumo' | 'materialOp'>;

/**
 * Liga los materiales que quedaron "sueltos" (su OP no existía al cargarlos) a
 * las OP que ya existen. Se llama al importar OP, dentro de la misma
 * transacción: así el reporte de costeo ve los materiales apenas la OP exista.
 */
export async function ligarMaterialesPendientes(
  tx: Pick<PrismaService, '$executeRaw'>,
  idEmpresa: number,
  idUsuario: number,
): Promise<number> {
  // Una sola sentencia: el ligado y su rastro en el historial no se pueden separar.
  // Es un cambio del ítem (aunque no lo haya hecho nadie a mano), así que queda
  // anotado a nombre de quien importó las OP.
  return tx.$executeRaw`
    WITH ligados AS (
      UPDATE costeo.material_op m
      SET id_orden_produccion = o.id_orden_produccion
      FROM costeo.orden_produccion o
      WHERE m.id_empresa = ${idEmpresa}
        AND o.id_empresa = ${idEmpresa}
        AND m.id_orden_produccion IS NULL
        AND m.codigo_op = o.codigo
      RETURNING m.id_material_op, m.codigo_op
    )
    INSERT INTO costeo.material_op_historial
      (id_empresa, id_material_op, accion, cambios, id_usuario, usuario_nombre)
    SELECT
      ${idEmpresa}, l.id_material_op, 'LIGAR_OP',
      jsonb_build_array(jsonb_build_object(
        'campo', 'opLigada', 'antes', 'Sin cargar', 'despues', 'Cargada')),
      ${idUsuario},
      left(coalesce(
        (SELECT coalesce(nullif(u.nombre_completo, ''), u.username)
           FROM core.usuarios u WHERE u.id_usuario = ${idUsuario}),
        'Usuario ' || ${idUsuario}::text), 80)
    FROM ligados l
  `;
}

/**
 * El filtro de la página, en un solo lugar: lo usan el listado y el Excel, y si
 * leyeran los filtros distinto el Excel no coincidiría con lo que se ve.
 *
 * `incluirAnulados` es solo del Excel: con el estado "todos", la página oculta
 * los anulados pero un reporte de control tiene que mostrarlos (marcados).
 */
export function whereMateriales(
  idEmpresa: number,
  f: FiltrosMateriales,
  idUsuario: number,
  incluirAnulados = false,
): Prisma.MaterialOpWhereInput {
  const estado = f.estado ?? 'todos';
  const where: Prisma.MaterialOpWhereInput = {
    idEmpresa,
    ...(estado === 'anulados'
      ? { anuladoEn: { not: null } }
      : incluirAnulados && estado === 'todos'
        ? {}
        : { anuladoEn: null }),
    ...(estado === 'pendientes' ? { entregadoEn: null } : {}),
    ...(estado === 'entregados' ? { entregadoEn: { not: null } } : {}),
    ...(estado === 'sin_costo' ? { costoUnitario: null } : {}),
    ...(estado === 'sin_ligar' ? { idOrdenProduccion: null } : {}),
    ...(estado === 'modificados' ? { historial: { some: {} } } : {}),
    ...(f.ordenPlanificacion
      ? {
          ordenPlanificacion: {
            contains: f.ordenPlanificacion.trim(),
            mode: 'insensitive' as const,
          },
        }
      : {}),
    ...(f.op
      ? {
          codigoOp: { contains: f.op.trim(), mode: 'insensitive' as const },
        }
      : {}),
    ...(f.insumo
      ? {
          insumo: {
            OR: [
              {
                codigo: {
                  contains: f.insumo.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                descripcion: {
                  contains: f.insumo.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          },
        }
      : {}),
    ...(f.salida
      ? {
          salidaSac: {
            contains: f.salida.trim(),
            mode: 'insensitive' as const,
          },
        }
      : {}),
    ...(f.soloMios ? { creadoPor: idUsuario } : {}),
  };

  if (f.desde || f.hasta) {
    const campo = f.campoFecha ?? 'planificador';
    if (campo === 'carga') where.creadoEn = rangoDeDiasGT(f.desde, f.hasta);
    else {
      // Columnas DATE: se comparan como día calendario, sin zona.
      const rango = {
        ...(f.desde ? { gte: aFecha(f.desde) } : {}),
        ...(f.hasta ? { lte: aFecha(f.hasta) } : {}),
      };
      if (campo === 'planificador') where.fechaPlanificador = rango;
      else where.fechaEntrega = rango;
    }
  }
  return where;
}

/** Quién puede modificar o anular un ítem: su dueño mientras esté pendiente, o quien tenga el permiso. */
export function puedeTocarMaterial(
  m: { creadoPor: number; entregadoEn: Date | null; anuladoEn: Date | null },
  idUsuario: number,
  p: PermisosMateriales,
): boolean {
  if (m.anuladoEn) return false;
  if (p.editarAjenos) return true;
  return p.importar && m.creadoPor === idUsuario && !m.entregadoEn;
}

@Injectable()
export class CosteoMaterialesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ─────────────────────────── Plantilla ───────────────────────────

  async plantillaImportar(): Promise<ExcelJS.Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Materiales');
    ws.mergeCells(1, 1, 1, 7);
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Explosión de materiales por OP';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells(2, 1, 2, 7);
    ws.getCell('A2').value =
      'Una fila por insumo y OP. Fecha planificador es la del SAC (dd/mm/aaaa). ' +
      'Orden de planificación es el ID del planificador (ej. 25P0000294). ' +
      'Salida SAC es opcional: con ella el ítem se carga como ENTREGADO; sin ella queda PENDIENTE de entrega. ' +
      'También se puede subir el archivo del SAC tal cual (con sus encabezados FECHA, CODIGO, OP, CANTIDAD, SALIDA, COMENTARIO, PLANIFICADOR).';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };

    const header = ws.getRow(FILA_INICIO_DATOS - 1);
    header.values = [
      'Fecha planificador',
      'Orden de planificación',
      'OP',
      'Código insumo',
      'Cantidad',
      'Salida SAC',
      'Comentario',
    ];
    header.eachCell(estiloEncabezado);
    [18, 22, 16, 16, 12, 14, 40].forEach(
      (w, i) => (ws.getColumn(i + 1).width = w),
    );

    // Referencia: los códigos válidos. Sin ella hay que adivinarlos, que es lo
    // que deja filas pendientes.
    const ref = wb.addWorksheet('Insumos');
    ref.getRow(1).values = ['Código', 'Descripción', 'Unidad'];
    ref.getRow(1).eachCell(estiloEncabezado);
    const insumos = await this.prisma.insumo.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      select: {
        codigo: true,
        descripcion: true,
        unidad: { select: { nombre: true } },
      },
    });
    insumos.forEach((i, n) => {
      ref.getRow(n + 2).values = [i.codigo, i.descripcion, i.unidad.nombre];
    });
    [16, 70, 14].forEach((w, i) => (ref.getColumn(i + 1).width = w));

    return wb.xlsx.writeBuffer();
  }

  // ─────────────────────────── Import ───────────────────────────

  async previewImportar(
    buffer: Buffer,
    idEmpresa: number,
  ): Promise<{ filas: FilaPreviewMaterial[] }> {
    const crudas = await this.leerArchivo(buffer);
    const resueltas = await this.resolverFilas(crudas, idEmpresa, this.prisma);
    return { filas: resueltas.map(aFilaPreview) };
  }

  private async leerArchivo(buffer: Buffer): Promise<Cruda[]> {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException(
        'No se pudo leer el archivo: tiene que ser un Excel (.xlsx)',
      );
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');

    const { idx, filaEncabezado } = resolverColumnas(ws);
    const crudas: Cruda[] = [];
    const leer = (row: ExcelJS.Row, c: number | null) =>
      c == null ? '' : textoDeCelda(row.getCell(c).value);

    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= filaEncabezado) return;
      const cruda: Cruda = {
        fila: rowNumber,
        fechaTexto: leer(row, idx.fecha),
        planificadorTexto: leer(row, idx.planificador),
        opTexto: leer(row, idx.op),
        codigoTexto: leer(row, idx.codigo),
        cantidadTexto: leer(row, idx.cantidad),
        salidaTexto: leer(row, idx.salida),
        comentarioTexto: leer(row, idx.comentario),
      };
      // Fila en blanco: sin OP, sin código y sin cantidad.
      if (!cruda.opTexto && !cruda.codigoTexto && !cruda.cantidadTexto) return;
      crudas.push(cruda);
    });
    return crudas;
  }

  /**
   * El corazón del import: resuelve y valida cada fila contra el estado REAL de
   * la base. Lo usan el preview (fuera de transacción) y `aplicar` (dentro de
   * la suya) — convención #1: lo que pasó por el navegador nunca se da por
   * bueno, se revalida siempre.
   */
  private async resolverFilas(
    crudas: Cruda[],
    idEmpresa: number,
    db: Db,
  ): Promise<Resuelta[]> {
    if (crudas.length === 0) return [];

    const ops = crudas.map((c) => normalizarOp(c.opTexto));
    const claves = ops.filter((o): o is NonNullable<typeof o> => !!o);
    const opsExistentes = claves.length
      ? await db.ordenProduccion.findMany({
          where: {
            idEmpresa,
            OR: claves.map((o) => ({
              anio: o.anio,
              correlativo: o.correlativo,
            })),
          },
          select: { idOrdenProduccion: true, anio: true, correlativo: true },
        })
      : [];
    const opPorClave = new Map(
      opsExistentes.map((o) => [`${o.anio}|${o.correlativo}`, o]),
    );

    const codigos = [
      ...new Set(
        crudas.map((c) => c.codigoTexto.trim().toUpperCase()).filter(Boolean),
      ),
    ];
    const insumos = codigos.length
      ? await db.insumo.findMany({
          where: { codigo: { in: codigos } },
          select: {
            idInsumo: true,
            codigo: true,
            descripcion: true,
            activo: true,
            costoPromedio: true,
            unidad: { select: { nombre: true } },
          },
        })
      : [];
    const insumoPorCodigo = new Map(insumos.map((i) => [i.codigo, i]));

    const resueltas: Resuelta[] = crudas.map((cruda, n) => {
      const mal = (error: string): Resuelta => ({
        cruda,
        error,
        aviso: null,
        datos: null,
      });

      const planificador = cruda.planificadorTexto.trim().toUpperCase();
      if (!planificador) return mal('Falta la orden de planificación');
      if (planificador.length > 30)
        return mal('La orden de planificación pasa de 30 caracteres');

      const fecha = parsearFecha(cruda.fechaTexto);
      if (!fecha)
        return mal(
          cruda.fechaTexto
            ? `La fecha no se pudo interpretar: "${cruda.fechaTexto}" (usá dd/mm/aaaa)`
            : 'Falta la fecha del planificador',
        );

      const op = ops[n];
      if (!op)
        return mal(
          cruda.opTexto
            ? `Código de OP inválido: "${cruda.opTexto}" (formato 25OP020325)`
            : 'Falta la OP',
        );

      const codigo = cruda.codigoTexto.trim().toUpperCase();
      if (!codigo) return mal('Falta el código del insumo');
      const insumo = insumoPorCodigo.get(codigo);
      if (!insumo)
        return mal(
          `El insumo "${codigo}" no existe: se da de alta en Gestión de datos → Insumos`,
        );
      if (!insumo.activo) return mal(`El insumo "${codigo}" está desactivado`);

      const cantidad = parsearNumero(cruda.cantidadTexto);
      if (cantidad == null)
        return mal(
          cruda.cantidadTexto
            ? `La cantidad no es un número: "${cruda.cantidadTexto}"`
            : 'Falta la cantidad',
        );
      if (cantidad <= 0) return mal('La cantidad tiene que ser mayor que 0');

      const salida = normalizarSalida(cruda.salidaTexto);
      if (salida && salida.length > 30)
        return mal('La salida SAC pasa de 30 caracteres');

      const existente = opPorClave.get(`${op.anio}|${op.correlativo}`);
      return {
        cruda,
        error: null,
        aviso: null,
        datos: {
          fecha,
          planificador,
          codigoOp: op.codigo,
          idOrdenProduccion: existente?.idOrdenProduccion ?? null,
          idInsumo: insumo.idInsumo,
          insumoCodigo: insumo.codigo,
          insumoDescripcion: insumo.descripcion,
          unidad: insumo.unidad.nombre,
          costoPromedio: Number(insumo.costoPromedio),
          cantidad,
          salida,
          comentario: cruda.comentarioTexto.trim() || null,
        },
      };
    });

    // Guarda anti-duplicados: contra lo que YA está cargado, por multiplicidad
    // (mismo diseño que `filasYaCargadas` de Órdenes).
    for (const f of await this.filasYaCargadas(resueltas, idEmpresa, db))
      f.error =
        `Este ítem ya está cargado en la orden de planificación ${f.datos!.planificador} ` +
        `(OP ${f.datos!.codigoOp}, insumo ${f.datos!.insumoCodigo}, cantidad ${f.datos!.cantidad})`;

    // Dos filas idénticas dentro del archivo pueden ser legítimas (el mismo
    // insumo pedido dos veces para la misma OP), así que solo se avisa.
    const vistas = new Map<string, number>();
    for (const f of resueltas) {
      if (f.error || !f.datos) continue;
      const k = firma(f.datos);
      const n = (vistas.get(k) ?? 0) + 1;
      vistas.set(k, n);
      if (n > 1)
        f.aviso =
          'Hay otra fila idéntica en el archivo: si es un error de copiado, quitala antes de aplicar';
    }
    return resueltas;
  }

  /**
   * Filas del archivo que ya están cargadas.
   *
   * La firma es (orden de planificación, OP, insumo, cantidad) y NO incluye la
   * salida: el Excel del SAC se va completando con el tiempo, y si la salida
   * formara parte de la firma, volver a subir el mismo archivo con la columna
   * ya llena duplicaría todo lo que bodega ya registró.
   *
   * Por MULTIPLICIDAD: si el archivo trae 2 filas iguales y la base ya tiene 1,
   * solo una es duplicada. Corre también dentro de la transacción del aplicar,
   * que es lo que cubre el doble clic y el POST armado a mano.
   */
  private async filasYaCargadas(
    filas: Resuelta[],
    idEmpresa: number,
    db: Pick<PrismaService, 'materialOp'>,
  ): Promise<Resuelta[]> {
    const candidatas = filas.filter((f) => !f.error && f.datos);
    if (candidatas.length === 0) return [];

    const existentes = await db.materialOp.findMany({
      where: {
        idEmpresa,
        anuladoEn: null,
        ordenPlanificacion: {
          in: [...new Set(candidatas.map((f) => f.datos!.planificador))],
        },
      },
      select: {
        ordenPlanificacion: true,
        codigoOp: true,
        idInsumo: true,
        cantidad: true,
      },
    });
    const disponibles = new Map<string, number>();
    for (const e of existentes) {
      const k = firma({
        planificador: e.ordenPlanificacion,
        codigoOp: e.codigoOp,
        idInsumo: e.idInsumo,
        cantidad: Number(e.cantidad),
      });
      disponibles.set(k, (disponibles.get(k) ?? 0) + 1);
    }

    const duplicadas: Resuelta[] = [];
    for (const f of candidatas) {
      const k = firma(f.datos!);
      const quedan = disponibles.get(k) ?? 0;
      if (quedan > 0) {
        disponibles.set(k, quedan - 1);
        duplicadas.push(f);
      }
    }
    return duplicadas;
  }

  async aplicarImportar(
    filas: FilaAplicarMaterialDto[],
    nombreArchivo: string | undefined,
    idUsuario: number,
    idEmpresa: number,
  ) {
    const crudas: Cruda[] = filas.map((f) => ({
      fila: f.fila,
      fechaTexto: f.fechaTexto,
      planificadorTexto: f.planificadorTexto,
      opTexto: f.opTexto,
      codigoTexto: f.codigoTexto,
      cantidadTexto: f.cantidadTexto,
      salidaTexto: f.salidaTexto ?? '',
      comentarioTexto: f.comentarioTexto ?? '',
    }));

    const resultado = await this.prisma.$transaction(
      async (tx) => {
        const resueltas = await this.resolverFilas(crudas, idEmpresa, tx);
        const malas = resueltas.filter((f) => f.error);
        if (malas.length > 0)
          throw new BadRequestException(
            `${malas.length} de las ${resueltas.length} filas no pasan la validación ` +
              `(ej.: fila ${malas[0].cruda.fila}: ${malas[0].error}). Volvé a revisar el archivo.`,
          );

        const carga = await tx.cargaMaterial.create({
          data: {
            idEmpresa,
            nombreArchivo: nombreArchivo?.slice(0, 200) ?? null,
            filas: resueltas.length,
            creadoPor: idUsuario,
          },
        });

        const ahora = new Date();
        await tx.materialOp.createMany({
          data: resueltas.map((f) => {
            const d = f.datos!;
            const entregado = d.salida != null;
            return {
              idEmpresa,
              origen: 'PLANTILLA',
              idCargaMaterial: carga.idCargaMaterial,
              ordenPlanificacion: d.planificador,
              fechaPlanificador: aFecha(d.fecha),
              codigoOp: d.codigoOp,
              idOrdenProduccion: d.idOrdenProduccion,
              idInsumo: d.idInsumo,
              cantidad: d.cantidad,
              // Foto del precio de hoy; sin precio queda NULL ("sin costo"), no 0.
              costoUnitario: d.costoPromedio > 0 ? d.costoPromedio : null,
              salidaSac: d.salida,
              // Con salida el ítem nace ENTREGADO, y su fecha de entrega es la
              // del planificador (el SAC no trae otra). Sin salida, vacía.
              fechaEntrega: entregado ? aFecha(d.fecha) : null,
              entregadoEn: entregado ? ahora : null,
              entregadoPor: entregado ? idUsuario : null,
              comentario: d.comentario,
              creadoPor: idUsuario,
            };
          }),
        });

        return {
          idCarga: carga.idCargaMaterial,
          cargados: resueltas.length,
          entregados: resueltas.filter((f) => f.datos!.salida != null).length,
          sinLigar: resueltas.filter((f) => f.datos!.idOrdenProduccion == null)
            .length,
          sinCosto: resueltas.filter((f) => f.datos!.costoPromedio <= 0).length,
        };
      },
      // Un archivo histórico son miles de filas.
      { timeout: 120_000 },
    );

    await this.auditoria.registrar({
      idUsuario,
      entidad: 'costeo.material_op',
      idEntidad: `carga ${resultado.idCarga}`,
      accion: 'CREATE',
      datosNuevos: { ...resultado, archivo: nombreArchivo ?? null },
    });
    return resultado;
  }

  // ─────────────────────────── Consulta ───────────────────────────

  async listar(
    idEmpresa: number,
    f: FiltrosMateriales,
    idUsuario: number,
    p: PermisosMateriales,
  ) {
    const where = whereMateriales(idEmpresa, f, idUsuario);

    const [total, filas] = await Promise.all([
      this.prisma.materialOp.count({ where }),
      this.prisma.materialOp.findMany({
        where,
        include: {
          insumo: {
            select: {
              codigo: true,
              descripcion: true,
              unidad: { select: { nombre: true } },
            },
          },
          ordenProduccion: {
            select: { cliente: { select: { nombre: true } } },
          },
        },
        orderBy: [
          { fechaPlanificador: 'desc' },
          { ordenPlanificacion: 'asc' },
          { codigoOp: 'asc' },
          { idMaterialOp: 'asc' },
        ],
        take: TOPE_LISTADO,
      }),
    ]);

    // Los nombres se resuelven en un solo lote: creadoPor/entregadoPor son
    // enteros sin @relation a propósito (mismo criterio que el resto de costeo).
    const idsUsuario = [
      ...new Set(
        filas.flatMap((m) =>
          [m.creadoPor, m.entregadoPor].filter((x): x is number => x != null),
        ),
      ),
    ];
    const usuarios = idsUsuario.length
      ? await this.prisma.usuario.findMany({
          where: { idUsuario: { in: idsUsuario } },
          select: { idUsuario: true, username: true, nombreCompleto: true },
        })
      : [];
    const nombre = new Map(
      usuarios.map((u) => [u.idUsuario, u.nombreCompleto || u.username]),
    );

    // Cuántas veces se tocó cada ítem de la página, en UNA consulta: es lo que
    // permite marcar los modificados y abrir su historial sin sorpresas.
    const cambios = filas.length
      ? await this.prisma.materialOpHistorial.groupBy({
          by: ['idMaterialOp'],
          where: { idMaterialOp: { in: filas.map((m) => m.idMaterialOp) } },
          _count: { _all: true },
          _max: { creadoEn: true },
        })
      : [];
    const modificaciones = new Map(
      cambios.map((c) => [
        c.idMaterialOp,
        { n: c._count._all, ultima: c._max.creadoEn },
      ]),
    );

    const items = filas.map((m) => {
      const costoTotal = m.costoTotal == null ? null : Number(m.costoTotal);
      return {
        idMaterialOp: m.idMaterialOp,
        ordenPlanificacion: m.ordenPlanificacion,
        fechaPlanificador: aDia(m.fechaPlanificador),
        fechaCarga: m.creadoEn,
        fechaEntrega: m.fechaEntrega ? aDia(m.fechaEntrega) : null,
        codigoOp: m.codigoOp,
        opLigada: m.idOrdenProduccion != null,
        cliente: m.ordenProduccion?.cliente?.nombre ?? null,
        insumoCodigo: m.insumo.codigo,
        insumoDescripcion: m.insumo.descripcion,
        unidad: m.insumo.unidad.nombre,
        cantidad: Number(m.cantidad),
        sinCosto: m.costoUnitario == null,
        // El dinero solo con `ver_financiero`; el estado "sin costo" sí es público.
        costoUnitario:
          p.verDinero && m.costoUnitario != null
            ? Number(m.costoUnitario)
            : null,
        costoTotal: p.verDinero ? costoTotal : null,
        salidaSac: m.salidaSac,
        entregado: m.entregadoEn != null,
        entregadoPor: m.entregadoPor
          ? (nombre.get(m.entregadoPor) ?? null)
          : null,
        comentario: m.comentario,
        origen: m.origen,
        creadoPor: nombre.get(m.creadoPor) ?? `Usuario ${m.creadoPor}`,
        esMio: m.creadoPor === idUsuario,
        anulado: m.anuladoEn != null,
        motivoAnulacion: m.motivoAnulacion,
        modificaciones: modificaciones.get(m.idMaterialOp)?.n ?? 0,
        ultimaModificacion: modificaciones.get(m.idMaterialOp)?.ultima ?? null,
        // Resuelto acá y no en el navegador: la regla es del servidor.
        puedeModificar: puedeTocarMaterial(m, idUsuario, p),
      };
    });

    return {
      total,
      truncado: total > items.length,
      resumen: {
        mostrados: items.length,
        pendientes: items.filter((i) => !i.entregado && !i.anulado).length,
        entregados: items.filter((i) => i.entregado && !i.anulado).length,
        sinCosto: items.filter((i) => i.sinCosto).length,
        sinLigar: items.filter((i) => !i.opLigada).length,
        costoTotal: p.verDinero
          ? items.reduce((a, i) => a + (i.costoTotal ?? 0), 0)
          : null,
      },
      items,
    };
  }

  // ─────────────────────────── Modificar / anular ───────────────────────────

  private async obtener(id: number, idEmpresa: number) {
    const m = await this.prisma.materialOp.findFirst({
      where: { idMaterialOp: id, idEmpresa },
    });
    if (!m) throw new NotFoundException('Ese ítem no existe');
    return m;
  }

  async editar(
    id: number,
    dto: EditarMaterialDto,
    idUsuario: number,
    idEmpresa: number,
    p: PermisosMateriales,
  ) {
    const actual = await this.obtener(id, idEmpresa);
    if (actual.anuladoEn)
      throw new ConflictException('Ese ítem está anulado: ya no se modifica');
    if (!puedeTocarMaterial(actual, idUsuario, p))
      throw new ForbiddenException(
        actual.entregadoEn
          ? 'Ese ítem ya fue entregado: solo lo corrige un administrador'
          : 'Ese ítem lo cargó otra persona: solo su dueño o un administrador lo modifica',
      );

    // Solo se escribe (y se anota) lo que de verdad cambia: un "guardar" sin
    // cambios no ensucia el historial ni mueve la fecha de modificación.
    const data: Prisma.MaterialOpUncheckedUpdateInput = {};
    const cambios: CambioMaterial[] = [];
    const registrar = (
      campo: string,
      antes: string | number | null,
      despues: string | number | null,
    ) =>
      cambios.push({
        campo,
        antes: textoCambio(antes),
        despues: textoCambio(despues),
      });

    if (dto.fechaPlanificador) {
      const f = parsearFecha(dto.fechaPlanificador);
      if (!f) throw new BadRequestException('La fecha no es válida');
      if (f !== aDia(actual.fechaPlanificador)) {
        registrar('fechaPlanificador', aDia(actual.fechaPlanificador), f);
        data.fechaPlanificador = aFecha(f);
      }
    }
    if (dto.ordenPlanificacion) {
      const plan = dto.ordenPlanificacion.trim().toUpperCase();
      if (plan !== actual.ordenPlanificacion) {
        registrar('ordenPlanificacion', actual.ordenPlanificacion, plan);
        data.ordenPlanificacion = plan;
      }
    }
    if (dto.comentario !== undefined) {
      const com = dto.comentario.trim() || null;
      if (com !== (actual.comentario ?? null)) {
        registrar('comentario', actual.comentario, com);
        data.comentario = com;
      }
    }
    if (dto.cantidad !== undefined) {
      const c = Math.round(Number(dto.cantidad) * 10000) / 10000;
      if (!Number.isFinite(c) || c <= 0)
        throw new BadRequestException('La cantidad tiene que ser mayor que 0');
      if (c !== Number(actual.cantidad)) {
        registrar('cantidad', Number(actual.cantidad), c);
        data.cantidad = c;
      }
    }
    if (dto.codigoOp) {
      const op = normalizarOp(dto.codigoOp);
      if (!op)
        throw new BadRequestException(
          `Código de OP inválido: "${dto.codigoOp}"`,
        );
      if (op.codigo !== actual.codigoOp) {
        const existe = await this.prisma.ordenProduccion.findFirst({
          where: { idEmpresa, anio: op.anio, correlativo: op.correlativo },
          select: { idOrdenProduccion: true },
        });
        registrar('codigoOp', actual.codigoOp, op.codigo);
        data.codigoOp = op.codigo;
        // Si la OP todavía no existe queda suelta, igual que al cargar.
        data.idOrdenProduccion = existe?.idOrdenProduccion ?? null;
        const antesLigada = actual.idOrdenProduccion != null;
        if (antesLigada !== (existe != null))
          registrar(
            'opLigada',
            antesLigada ? 'Cargada' : 'Sin cargar',
            existe ? 'Cargada' : 'Sin cargar',
          );
      }
    }
    if (dto.codigoInsumo) {
      const insumo = await this.prisma.insumo.findUnique({
        where: { codigo: dto.codigoInsumo.trim().toUpperCase() },
        select: {
          idInsumo: true,
          codigo: true,
          descripcion: true,
          activo: true,
          costoPromedio: true,
        },
      });
      if (!insumo || !insumo.activo)
        throw new BadRequestException(
          `El insumo "${dto.codigoInsumo}" no existe o está desactivado`,
        );
      if (insumo.idInsumo !== actual.idInsumo) {
        const anterior = await this.prisma.insumo.findUnique({
          where: { idInsumo: actual.idInsumo },
          select: { codigo: true, descripcion: true },
        });
        // Cambiar de insumo es otro material: se congela el costo del nuevo.
        const costoNuevo =
          Number(insumo.costoPromedio) > 0
            ? Number(insumo.costoPromedio)
            : null;
        registrar(
          'insumo',
          anterior ? `${anterior.codigo} · ${anterior.descripcion}` : null,
          `${insumo.codigo} · ${insumo.descripcion}`,
        );
        registrar(
          'costoUnitario',
          actual.costoUnitario == null ? null : Number(actual.costoUnitario),
          costoNuevo,
        );
        data.idInsumo = insumo.idInsumo;
        data.costoUnitario = costoNuevo;
      }
    }

    if (cambios.length === 0) return { idMaterialOp: id, modificado: false };

    const nombre = await nombreParaHistorial(this.prisma, idUsuario);
    const nuevo = await this.prisma.$transaction(async (tx) => {
      const n = await tx.materialOp.update({
        where: { idMaterialOp: id },
        data: { ...data, modificadoEn: new Date(), modificadoPor: idUsuario },
      });
      await crearEventos(tx, [
        {
          idEmpresa,
          idMaterialOp: id,
          accion: 'EDITAR',
          cambios,
          motivo: dto.motivo,
          idUsuario,
          usuarioNombre: nombre,
        },
      ]);
      return n;
    });
    await this.auditoria.registrar({
      idUsuario,
      entidad: 'costeo.material_op',
      idEntidad: String(id),
      accion: 'UPDATE',
      datosAnteriores: actual,
      datosNuevos: { ...nuevo, motivo: dto.motivo.trim() },
    });
    return { idMaterialOp: id, modificado: true };
  }

  async anular(
    dto: AnularMaterialesDto,
    idUsuario: number,
    idEmpresa: number,
    p: PermisosMateriales,
  ) {
    const ids = [...new Set(dto.ids)];
    const filas = await this.prisma.materialOp.findMany({
      where: { idMaterialOp: { in: ids }, idEmpresa, anuladoEn: null },
    });
    if (filas.length === 0)
      throw new NotFoundException(
        'Ninguno de esos ítems existe, ya estaba anulado, o no es de esta empresa',
      );
    const permitidos = filas.filter((m) => puedeTocarMaterial(m, idUsuario, p));
    if (permitidos.length === 0)
      throw new ForbiddenException(
        'No podés anular esos ítems: son de otra persona o ya fueron entregados (solo un administrador).',
      );

    const nombre = await nombreParaHistorial(this.prisma, idUsuario);
    await this.prisma.$transaction(async (tx) => {
      await tx.materialOp.updateMany({
        where: { idMaterialOp: { in: permitidos.map((m) => m.idMaterialOp) } },
        data: {
          anuladoEn: new Date(),
          anuladoPor: idUsuario,
          motivoAnulacion: dto.motivo.trim(),
        },
      });
      // Una fila de historial POR ÍTEM (la bitácora general sigue siendo una
      // por tanda): así "¿qué le pasó a este ítem?" se responde sin parsear nada.
      await crearEventos(
        tx,
        permitidos.map((m) => ({
          idEmpresa,
          idMaterialOp: m.idMaterialOp,
          accion: 'ANULAR' as const,
          cambios: [
            {
              campo: 'estado',
              antes: m.entregadoEn ? 'Entregado' : 'Pendiente',
              despues: 'Anulado',
            },
          ],
          motivo: dto.motivo,
          idUsuario,
          usuarioNombre: nombre,
        })),
      );
    });
    // Una entrada para la tanda, no una por ítem: anular 300 es UN acto de
    // corrección, y 300 entradas harían ilegible la bitácora.
    await this.auditoria.registrar({
      idUsuario,
      entidad: 'costeo.material_op',
      idEntidad: permitidos.map((m) => m.idMaterialOp).join(','),
      accion: 'UPDATE',
      datosAnteriores: { registros: permitidos },
      datosNuevos: { anulados: permitidos.length, motivo: dto.motivo.trim() },
    });
    return {
      anulados: permitidos.length,
      noPermitidos: filas.length - permitidos.length,
      noEncontrados: ids.length - filas.length,
    };
  }

  // ─────────────────────────── Entrega por lote ───────────────────────────

  async entrega(
    dto: EntregaMaterialesDto,
    idUsuario: number,
    idEmpresa: number,
  ) {
    const ids = [...new Set(dto.ids)];
    const filas = await this.prisma.materialOp.findMany({
      where: { idMaterialOp: { in: ids }, idEmpresa, anuladoEn: null },
      select: { idMaterialOp: true },
    });
    if (filas.length === 0)
      throw new NotFoundException(
        'Ninguno de esos ítems existe, está anulado, o no es de esta empresa',
      );

    // Corregir una fecha o revertir una entrega son correcciones: exigen motivo.
    // Entregar es el flujo normal de bodega y no lo pide.
    const motivo = dto.motivo?.trim() ?? '';
    if (dto.accion !== 'ENTREGAR' && motivo.length < 3)
      throw new BadRequestException(
        dto.accion === 'REVERTIR'
          ? 'Para revertir una entrega hay que escribir el motivo'
          : 'Para corregir la fecha de entrega hay que escribir el motivo',
      );

    let fechaNueva: string | null = null;
    let salida: string | null = null;
    if (dto.accion === 'ENTREGAR') {
      salida = normalizarSalida(dto.salidaSac ?? '');
      if (!salida)
        throw new BadRequestException(
          'Para registrar la entrega hace falta el número de salida SAC',
        );
    }
    if (dto.accion !== 'REVERTIR') {
      if (!dto.fechaEntrega)
        throw new BadRequestException('Falta la fecha de entrega');
      fechaNueva = parsearFecha(dto.fechaEntrega);
      if (!fechaNueva)
        throw new BadRequestException('La fecha de entrega no es válida');
    }

    const nombre = await nombreParaHistorial(this.prisma, idUsuario);
    const ahora = new Date();

    const aplicados = await this.prisma.$transaction(async (tx) => {
      // Los objetivos se leen DENTRO de la transacción y la escritura va por sus
      // ids: el historial anota exactamente lo que se tocó, no lo que se pidió.
      const base = {
        idMaterialOp: { in: filas.map((m) => m.idMaterialOp) },
        idEmpresa,
        anuladoEn: null,
      };
      const objetivo = await tx.materialOp.findMany({
        where: {
          ...base,
          // Defensa ante dos entregas simultáneas: solo lo que siga pendiente.
          entregadoEn: dto.accion === 'ENTREGAR' ? null : { not: null },
        },
        select: { idMaterialOp: true, salidaSac: true, fechaEntrega: true },
      });
      if (objetivo.length === 0) return 0;
      const idsObjetivo = { in: objetivo.map((m) => m.idMaterialOp) };

      if (dto.accion === 'ENTREGAR') {
        await tx.materialOp.updateMany({
          where: { idMaterialOp: idsObjetivo, entregadoEn: null },
          data: {
            salidaSac: salida,
            fechaEntrega: aFecha(fechaNueva!),
            entregadoEn: ahora,
            entregadoPor: idUsuario,
            modificadoEn: ahora,
            modificadoPor: idUsuario,
          },
        });
      } else if (dto.accion === 'CORREGIR_FECHA') {
        await tx.materialOp.updateMany({
          where: { idMaterialOp: idsObjetivo, entregadoEn: { not: null } },
          data: {
            fechaEntrega: aFecha(fechaNueva!),
            modificadoEn: ahora,
            modificadoPor: idUsuario,
          },
        });
      } else {
        await tx.materialOp.updateMany({
          where: { idMaterialOp: idsObjetivo, entregadoEn: { not: null } },
          data: {
            salidaSac: null,
            fechaEntrega: null,
            entregadoEn: null,
            entregadoPor: null,
            modificadoEn: ahora,
            modificadoPor: idUsuario,
          },
        });
      }

      await crearEventos(
        tx,
        objetivo.map((m) => {
          const antesFecha = m.fechaEntrega ? aDia(m.fechaEntrega) : null;
          const cambios: CambioMaterial[] =
            dto.accion === 'ENTREGAR'
              ? [
                  { campo: 'estado', antes: 'Pendiente', despues: 'Entregado' },
                  { campo: 'salidaSac', antes: null, despues: salida },
                  { campo: 'fechaEntrega', antes: null, despues: fechaNueva },
                ]
              : dto.accion === 'CORREGIR_FECHA'
                ? [
                    {
                      campo: 'fechaEntrega',
                      antes: antesFecha,
                      despues: fechaNueva,
                    },
                  ]
                : [
                    {
                      campo: 'estado',
                      antes: 'Entregado',
                      despues: 'Pendiente',
                    },
                    { campo: 'salidaSac', antes: m.salidaSac, despues: null },
                    { campo: 'fechaEntrega', antes: antesFecha, despues: null },
                  ];
          return {
            idEmpresa,
            idMaterialOp: m.idMaterialOp,
            accion: dto.accion,
            cambios,
            motivo: dto.accion === 'ENTREGAR' ? motivo || null : motivo,
            idUsuario,
            usuarioNombre: nombre,
          };
        }),
      );
      return objetivo.length;
    });

    await this.auditoria.registrar({
      idUsuario,
      entidad: 'costeo.material_op',
      idEntidad: filas.map((m) => m.idMaterialOp).join(','),
      accion: 'UPDATE',
      datosNuevos: {
        accion: dto.accion,
        salidaSac: dto.salidaSac ?? null,
        fechaEntrega: dto.fechaEntrega ?? null,
        motivo: motivo || null,
        aplicados,
      },
    });
    return {
      aplicados,
      omitidos: filas.length - aplicados,
      noEncontrados: ids.length - filas.length,
    };
  }

  // ─────────────────────────── Valorizar ───────────────────────────

  /**
   * Congela el costo de los ítems que quedaron "sin costo" porque su insumo no
   * tenía precio al cargar. Solo toca esos: lo que ya tenía costo es la foto
   * del momento y no se mueve (convención #3).
   */
  async congelarCostos(idUsuario: number, idEmpresa: number) {
    const nombre = await nombreParaHistorial(this.prisma, idUsuario);
    const actualizados = await this.prisma.$transaction(async (tx) => {
      // RETURNING para anotar en el historial exactamente los ítems valorizados.
      const tocados = await tx.$queryRaw<
        { id_material_op: number; costo: Prisma.Decimal }[]
      >`
        UPDATE costeo.material_op m
        SET costo_unitario = i.costo_promedio,
            modificado_en = now(),
            modificado_por = ${idUsuario}
        FROM recetas.insumos i
        WHERE m.id_insumo = i.id_insumo
          AND m.id_empresa = ${idEmpresa}
          AND m.anulado_en IS NULL
          AND m.costo_unitario IS NULL
          AND i.costo_promedio > 0
        RETURNING m.id_material_op, i.costo_promedio AS costo
      `;
      await crearEventos(
        tx,
        tocados.map((t) => ({
          idEmpresa,
          idMaterialOp: t.id_material_op,
          accion: 'COSTO_CONGELADO' as const,
          cambios: [
            {
              campo: 'costoUnitario',
              antes: null,
              despues: String(Number(t.costo)),
            },
          ],
          idUsuario,
          usuarioNombre: nombre,
        })),
      );
      return tocados.length;
    });
    const siguenSinCosto = await this.prisma.materialOp.count({
      where: { idEmpresa, anuladoEn: null, costoUnitario: null },
    });
    await this.auditoria.registrar({
      idUsuario,
      entidad: 'costeo.material_op',
      idEntidad: 'congelar-costos',
      accion: 'UPDATE',
      datosNuevos: { actualizados, siguenSinCosto },
    });
    return { actualizados, siguenSinCosto };
  }
}

function firma(d: {
  planificador: string;
  codigoOp: string;
  idInsumo: number;
  cantidad: number;
}) {
  return [d.planificador, d.codigoOp, d.idInsumo, d.cantidad.toFixed(4)].join(
    '|',
  );
}

function aFilaPreview(r: Resuelta): FilaPreviewMaterial {
  const c = r.cruda;
  const d = r.datos;
  return {
    fila: c.fila,
    fechaTexto: c.fechaTexto,
    planificadorTexto: c.planificadorTexto,
    opTexto: c.opTexto,
    codigoTexto: c.codigoTexto,
    cantidadTexto: c.cantidadTexto,
    salidaTexto: c.salidaTexto,
    comentarioTexto: c.comentarioTexto,
    fecha: d?.fecha ?? null,
    ordenPlanificacion: d?.planificador ?? null,
    codigoOp: d?.codigoOp ?? null,
    opLigada: d?.idOrdenProduccion != null,
    insumoCodigo: d?.insumoCodigo ?? null,
    insumoDescripcion: d?.insumoDescripcion ?? null,
    unidad: d?.unidad ?? null,
    cantidad: d?.cantidad ?? null,
    costoUnitario: d && d.costoPromedio > 0 ? d.costoPromedio : null,
    salidaSac: d?.salida ?? null,
    comentario: d?.comentario ?? null,
    nace: d ? (d.salida ? 'ENTREGADO' : 'PENDIENTE') : null,
    error: r.error,
    aviso: r.aviso,
  };
}
