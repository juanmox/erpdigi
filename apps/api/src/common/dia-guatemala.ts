/**
 * Días calendario de Guatemala, anclados a UTC-6.
 *
 * ⚠️ `new Date('2026-10-09')` es medianoche **UTC**, o sea las 18:00 del día
 * anterior acá. El reporte de consumo se rompió exactamente así: el rango
 * arrancaba 6 horas antes de tiempo y —peor— un límite superior inclusivo se
 * comía casi todo el último día, de modo que un cierre de mes dejaba fuera lo
 * impreso la tarde del 30 sin ningún síntoma. Medido entonces: pedir el 29/09
 * devolvía 0 de 9 filas.
 *
 * Guatemala es UTC-6 fijo y **sin horario de verano** (se abolió), así que el
 * desfase es constante y un día calendario se puede anclar exacto. Si alguna
 * vez volviera el DST, esto hay que rehacerlo con una librería de zonas.
 *
 * Vive acá y no repetido en cada módulo porque ya estaba en tres lugares
 * (reporte de consumo, bitácora, inventario de rollos) y son interpretaciones
 * que NO pueden divergir: dos pantallas que lean "el mismo día" distinto dan
 * números distintos para la misma pregunta.
 */

/** Instante en que empieza ese día calendario (`aaaa-mm-dd`) en Guatemala. */
export function inicioDelDiaGT(dia: string): Date {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 6, 0, 0));
}

/** Instante en que empieza el día SIGUIENTE a ese día calendario. */
export function inicioDelDiaSiguienteGT(dia: string): Date {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1, 6, 0, 0));
}

/**
 * Filtro de Prisma para un rango de días calendario, listo para un campo
 * `timestamptz`. `undefined` cuando no se pidió ninguno de los dos extremos.
 *
 * El límite superior es **exclusivo sobre el día siguiente** (`lt`, no `lte`
 * sobre el día pedido): así abarca el día entero sin depender de la precisión
 * del timestamp.
 */
export function rangoDeDiasGT(
  desde?: string,
  hasta?: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!desde && !hasta) return undefined;
  return {
    ...(desde ? { gte: inicioDelDiaGT(desde) } : {}),
    ...(hasta ? { lt: inicioDelDiaSiguienteGT(hasta) } : {}),
  };
}
