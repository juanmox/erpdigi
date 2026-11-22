import { textoClienteSheetsDeOrden } from '../../common/cliente-sheets';
import {
  formatearFechaSheets,
  GoogleSheetsService,
} from '../../common/google-sheets/google-sheets.service';
import { comentarioParaSheets } from '../../common/prendas-texto';
import type { PrismaService } from '../../prisma/prisma.service';

/** Lo mínimo de una reposición que el espejo necesita. */
export interface ReposicionParaEspejo {
  fecha: Date;
  idOrdenProduccion: number;
  ordenProduccion: { codigo: string };
  codigoRepo: string;
  departamento: { nombre: string };
  empleado: { nombres: string } | null;
  defecto: { nombre: string };
  bodegaSac: string | null;
  yardasPapel: unknown;
  yardasTela: unknown;
  tipoPapel: { nombre: string } | null;
  insumoTela: { descripcion: string } | null;
  impresora: { codigo: string } | null;
  calandra: { codigo: string } | null;
  comentario: string | null;
  prendas: {
    producto: { codigo: string };
    talla: { nombre: string };
    pieza: { nombre: string };
    cantidad: number;
  }[];
}

/**
 * Espejo hacia los dos Google Sheets legacy que todavía alimentan Data Studio.
 *
 * Desde el flujo de validaciones (2026-11-17) se dispara al AUTORIZAR la
 * reposición (paso 6), que es cuando el papel sale del rollo, y no al crearla.
 * La FECHA sigue siendo la de la reposición (como siempre); el NRollo es el
 * resuelto al autorizar.
 *
 * Nunca bloquea ni puede fallar el guardado: `GoogleSheetsService` no lanza.
 */
export async function espejarReposicionEnSheets(
  prisma: PrismaService,
  googleSheets: GoogleSheetsService,
  detalle: ReposicionParaEspejo,
  nrolloTexto: string,
) {
  const fechaTexto = formatearFechaSheets(detalle.fecha);
  const responsable = detalle.empleado?.nombres ?? 'Sin responsable';
  // "<subcliente o cliente> - <deporte>" de los productos de la ORDEN: la
  // reposición todavía es de toda la OP. Ver common/cliente-sheets.ts.
  const cliente = await textoClienteSheetsDeOrden(
    prisma,
    detalle.idOrdenProduccion,
  );
  const yardasPapel = Number(detalle.yardasPapel);
  const yardasTela = Number(detalle.yardasTela);
  const tipoPapel = detalle.tipoPapel?.nombre ?? '';
  const impresora = detalle.impresora?.codigo ?? '';

  // Hoja "Registro" (libro Repos) — una fila por reposición, réplica
  // exacta de guardarRepo()/hojasRepos.appendRow() del Código.gs legacy,
  // más la columna P "Comentario" (agregada a pedido del usuario, solo en
  // este libro). Lleva el comentario del ERP y, a continuación, las piezas
  // repuestas ("Piezas: BSN-FB01N M×1 MANGA IZQ").
  const filaRegistro = [
    fechaTexto,
    detalle.ordenProduccion.codigo,
    detalle.codigoRepo,
    detalle.departamento.nombre,
    responsable,
    detalle.defecto.nombre,
    detalle.bodegaSac ?? '',
    yardasPapel,
    tipoPapel,
    detalle.insumoTela?.descripcion ?? '',
    yardasTela,
    cliente,
    impresora,
    detalle.calandra?.codigo ?? '',
    nrolloTexto,
    comentarioParaSheets(
      detalle.comentario,
      detalle.prendas.map((p) => ({
        producto: p.producto.codigo,
        talla: p.talla.nombre,
        pieza: p.pieza.nombre,
        cantidad: p.cantidad,
      })),
    ),
  ];

  // Hoja "Datos" (libro ConsumosFinal DIGITEXSA, compartido con Forma 2) —
  // mismas columnas que hojaCostos.appendRow() del Código.gs legacy; una
  // reposición solo llena las de papel, el resto queda en blanco (nunca
  // se manda tela ahí, igual que el legacy).
  const filaDatos = [
    fechaTexto,
    '',
    detalle.ordenProduccion.codigo,
    detalle.codigoRepo,
    cliente,
    impresora,
    '',
    tipoPapel,
    '',
    '',
    '',
    '',
    yardasPapel,
    '',
    nrolloTexto,
  ];

  await Promise.all([
    googleSheets.agregarFila(
      process.env.GOOGLE_SHEETS_ID_REGISTRO,
      'Registro',
      filaRegistro,
    ),
    googleSheets.agregarFila(
      process.env.GOOGLE_SHEETS_ID_CONSUMOS,
      'Datos',
      filaDatos,
    ),
  ]);
}
