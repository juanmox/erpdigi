/**
 * Factor de enguiamiento del legacy (columna K de la hoja "Datos":
 * `cantidad * 0.084375`). Es el DEFAULT para prendas: cada línea puede traer el
 * suyo en `factorEnguiamiento`, como pide la corrección #2 de §6.2 — el valor
 * no debe quedar incrustado en el código.
 *
 * Medido contra las 1,128 líneas reales de DataDisev3: el `ENGUIAMIENTO` que
 * Diseño teclea por línea es esta misma fórmula redondeada a un decimal (81.5%
 * techo, 16.5% redondeo, desviación media +0.0209 yd). Por eso se calcula y no
 * se lee: el valor capturado sirve como contraste, no como fuente.
 */
export const FACTOR_ENGUIAMIENTO_DEFAULT = 0.084375;

/**
 * "Talla" de los servicios de sublimación continua: no hay prendas, la cantidad
 * son las YARDAS a sublimar. El legacy ya la trataba como una columna más
 * (`YARDAS`, y `YDS` desde 2025) con el consumo estándar de `Item + "YARDAS"`.
 */
export const TALLA_YARDAS = 'YARDAS';

/**
 * Enguiamiento de un servicio por yardas: 3 % de las yardas, redondeado HACIA
 * ARRIBA, con mínimo de 1 yd.
 *
 * Medido contra las 2,490 filas reales de la hoja "Datos" (julio 2024 a
 * septiembre 2026): esta regla coincide en 2,486 (99.8 %). Las otras 4 son tres
 * filas del 12/06/2025 que pasaron por la fórmula genérica de arriba y una
 * suelta. NO es un porcentaje plano: el 3.2 % que da la mediana es solo el
 * efecto del redondeo y del mínimo, y probar 2.5/3.25/3.5/4 % con techo o
 * redondeo normal calza apenas entre 74 % y 89 %.
 *
 * El Código.gs de la Forma 2 aplicaba `cantidad * 0.084375` a TODAS las
 * columnas, `YARDAS` incluida, pero esos valores no salieron de ahí: 197 yd
 * cobrarían 16.6 yd de enguiamiento contra los ~6 que cobraba el legacy.
 */
const PORCENTAJE_ENGUIAMIENTO_YARDAS = 0.03;

/**
 * Enguiamiento (yd) de una talla de una línea. `factor` es el de la línea y solo
 * rige para prendas.
 */
export function enguiamientoYd(
  talla: string,
  cantidad: number,
  factor: number,
): number {
  if (talla === TALLA_YARDAS)
    // La tolerancia evita que un producto exacto (100 × 0.03 = 3.0000000000000004)
    // suba una yarda por error de punto flotante.
    return Math.max(
      1,
      Math.ceil(cantidad * PORCENTAJE_ENGUIAMIENTO_YARDAS - 1e-9),
    );
  return +(cantidad * factor).toFixed(4);
}
