import type { Prisma } from '@prisma/client';

/** Convierte un Decimal de Prisma (o null/undefined) a number plano para la respuesta JSON. */
export function numify(
  valor: Prisma.Decimal | number | null | undefined,
): number | null {
  if (valor === null || valor === undefined) return null;
  return typeof valor === 'number' ? valor : valor.toNumber();
}

export function round(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}
