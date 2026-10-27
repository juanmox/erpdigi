/** Una prenda repuesta con producto, talla y pieza ya resueltos a texto. */
export interface PrendaResumible {
  producto: string;
  talla: string;
  pieza?: string | null;
  cantidad: number;
}

/**
 * `BSN-FB01N M×1 MANGA IZQ, XL×2 CUELLO V · UA-FB02MJ L×3 PRENDA COMPLETA`,
 * agrupado por producto, para una sola celda. El equivalente del frontend es
 * `resumirPrendas()` en `apps/web/src/lib/prendas.ts`: si cambia uno, cambia el
 * otro.
 *
 * Vive acá (y no en el reporte) porque lo usan el reporte de consumo y el
 * espejo a Google Sheets: dos copias del mismo formato se desincronizan.
 */
export function resumirPrendas(prendas: PrendaResumible[]): string {
  const porProducto = new Map<string, string[]>();
  for (const p of prendas) {
    const partes = porProducto.get(p.producto) ?? [];
    partes.push(`${p.talla}×${p.cantidad}${p.pieza ? ` ${p.pieza}` : ''}`);
    porProducto.set(p.producto, partes);
  }
  return [...porProducto]
    .map(([producto, partes]) => `${producto} ${partes.join(', ')}`)
    .join(' · ');
}

/**
 * El texto de la columna COMENTARIO de la hoja "Registro" del legacy: el
 * comentario del ERP (si lo hay) y, a continuación, las piezas repuestas.
 *
 *   `Se rompió en el calandrado | Piezas: BSN-FB01N M×1 MANGA IZQ`
 *
 * Sin comentario va solo `Piezas: …`; sin prendas (las órdenes migradas del
 * legacy no tienen ítems) va solo el comentario, como hasta ahora.
 */
export function comentarioParaSheets(
  comentario: string | null | undefined,
  prendas: PrendaResumible[],
): string {
  const partes = [comentario?.trim() ?? ''];
  if (prendas.length > 0) partes.push(`Piezas: ${resumirPrendas(prendas)}`);
  return partes.filter((p) => p).join(' | ');
}
