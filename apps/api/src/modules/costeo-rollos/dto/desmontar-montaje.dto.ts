import { IsIn } from 'class-validator';

// El estado final lo elige explícitamente quien desmonta (no se infiere de las
// yardas restantes) — no hay una regla de negocio confirmada de "cuánto es muy
// poco para regresar a bodega", así que evitamos inventarla en el backend.
const ESTADOS_FINALES_ROLLO = ['EN_BODEGA', 'AGOTADO', 'DESCARTADO'] as const;
export type EstadoFinalRollo = (typeof ESTADOS_FINALES_ROLLO)[number];

/**
 * ⚠️ `yardasFinales` YA NO SE RECIBE: lo calcula el servidor.
 *
 * Hasta 2026-10-06 era un campo obligatorio, la "lectura física" del rollo al
 * desmontar, y de su diferencia contra lo calculado salía la merma. El usuario
 * confirmó que en planta **no se mide: se estima a ojo por el diámetro**, así
 * que pedir un número con cuatro decimales era falsa precisión y la merma
 * terminaba midiendo, en buena parte, el pulso de quien estimaba.
 *
 * Decisión suya: el servidor registra el restante que ya calculó y la merma se
 * retira de la pantalla, en vez de mostrar un cero permanente que parece un
 * dato. Si algún día hay un instrumento de medición real, esto se revierte
 * devolviendo el campo acá — la columna `yardas_finales` sigue existiendo.
 */
export class DesmontarMontajeDto {
  @IsIn(ESTADOS_FINALES_ROLLO)
  estado!: EstadoFinalRollo;
}
