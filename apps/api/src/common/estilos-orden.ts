import { PrismaService } from '../prisma/prisma.service';

/**
 * Los estilos (Jersey, Short…) de una OP, sacados de los PRODUCTOS de sus
 * líneas — el estilo es del producto desde el 2026-10-23, no de la orden.
 *
 * Es una LISTA: una OP de uniforme mezcla Jersey y Short. Si ninguno de sus
 * productos tiene estilo cargado todavía, cae al que algunas OP viejas
 * (~1,800) traen guardado en la propia orden, que es histórico.
 *
 * Para las pantallas que ya cargan la orden sin sus líneas (Reposiciones,
 * Impresión de OPs). El módulo de Órdenes lo deriva en memoria porque ya trae
 * las líneas con sus productos.
 */
export async function estilosDeOrden(
  prisma: PrismaService,
  idOrdenProduccion: number,
  historico?: string | null,
): Promise<string[]> {
  const estilos = await prisma.estilo.findMany({
    where: {
      productos: {
        some: {
          lineasProduccionCosteo: { some: { idOrdenProduccion } },
        },
      },
    },
    select: { nombre: true },
    orderBy: { nombre: 'asc' },
  });
  if (estilos.length > 0) return estilos.map((e) => e.nombre);
  return historico ? [historico] : [];
}
