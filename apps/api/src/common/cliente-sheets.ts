import { PrismaService } from '../prisma/prisma.service';

/**
 * Texto de la columna CLIENTE de los Google Sheets legacy ("Registro" y
 * "Datos"): `<subcliente o cliente> - <deporte>`, ej. `BSN SPORTS - Basketball`.
 *
 * Pedido del usuario (2026-10-26): el legacy mezclaba ahí cliente y línea
 * (`BSN Basketball`), y los Dashboards de Looker leen esa columna. Las tablas
 * del ERP NO cambian — esto es solo el texto que viaja a la hoja.
 *
 * - El estilo queda fuera a propósito hasta que la reposición tenga el detalle
 *   por prenda: una OP de uniforme mezcla Jersey y Short, y para una reposición
 *   (que hoy es de toda la orden) no se sabría cuál.
 * - Sin subcliente se usa el nombre del cliente (son la gran mayoría).
 * - Si se mezclan valores (35 de ~6,200 OP tienen dos deportes) van distintos,
 *   ordenados y unidos con "/": `BSN SPORTS - Basketball/Volleyball`.
 * - Sin deporte, solo el subcliente o cliente; sin productos, solo el cliente.
 *
 * ⚠️ Las filas que ya estaban en la hoja dicen solo el cliente: un gráfico de
 * Looker que agrupe por CLIENTE verá las dos formas como valores distintos.
 */
export interface ProductoClienteSheets {
  subcliente?: string | null;
  deporte?: string | null;
}

function unir(valores: (string | null | undefined)[]): string {
  const limpios = valores.map((v) => v?.trim()).filter((v): v is string => !!v);
  return [...new Set(limpios)]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .join('/');
}

export function textoClienteSheets(
  cliente: string | null | undefined,
  productos: ProductoClienteSheets[],
): string {
  const nombreCliente = cliente?.trim() ?? '';
  if (productos.length === 0) return nombreCliente;
  const quien = unir(
    productos.map((p) => p.subcliente?.trim() || nombreCliente),
  );
  const deporte = unir(productos.map((p) => p.deporte));
  if (!deporte) return quien;
  return quien ? `${quien} - ${deporte}` : deporte;
}

/**
 * El mismo texto para lo que es de la ORDEN entera (una reposición, el papel
 * en blanco): se arma con los productos de todos sus ítems. Una sola consulta.
 */
export async function textoClienteSheetsDeOrden(
  prisma: PrismaService,
  idOrdenProduccion: number,
): Promise<string> {
  const orden = await prisma.ordenProduccion.findUnique({
    where: { idOrdenProduccion },
    select: {
      cliente: { select: { nombre: true } },
      lineasProduccion: {
        select: {
          producto: {
            select: { deporte: true, subcliente: { select: { nombre: true } } },
          },
        },
      },
    },
  });
  if (!orden) return '';
  return textoClienteSheets(
    orden.cliente?.nombre,
    orden.lineasProduccion.map((l) => ({
      subcliente: l.producto.subcliente?.nombre,
      deporte: l.producto.deporte,
    })),
  );
}
