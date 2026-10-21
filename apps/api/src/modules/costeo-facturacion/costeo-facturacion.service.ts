import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { fechaCelda, textoCelda } from '../../common/excel-celda';
import { parsearCodigoOf } from '../../common/of-codigo';
import { mensajeOfNoEncontrada } from '../../common/of-otra-empresa';
import { parsearCodigoOp } from '../../common/op-codigo';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { FilaPreviewOfOp } from './costeo-facturacion.types';
import { AgregarOpDto } from './dto/agregar-op.dto';
import { FilaAplicarOfOpDto } from './dto/aplicar-importar.dto';
import { AsignarFacturaDto } from './dto/asignar-factura.dto';
import { EditarOrdenFacturacionDto } from './dto/editar-orden-facturacion.dto';
import { MotivoDto } from './dto/motivo.dto';

const AZUL_DIGITEXSA = 'FF203080';
// Mismo preámbulo de 4 filas que todos los imports del proyecto (título +
// instrucciones + blanco + encabezado) — bug real ya encontrado 4 veces en
// otros módulos cuando se leía desde la fila 2.
const FILA_INICIO_DATOS = 5;

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

/** `(26, 159)` -> `"26OF000159"`, mismo formato que la columna GENERATED. */
function codigoDe(
  prefijo: 'OP' | 'OF',
  anio: number,
  correlativo: number,
): string {
  return `${String(anio).padStart(2, '0')}${prefijo}${String(correlativo).padStart(6, '0')}`;
}

const ISO = (d: Date) => d.toISOString().slice(0, 10);

const COLUMNAS = {
  op: ['op (codigo)', 'op'],
  of: ['of (codigo)', 'of'],
  fechaOf: ['fecha of'],
  numeroFactura: [
    'no. factura (opcional)',
    'numero de factura (opcional)',
    'no. factura',
  ],
  fechaFactura: ['fecha factura (opcional)', 'fecha factura'],
} as const;
type ClaveColumna = keyof typeof COLUMNAS;

function resolverColumnas(ws: ExcelJS.Worksheet) {
  const porNombre = new Map<string, number>();
  const encabezado = ws.getRow(FILA_INICIO_DATOS - 1);
  encabezado.eachCell((cell, col) => {
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

  const faltan = (['op', 'of', 'fechaOf'] as ClaveColumna[]).filter(
    (c) => idx[c] == null,
  );
  if (faltan.length > 0)
    throw new BadRequestException(
      `El archivo no tiene la fila de encabezado esperada en la fila ${FILA_INICIO_DATOS - 1}: ` +
        `faltan las columnas ${faltan.join(', ')}. Descargá la plantilla y copiá los datos ahí.`,
    );
  return idx;
}

interface Cruda {
  fila: number;
  opTexto: string;
  ofTexto: string;
  fechaOfTexto: string;
  fechaOf: Date | null;
  numeroFacturaTexto: string;
  fechaFacturaTexto: string;
  fechaFactura: Date | null;
}

type OpResuelta = {
  idOrdenProduccion: number;
  codigo: string;
  idCliente: number | null;
  cliente: { nombre: string } | null;
};
type OfResuelta = {
  idOrdenFacturacion: number;
  codigo: string;
  idCliente: number;
  cliente: { nombre: string };
  fecha: Date;
  numeroFactura: string | null;
  fechaFactura: Date | null;
  anuladaEn: Date | null;
};

interface Resuelta {
  fila: number;
  opTexto: string;
  ofTexto: string;
  fechaOfTexto: string;
  numeroFacturaTexto: string;
  fechaFacturaTexto: string;
  opParsed: { anio: number; correlativo: number } | null;
  ofParsed: { anio: number; correlativo: number } | null;
  op: OpResuelta | null;
  ofExistente: OfResuelta | null;
  fechaOf: Date | null;
  numeroFactura: string | null;
  fechaFactura: Date | null;
  estado: 'nueva' | 'ya_cargada' | null;
  error: string | null;
}

export interface FiltrosOrdenesFacturacion {
  idCliente?: number;
  codigos?: string[];
  codigoDesde?: string;
  codigoHasta?: string;
  numeroFactura?: string;
  /**
   * `fecha`/`fechaFactura` son columnas `date` (sin hora ni zona) — a
   * diferencia de `consumo_papel.fecha` (timestamptz), NO hace falta el
   * anclaje a UTC-6 de `dia-guatemala.ts`: un `date` no tiene concepto de
   * zona horaria, así que `gte`/`lte` directos sobre el día pedido son
   * exactos, sin el desfase de 6 horas que sí afecta a los timestamptz.
   */
  fechaOfDesde?: Date;
  fechaOfHasta?: Date;
  fechaFacturaDesde?: Date;
  fechaFacturaHasta?: Date;
  estado?: 'sin_factura' | 'facturada' | 'anulada';
}

@Injectable()
export class CosteoFacturacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async nombresDeUsuarios(ids: number[]): Promise<Map<number, string>> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const usuarios = await this.prisma.usuario.findMany({
      where: { idUsuario: { in: unicos } },
      select: { idUsuario: true, username: true, nombreCompleto: true },
    });
    return new Map(
      usuarios.map((u) => [u.idUsuario, u.nombreCompleto || u.username]),
    );
  }

  async plantillaImportar(): Promise<ExcelJS.Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digitexsa ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('OP a OF');
    ws.mergeCells(1, 1, 1, 5);
    ws.getCell('A1').value =
      'Digital Textil, S.A. (Digitexsa) — Carga de Órdenes de Facturación (OF) por plantilla';
    ws.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: AZUL_DIGITEXSA },
    };
    ws.mergeCells(2, 1, 2, 5);
    ws.getCell('A2').value =
      'Una fila por cada OP que pertenece a una OF. Si la OF ya existe, la OP se agrega a lo que ya tiene; ' +
      'si una OP ya está vigente en OTRA OF, la fila queda pendiente — hay que quitarla de ahí primero desde la pantalla. ' +
      'No. factura y Fecha factura son opcionales y van juntos (sirven para cargar OF que ya se facturaron) — si una OF ya tiene factura asignada, no se puede cambiar por acá.';
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF888888' } };

    const headerRow = ws.getRow(4);
    headerRow.values = [
      'OP (código)',
      'OF (código)',
      'Fecha OF',
      'No. factura (opcional)',
      'Fecha factura (opcional)',
    ];
    headerRow.eachCell(estiloEncabezado);
    [16, 16, 14, 20, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));

    return wb.xlsx.writeBuffer();
  }

  async previewImportar(
    buffer: Buffer,
    idEmpresa: number,
  ): Promise<{ filas: FilaPreviewOfOp[] }> {
    const crudas = await this.leerArchivo(buffer);
    const resueltas = await this.resolverFilas(crudas, idEmpresa, this.prisma);
    return { filas: resueltas.map(aFilaPreview) };
  }

  private async leerArchivo(buffer: Buffer): Promise<Cruda[]> {
    if (!buffer || buffer.length === 0)
      throw new BadRequestException('Archivo vacío o no recibido');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El archivo no tiene hojas');

    const idx = resolverColumnas(ws);
    const crudas: Cruda[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber < FILA_INICIO_DATOS) return;
      const opTexto =
        idx.op == null ? '' : textoCelda(row.getCell(idx.op).value).trim();
      const ofTexto =
        idx.of == null ? '' : textoCelda(row.getCell(idx.of).value).trim();
      if (!opTexto && !ofTexto) return; // fila en blanco

      const celdaFechaOf =
        idx.fechaOf == null ? null : row.getCell(idx.fechaOf).value;
      const celdaNumFactura =
        idx.numeroFactura == null ? null : row.getCell(idx.numeroFactura).value;
      const celdaFechaFactura =
        idx.fechaFactura == null ? null : row.getCell(idx.fechaFactura).value;

      crudas.push({
        fila: rowNumber,
        opTexto,
        ofTexto,
        fechaOfTexto:
          celdaFechaOf == null ? '' : textoCelda(celdaFechaOf).trim(),
        fechaOf: celdaFechaOf == null ? null : fechaCelda(celdaFechaOf),
        numeroFacturaTexto:
          celdaNumFactura == null ? '' : textoCelda(celdaNumFactura).trim(),
        fechaFacturaTexto:
          celdaFechaFactura == null ? '' : textoCelda(celdaFechaFactura).trim(),
        fechaFactura:
          celdaFechaFactura == null ? null : fechaCelda(celdaFechaFactura),
      });
    });
    return crudas;
  }

  /**
   * El corazón del import: resuelve y valida cada fila contra el estado REAL
   * de la base. La usan tanto el preview (de solo lectura, fuera de
   * transacción) como `aplicarImportar` (dentro de su transacción, para que
   * dos imports simultáneos no se pisen) — convención #1: nunca confiar en lo
   * que ya pasó por el navegador, revalidar siempre contra el estado actual.
   */
  private async resolverFilas(
    crudas: Cruda[],
    idEmpresa: number,
    db: Pick<PrismaService, 'ordenProduccion' | 'ordenFacturacion' | 'ofOp'>,
  ): Promise<Resuelta[]> {
    if (crudas.length === 0) return [];

    const opsParsed = crudas.map((c) => parsearCodigoOp(c.opTexto));
    const opsClaves = opsParsed.filter((p): p is NonNullable<typeof p> => !!p);
    const ops =
      opsClaves.length === 0
        ? []
        : await db.ordenProduccion.findMany({
            where: {
              idEmpresa,
              OR: opsClaves.map((p) => ({
                anio: p.anio,
                correlativo: p.correlativo,
              })),
            },
            select: {
              idOrdenProduccion: true,
              anio: true,
              correlativo: true,
              codigo: true,
              idCliente: true,
              cliente: { select: { nombre: true } },
            },
          });
    const opPorClave = new Map(
      ops.map((o) => [`${o.anio}|${o.correlativo}`, o]),
    );

    const ofsParsed = crudas.map((c) => parsearCodigoOf(c.ofTexto));
    const ofsClaves = ofsParsed.filter((p): p is NonNullable<typeof p> => !!p);
    const ofsExistentes =
      ofsClaves.length === 0
        ? []
        : await db.ordenFacturacion.findMany({
            where: {
              idEmpresa,
              OR: ofsClaves.map((p) => ({
                anio: p.anio,
                correlativo: p.correlativo,
              })),
            },
            select: {
              idOrdenFacturacion: true,
              anio: true,
              correlativo: true,
              codigo: true,
              idCliente: true,
              cliente: { select: { nombre: true } },
              fecha: true,
              numeroFactura: true,
              fechaFactura: true,
              anuladaEn: true,
            },
          });
    const ofPorClave = new Map(
      ofsExistentes.map((o) => [`${o.anio}|${o.correlativo}`, o]),
    );

    // Qué OP ya está vigente en qué OF — de TODA la base (no solo las del
    // archivo), porque una OP vigente en una OF cargada hace tiempo también
    // tiene que bloquear que el archivo la reasigne sin pasar por "quitar".
    const opIds = ops.map((o) => o.idOrdenProduccion);
    const vigentes =
      opIds.length === 0
        ? []
        : await db.ofOp.findMany({
            where: { idOrdenProduccion: { in: opIds }, anuladoEn: null },
            select: {
              idOrdenProduccion: true,
              ordenFacturacion: {
                select: { codigo: true, anio: true, correlativo: true },
              },
            },
          });
    const vigentePorOp = new Map(vigentes.map((v) => [v.idOrdenProduccion, v]));

    const resueltas: Resuelta[] = crudas.map((c, i) => {
      const opParsed = opsParsed[i];
      const ofParsed = ofsParsed[i];
      const op = opParsed
        ? (opPorClave.get(`${opParsed.anio}|${opParsed.correlativo}`) ?? null)
        : null;
      const ofExistente = ofParsed
        ? (ofPorClave.get(`${ofParsed.anio}|${ofParsed.correlativo}`) ?? null)
        : null;

      let error: string | null = null;
      if (!opParsed)
        error = `OP inválida: "${c.opTexto}" (formato esperado 26OP014154)`;
      else if (!op) error = `La OP ${c.opTexto} no existe en esta empresa`;
      else if (!op.idCliente)
        error = `La OP ${op.codigo} no tiene cliente asignado: no se puede facturar`;

      if (!error && !ofParsed)
        error = `OF inválida: "${c.ofTexto}" (formato esperado 26OF000159)`;

      if (!error && !c.fechaOfTexto) error = 'Falta la fecha de OF';
      else if (!error && !c.fechaOf)
        error = `"Fecha OF" no se pudo interpretar como fecha: "${c.fechaOfTexto}"`;

      const numeroFactura = c.numeroFacturaTexto || null;
      if (!error) {
        const trajoFechaTexto = !!c.fechaFacturaTexto;
        if (numeroFactura && !trajoFechaTexto)
          error = 'Trae número de factura sin su fecha';
        else if (!numeroFactura && trajoFechaTexto)
          error = 'Trae fecha de factura sin su número';
        else if (trajoFechaTexto && !c.fechaFactura)
          error = `"Fecha factura" no se pudo interpretar como fecha: "${c.fechaFacturaTexto}"`;
      }

      if (!error && ofExistente?.anuladaEn)
        error = `La OF ${ofExistente.codigo} está anulada — ese número no se reutiliza`;

      if (!error && op) {
        const vig = vigentePorOp.get(op.idOrdenProduccion);
        if (vig && ofParsed) {
          const mismaOf =
            vig.ordenFacturacion.anio === ofParsed.anio &&
            vig.ordenFacturacion.correlativo === ofParsed.correlativo;
          if (!mismaOf)
            error = `La OP ${op.codigo} ya está en la OF ${vig.ordenFacturacion.codigo} — quitala de ahí primero`;
        }
      }

      return {
        fila: c.fila,
        opTexto: c.opTexto,
        ofTexto: c.ofTexto,
        fechaOfTexto: c.fechaOfTexto,
        numeroFacturaTexto: c.numeroFacturaTexto,
        fechaFacturaTexto: c.fechaFacturaTexto,
        opParsed,
        ofParsed,
        op,
        ofExistente,
        fechaOf: c.fechaOf,
        numeroFactura,
        fechaFactura: c.fechaFactura,
        estado: null,
        error,
      };
    });

    // ── Consistencia POR OF, agrupando el archivo entero ──
    // La OP repetida dentro del archivo también se detecta acá: dos filas
    // apuntando a la misma OP, en la misma o distinta OF, es un error en
    // ambas — no se adivina cuál es la buena.
    const porOp = new Map<string, Resuelta[]>();
    const porOf = new Map<string, Resuelta[]>();
    for (const r of resueltas) {
      if (r.opParsed) {
        const k = `${r.opParsed.anio}|${r.opParsed.correlativo}`;
        (porOp.get(k) ?? porOp.set(k, []).get(k)!).push(r);
      }
      if (r.ofParsed) {
        const k = `${r.ofParsed.anio}|${r.ofParsed.correlativo}`;
        (porOf.get(k) ?? porOf.set(k, []).get(k)!).push(r);
      }
    }

    for (const [, filasOp] of porOp) {
      if (filasOp.length <= 1) continue;
      const nums = filasOp.map((r) => r.fila).join(', ');
      for (const r of filasOp)
        if (!r.error)
          r.error = `Esta OP aparece más de una vez en el archivo (filas ${nums})`;
    }

    for (const [, filasOf] of porOf) {
      const primero = filasOf[0];
      if (!primero.ofParsed) continue;
      const codigoOf =
        primero.ofExistente?.codigo ??
        codigoDe('OF', primero.ofParsed.anio, primero.ofParsed.correlativo);

      // Fecha OF: todas las filas (+ la que ya tenía la OF en la base, si
      // existe) tienen que coincidir en un único día calendario.
      const fechasOf = new Set<string>();
      if (primero.ofExistente) fechasOf.add(ISO(primero.ofExistente.fecha));
      for (const r of filasOf) if (r.fechaOf) fechasOf.add(ISO(r.fechaOf));
      if (fechasOf.size > 1) {
        const msg = `La OF ${codigoOf} trae más de una fecha distinta (${[...fechasOf].join(', ')})`;
        for (const r of filasOf) if (!r.error) r.error = msg;
      }

      // Cliente: todas las OP de una OF tienen que ser del mismo cliente —
      // decisión del usuario ("una OF = un cliente").
      const clientesIds = new Set<number>();
      const clientesNombres = new Map<number, string>();
      if (primero.ofExistente) {
        clientesIds.add(primero.ofExistente.idCliente);
        clientesNombres.set(
          primero.ofExistente.idCliente,
          primero.ofExistente.cliente.nombre,
        );
      }
      for (const r of filasOf)
        if (r.op?.idCliente) {
          clientesIds.add(r.op.idCliente);
          clientesNombres.set(
            r.op.idCliente,
            r.op.cliente?.nombre ?? String(r.op.idCliente),
          );
        }
      if (clientesIds.size > 1) {
        const nombres = [...clientesIds]
          .map((id) => clientesNombres.get(id))
          .join(' y ');
        const msg = `La OF ${codigoOf} mezcla clientes distintos (${nombres}) — una OF es de un solo cliente`;
        for (const r of filasOf) if (!r.error) r.error = msg;
      }

      // Factura: si la OF YA tiene factura en la base, el archivo no la puede
      // cambiar por acá (se corrige desde la pantalla). Si el archivo trae
      // factura para una OF que no la tiene, todas las filas que la traen
      // tienen que coincidir entre sí.
      const facturasEnArchivo = new Set<string>();
      for (const r of filasOf)
        if (r.numeroFactura)
          facturasEnArchivo.add(
            `${r.numeroFactura}|${r.fechaFactura ? ISO(r.fechaFactura) : ''}`,
          );
      if (facturasEnArchivo.size > 1) {
        const msg = `La OF ${codigoOf} trae más de una factura distinta en el archivo`;
        for (const r of filasOf) if (!r.error) r.error = msg;
      } else if (
        facturasEnArchivo.size === 1 &&
        primero.ofExistente?.numeroFactura &&
        !facturasEnArchivo.has(
          `${primero.ofExistente.numeroFactura}|${primero.ofExistente.fechaFactura ? ISO(primero.ofExistente.fechaFactura) : ''}`,
        )
      ) {
        const msg = `La OF ${codigoOf} ya tiene la factura ${primero.ofExistente.numeroFactura} asignada — corregila desde la pantalla, no por plantilla`;
        for (const r of filasOf) if (!r.error) r.error = msg;
      }
    }

    // ── Estado final: 'ya_cargada' vs 'nueva' (solo para filas sin error) ──
    for (const r of resueltas) {
      if (r.error || !r.op || !r.ofParsed) continue;
      const vig = vigentePorOp.get(r.op.idOrdenProduccion);
      const yaEnEstaOf =
        !!vig &&
        vig.ordenFacturacion.anio === r.ofParsed.anio &&
        vig.ordenFacturacion.correlativo === r.ofParsed.correlativo;
      r.estado = yaEnEstaOf ? 'ya_cargada' : 'nueva';
    }

    return resueltas;
  }

  async aplicarImportar(
    filas: FilaAplicarOfOpDto[],
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    if (!filas || filas.length === 0)
      throw new BadRequestException('No hay filas para aplicar');

    const crudas: Cruda[] = filas.map((f) => ({
      fila: f.fila,
      opTexto: f.opTexto,
      ofTexto: f.ofTexto,
      fechaOfTexto: f.fechaOfTexto,
      fechaOf: f.fechaOfTexto ? fechaDeTexto(f.fechaOfTexto) : null,
      numeroFacturaTexto: f.numeroFacturaTexto ?? '',
      fechaFacturaTexto: f.fechaFacturaTexto ?? '',
      fechaFactura: f.fechaFacturaTexto
        ? fechaDeTexto(f.fechaFacturaTexto)
        : null,
    }));

    const resultado = await this.prisma.$transaction(
      async (tx) => {
        // Se revalida ACÁ, dentro de la transacción, y no solo en el
        // preview: su salida pasa por el navegador y vuelve. Si una sola fila
        // ya no es válida (alguien más cargó esa OP mientras tanto, por
        // ejemplo), se aborta TODO el lote — no se aplica a medias.
        const resueltas = await this.resolverFilas(crudas, idEmpresa, tx);
        const conError = resueltas.filter((r) => r.error);
        if (conError.length > 0)
          throw new BadRequestException(
            `${conError.length} de las ${resueltas.length} filas ya no son válidas — volvé a generar el preview. ` +
              `Ejemplo: fila ${conError[0].fila}: ${conError[0].error}`,
          );

        const idOfPorClave = new Map<string, number>();
        let ofsCreadas = 0;
        let ofsConFacturaAsignada = 0;
        let opsAsignadas = 0;
        let opsYaCargadas = 0;

        // Una pasada por OF (no por fila): se crea o se completa la factura
        // una sola vez por OF, aunque traiga varias OP.
        const porOf = new Map<string, Resuelta[]>();
        for (const r of resueltas) {
          if (!r.ofParsed) continue;
          const k = `${r.ofParsed.anio}|${r.ofParsed.correlativo}`;
          (porOf.get(k) ?? porOf.set(k, []).get(k)!).push(r);
        }

        for (const [clave, filasOf] of porOf) {
          const primero = filasOf[0];
          if (primero.ofExistente) {
            idOfPorClave.set(clave, primero.ofExistente.idOrdenFacturacion);
            const numeroFactura = filasOf
              .map((r) => r.numeroFactura)
              .find((n) => n);
            const fechaFactura = filasOf
              .map((r) => r.fechaFactura)
              .find((f) => f);
            if (numeroFactura && !primero.ofExistente.numeroFactura) {
              await tx.ordenFacturacion.update({
                where: {
                  idOrdenFacturacion: primero.ofExistente.idOrdenFacturacion,
                },
                data: { numeroFactura, fechaFactura },
              });
              ofsConFacturaAsignada++;
            }
            continue;
          }
          // Cliente de la OF nueva: la resolución por-OF ya garantizó que
          // todas las filas con OP resuelta comparten el mismo cliente.
          const idCliente = filasOf.find((r) => r.op?.idCliente)?.op?.idCliente;
          if (!idCliente)
            throw new BadRequestException(
              `No se pudo determinar el cliente de la OF ${codigoDe('OF', primero.ofParsed!.anio, primero.ofParsed!.correlativo)}`,
            );
          const numeroFactura =
            filasOf.map((r) => r.numeroFactura).find((n) => n) ?? null;
          const fechaFactura =
            filasOf.map((r) => r.fechaFactura).find((f) => f) ?? null;
          const creada = await tx.ordenFacturacion.create({
            data: {
              idEmpresa,
              anio: primero.ofParsed!.anio,
              correlativo: primero.ofParsed!.correlativo,
              fecha: primero.fechaOf!,
              idCliente,
              numeroFactura,
              fechaFactura,
              origen: 'PLANTILLA',
              creadoPor: idUsuarioActor,
            },
          });
          idOfPorClave.set(clave, creada.idOrdenFacturacion);
          ofsCreadas++;
        }

        for (const r of resueltas) {
          if (!r.ofParsed || !r.op) continue;
          if (r.estado === 'ya_cargada') {
            opsYaCargadas++;
            continue;
          }
          const idOrdenFacturacion = idOfPorClave.get(
            `${r.ofParsed.anio}|${r.ofParsed.correlativo}`,
          );
          if (!idOrdenFacturacion) continue;
          await tx.ofOp.create({
            data: {
              idOrdenFacturacion,
              idOrdenProduccion: r.op.idOrdenProduccion,
              idEmpresa,
              asignadoPor: idUsuarioActor,
            },
          });
          opsAsignadas++;
        }

        return {
          ofsCreadas,
          ofsConFacturaAsignada,
          opsAsignadas,
          opsYaCargadas,
        };
      },
      { timeout: 60_000 },
    );

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.orden_facturacion',
      idEntidad: 'import',
      accion: 'CREATE',
      datosNuevos: resultado,
    });

    return resultado;
  }

  // ── Listado y filtros ──────────────────────────────────────────────────

  async listar(idEmpresa: number, f: FiltrosOrdenesFacturacion) {
    const where: Record<string, unknown> = { idEmpresa };
    if (f.idCliente) where.idCliente = f.idCliente;
    if (f.numeroFactura)
      where.numeroFactura = { contains: f.numeroFactura, mode: 'insensitive' };
    if (f.codigos && f.codigos.length > 0) where.codigo = { in: f.codigos };
    if (f.codigoDesde || f.codigoHasta)
      where.codigo = {
        ...(where.codigo as object | undefined),
        ...(f.codigoDesde ? { gte: f.codigoDesde } : {}),
        ...(f.codigoHasta ? { lte: f.codigoHasta } : {}),
      };
    if (f.fechaOfDesde || f.fechaOfHasta)
      where.fecha = {
        ...(f.fechaOfDesde ? { gte: f.fechaOfDesde } : {}),
        ...(f.fechaOfHasta ? { lte: f.fechaOfHasta } : {}),
      };
    if (f.fechaFacturaDesde || f.fechaFacturaHasta)
      where.fechaFactura = {
        ...(f.fechaFacturaDesde ? { gte: f.fechaFacturaDesde } : {}),
        ...(f.fechaFacturaHasta ? { lte: f.fechaFacturaHasta } : {}),
      };
    if (f.estado === 'anulada') where.anuladaEn = { not: null };
    else {
      // Por default no se mezclan las anuladas con las vigentes — hay que
      // pedirlas explícitamente con estado=anulada.
      where.anuladaEn = null;
      if (f.estado === 'sin_factura') where.numeroFactura = null;
      else if (f.estado === 'facturada') where.numeroFactura = { not: null };
    }

    const ofs = await this.prisma.ordenFacturacion.findMany({
      where,
      include: {
        cliente: { select: { nombre: true } },
        _count: { select: { ofOp: { where: { anuladoEn: null } } } },
      },
      orderBy: [{ fecha: 'desc' }, { idOrdenFacturacion: 'desc' }],
      take: 500,
    });
    return ofs.map((o) => ({
      idOrdenFacturacion: o.idOrdenFacturacion,
      codigo: o.codigo,
      fecha: o.fecha,
      cliente: o.cliente.nombre,
      numeroFactura: o.numeroFactura,
      fechaFactura: o.fechaFactura,
      cantidadOps: o._count.ofOp,
      anuladaEn: o.anuladaEn,
      origen: o.origen,
    }));
  }

  async obtenerPorCodigo(codigo: string, idEmpresa: number, idUsuario: number) {
    const parsed = parsearCodigoOf(codigo);
    if (!parsed)
      throw new BadRequestException(
        'Código de OF inválido (formato esperado: 26OF000159)',
      );

    const of = await this.prisma.ordenFacturacion.findFirst({
      where: { idEmpresa, anio: parsed.anio, correlativo: parsed.correlativo },
      include: {
        cliente: { select: { nombre: true } },
        tipoServicio: { select: { nombre: true } },
        ofOp: {
          include: {
            ordenProduccion: { select: { codigo: true, estatus: true } },
          },
          orderBy: { idOfOp: 'asc' },
        },
      },
    });
    if (!of)
      throw new NotFoundException(
        await mensajeOfNoEncontrada(this.prisma, {
          codigo,
          anio: parsed.anio,
          correlativo: parsed.correlativo,
          idUsuario,
          idEmpresaActual: idEmpresa,
        }),
      );

    const nombres = await this.nombresDeUsuarios([
      of.creadoPor,
      of.anuladaPor ?? -1,
      ...of.ofOp.flatMap((a) => [a.asignadoPor, a.anuladoPor ?? -1]),
    ]);

    return {
      idOrdenFacturacion: of.idOrdenFacturacion,
      codigo: of.codigo,
      fecha: of.fecha,
      cliente: of.cliente.nombre,
      idCliente: of.idCliente,
      tipoServicio: of.tipoServicio?.nombre ?? null,
      numeroFactura: of.numeroFactura,
      fechaFactura: of.fechaFactura,
      origen: of.origen,
      creadoEn: of.creadoEn,
      creadoPor: nombres.get(of.creadoPor) ?? null,
      anuladaEn: of.anuladaEn,
      anuladaPor: of.anuladaPor ? (nombres.get(of.anuladaPor) ?? null) : null,
      motivoAnulacion: of.motivoAnulacion,
      ops: of.ofOp
        .filter((a) => !a.anuladoEn)
        .map((a) => ({
          idOfOp: a.idOfOp,
          codigoOp: a.ordenProduccion.codigo,
          estatusOp: a.ordenProduccion.estatus,
          asignadoEn: a.asignadoEn,
          asignadoPor: nombres.get(a.asignadoPor) ?? null,
        })),
      opsHistorial: of.ofOp
        .filter((a) => !!a.anuladoEn)
        .map((a) => ({
          idOfOp: a.idOfOp,
          codigoOp: a.ordenProduccion.codigo,
          asignadoEn: a.asignadoEn,
          asignadoPor: nombres.get(a.asignadoPor) ?? null,
          anuladoEn: a.anuladoEn,
          anuladoPor: a.anuladoPor ? (nombres.get(a.anuladoPor) ?? null) : null,
          motivoAnulacion: a.motivoAnulacion,
        })),
    };
  }

  private async obtenerOfPropia(idOrdenFacturacion: number, idEmpresa: number) {
    const of = await this.prisma.ordenFacturacion.findFirst({
      where: { idOrdenFacturacion, idEmpresa },
    });
    if (!of) throw new NotFoundException('Orden de facturación no encontrada');
    return of;
  }

  async asignarFactura(
    idOrdenFacturacion: number,
    dto: AsignarFacturaDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const of = await this.obtenerOfPropia(idOrdenFacturacion, idEmpresa);
    if (of.anuladaEn) throw new ConflictException('La OF está anulada');

    const numero = dto.numeroFactura?.trim() || null;
    const fecha = dto.fecha || null;
    // Los dos juntos o ninguno — mismo CHECK que en la base, verificado acá
    // para dar un 400 legible en vez de la excepción cruda de Postgres.
    if ((numero && !fecha) || (!numero && fecha))
      throw new BadRequestException(
        'Número y fecha de factura van juntos, o ninguno de los dos',
      );

    await this.prisma.ordenFacturacion.update({
      where: { idOrdenFacturacion },
      data: {
        numeroFactura: numero,
        fechaFactura: fecha ? new Date(fecha) : null,
      },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.orden_facturacion',
      idEntidad: String(idOrdenFacturacion),
      accion: 'UPDATE',
      datosAnteriores: {
        numeroFactura: of.numeroFactura,
        fechaFactura: of.fechaFactura,
      },
      datosNuevos: { numeroFactura: numero, fechaFactura: fecha },
    });

    return this.obtenerPorCodigo(of.codigo, idEmpresa, idUsuarioActor);
  }

  async editarFecha(
    idOrdenFacturacion: number,
    dto: EditarOrdenFacturacionDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const of = await this.obtenerOfPropia(idOrdenFacturacion, idEmpresa);
    if (of.anuladaEn) throw new ConflictException('La OF está anulada');

    await this.prisma.ordenFacturacion.update({
      where: { idOrdenFacturacion },
      data: { fecha: new Date(dto.fecha) },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.orden_facturacion',
      idEntidad: String(idOrdenFacturacion),
      accion: 'UPDATE',
      datosAnteriores: { fecha: of.fecha },
      datosNuevos: { fecha: dto.fecha },
    });

    return this.obtenerPorCodigo(of.codigo, idEmpresa, idUsuarioActor);
  }

  async agregarOp(
    idOrdenFacturacion: number,
    dto: AgregarOpDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const of = await this.obtenerOfPropia(idOrdenFacturacion, idEmpresa);
    if (of.anuladaEn) throw new ConflictException('La OF está anulada');

    const parsed = parsearCodigoOp(dto.codigoOp);
    if (!parsed)
      throw new BadRequestException(
        'Código de OP inválido (formato esperado: 26OP014154)',
      );

    const op = await this.prisma.ordenProduccion.findFirst({
      where: { idEmpresa, anio: parsed.anio, correlativo: parsed.correlativo },
      select: { idOrdenProduccion: true, codigo: true, idCliente: true },
    });
    if (!op)
      throw new NotFoundException(
        `La OP ${dto.codigoOp} no existe en esta empresa`,
      );
    if (!op.idCliente)
      throw new BadRequestException(
        `La OP ${op.codigo} no tiene cliente asignado`,
      );
    if (op.idCliente !== of.idCliente)
      throw new ConflictException(
        `La OP ${op.codigo} es de otro cliente — esta OF es de ${of.idCliente}`,
      );

    const vigente = await this.prisma.ofOp.findFirst({
      where: { idOrdenProduccion: op.idOrdenProduccion, anuladoEn: null },
      include: { ordenFacturacion: { select: { codigo: true } } },
    });
    if (vigente)
      throw new ConflictException(
        vigente.idOrdenFacturacion === idOrdenFacturacion
          ? `La OP ${op.codigo} ya está en esta OF`
          : `La OP ${op.codigo} ya está en la OF ${vigente.ordenFacturacion.codigo} — quitala de ahí primero`,
      );

    const creada = await this.prisma.ofOp.create({
      data: {
        idOrdenFacturacion,
        idOrdenProduccion: op.idOrdenProduccion,
        idEmpresa,
        asignadoPor: idUsuarioActor,
      },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.of_op',
      idEntidad: String(creada.idOfOp),
      accion: 'CREATE',
      datosNuevos: { of: of.codigo, op: op.codigo },
    });

    return this.obtenerPorCodigo(of.codigo, idEmpresa, idUsuarioActor);
  }

  async quitarOp(
    idOfOp: number,
    dto: MotivoDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const asignacion = await this.prisma.ofOp.findFirst({
      where: { idOfOp, idEmpresa },
      include: {
        ordenFacturacion: { select: { codigo: true } },
        ordenProduccion: { select: { codigo: true } },
      },
    });
    if (!asignacion) throw new NotFoundException('Asignación no encontrada');
    if (asignacion.anuladoEn)
      throw new ConflictException('Esa OP ya estaba quitada de esta OF');

    await this.prisma.ofOp.update({
      where: { idOfOp },
      data: {
        anuladoEn: new Date(),
        anuladoPor: idUsuarioActor,
        motivoAnulacion: dto.motivo.trim(),
      },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.of_op',
      idEntidad: String(idOfOp),
      accion: 'UPDATE',
      datosNuevos: {
        accion: 'QUITADA',
        of: asignacion.ordenFacturacion.codigo,
        op: asignacion.ordenProduccion.codigo,
        motivo: dto.motivo.trim(),
      },
    });

    return this.obtenerPorCodigo(
      asignacion.ordenFacturacion.codigo,
      idEmpresa,
      idUsuarioActor,
    );
  }

  /**
   * Anula la OF entera y, en la misma transacción, todas sus asignaciones
   * vigentes — las OP quedan libres para otra OF. Confirmado con el usuario:
   * "si se anula una OF, todas sus OPs quedan disponibles para ser usadas
   * nuevamente en otras OFs".
   */
  async anularOf(
    idOrdenFacturacion: number,
    dto: MotivoDto,
    idUsuarioActor: number,
    idEmpresa: number,
  ) {
    const of = await this.obtenerOfPropia(idOrdenFacturacion, idEmpresa);
    if (of.anuladaEn) throw new ConflictException('La OF ya está anulada');

    const motivo = dto.motivo.trim();
    const ahora = new Date();

    const resultado = await this.prisma.$transaction(async (tx) => {
      await tx.ordenFacturacion.update({
        where: { idOrdenFacturacion },
        data: {
          anuladaEn: ahora,
          anuladaPor: idUsuarioActor,
          motivoAnulacion: motivo,
        },
      });
      const liberadas = await tx.ofOp.updateMany({
        where: { idOrdenFacturacion, anuladoEn: null },
        data: {
          anuladoEn: ahora,
          anuladoPor: idUsuarioActor,
          motivoAnulacion: `OF anulada: ${motivo}`,
        },
      });
      return { opsLiberadas: liberadas.count };
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      idEmpresa,
      entidad: 'costeo.orden_facturacion',
      idEntidad: String(idOrdenFacturacion),
      accion: 'UPDATE',
      datosNuevos: { accion: 'ANULADA', of: of.codigo, motivo, ...resultado },
    });

    return this.obtenerPorCodigo(of.codigo, idEmpresa, idUsuarioActor);
  }
}

/** `FilaAplicarOfOpDto.fechaOfTexto` llega ya como texto suelto del navegador (el preview ya validó el formato); se reinterpreta igual que una celda. */
function fechaDeTexto(texto: string): Date | null {
  const t = texto.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function aFilaPreview(r: Resuelta): FilaPreviewOfOp {
  return {
    fila: r.fila,
    opTexto: r.opTexto,
    ofTexto: r.ofTexto,
    fechaOfTexto: r.fechaOfTexto,
    numeroFacturaTexto: r.numeroFacturaTexto,
    fechaFacturaTexto: r.fechaFacturaTexto,
    codigoOp: r.op?.codigo ?? null,
    clienteOp: r.op?.cliente?.nombre ?? null,
    codigoOf:
      r.ofExistente?.codigo ??
      (r.ofParsed
        ? codigoDe('OF', r.ofParsed.anio, r.ofParsed.correlativo)
        : null),
    fechaOf: r.fechaOf ? ISO(r.fechaOf) : null,
    numeroFactura: r.numeroFactura,
    fechaFactura: r.fechaFactura ? ISO(r.fechaFactura) : null,
    estado: r.estado,
    error: r.error,
  };
}
