import { TALLA_YARDAS } from './enguiamiento';

/**
 * Separa lo que son PRENDAS de lo que son YARDAS de servicio en las tallas de
 * una línea. En una orden de sublimación continua la cantidad de la talla
 * `YARDAS` son yardas a sublimar, no piezas: sumarlas juntas hace que 197 yd se
 * lean como 197 prendas.
 *
 * Es la misma regla que aplican las vistas `analitica.v_consumo` y
 * `v_ordenes` (migración 20261029120000): tienen que coincidir.
 */
export function separarCantidad(
  tallas: { talla: string; cantidad: number }[],
): { piezas: number; yardas: number } {
  let piezas = 0;
  let yardas = 0;
  for (const t of tallas) {
    if (t.talla === TALLA_YARDAS) yardas += t.cantidad;
    else piezas += t.cantidad;
  }
  return { piezas, yardas };
}
