import { PrismaService } from '../prisma/prisma.service';

/**
 * Líneas de servicio (talla YARDAS) enviadas A MEDIAS: tienen al menos un
 * consumo vigente pero todavía les faltan yardas por enviar.
 *
 * Existe porque "pendiente" se decidía por "no tiene ningún consumo", y con
 * envíos por tandas (un servicio que no cabe en un solo rollo) una línea con
 * 1,100 de 1,500 yd enviadas desaparecería de la cola y se vería como impresa.
 * Las tres pantallas que preguntan "¿qué falta imprimir?" —la cola de Impresión
 * de OPs, el listado de Órdenes y la vista `analitica.v_ordenes`— tienen que
 * usar el mismo criterio, o dan respuestas distintas a la misma pregunta.
 *
 * Devuelve solo las parciales: de ellas salen `pedido` y `enviado`, y el resto
 * de las líneas sigue decidiéndose como siempre.
 */
export async function parcialesDeServicio(
  prisma: Pick<PrismaService, '$queryRaw'>,
  idEmpresa: number,
): Promise<Map<number, { pedido: number; enviado: number }>> {
  const filas = await prisma.$queryRaw<
    { id: number; pedido: number; enviado: number }[]
  >`
    SELECT l.id_linea_produccion AS id,
           lt.cantidad::int AS pedido,
           COALESCE(SUM(c.cantidad), 0)::int AS enviado
    FROM costeo.linea_produccion l
    JOIN costeo.linea_produccion_talla lt
      ON lt.id_linea_produccion = l.id_linea_produccion
    JOIN recetas.tallas t
      ON t.id_talla = lt.id_talla AND t.nombre = 'YARDAS'
    LEFT JOIN costeo.consumo_papel c
      ON c.id_linea_produccion = l.id_linea_produccion
     AND c.id_talla = lt.id_talla
     AND c.origen = 'PRODUCCION'
     AND c.anulado_en IS NULL
    WHERE l.id_empresa = ${idEmpresa}
    GROUP BY l.id_linea_produccion, lt.cantidad
    HAVING COALESCE(SUM(c.cantidad), 0) > 0
       AND COALESCE(SUM(c.cantidad), 0) < lt.cantidad
  `;
  return new Map(
    filas.map((f) => [
      Number(f.id),
      { pedido: Number(f.pedido), enviado: Number(f.enviado) },
    ]),
  );
}
