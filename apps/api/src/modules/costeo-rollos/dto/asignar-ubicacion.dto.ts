import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

/**
 * Asigna la ubicación física de un RANGO de rollos de una factura. Mismo
 * patrón que `MarcarConsumidoFueraDto`: el caso real es clasificar en bloque
 * (los 235 rollos que ya existen, sin ubicación, se asignan por factura — no
 * uno por uno).
 *
 * A diferencia de "consumido fuera", esto no tiene restricciones de estado:
 * la ubicación es "dónde está parado ahora", no una corrección de captura, así
 * que se puede reasignar aunque el rollo ya se haya montado o agotado.
 */
export class AsignarUbicacionDto {
  @Type(() => Number)
  @IsInt()
  idFacturaPapel!: number;

  /** Primera secuencia del rango, inclusive. */
  @Type(() => Number)
  @IsInt()
  desde!: number;

  /** Última secuencia del rango, inclusive. */
  @Type(() => Number)
  @IsInt()
  hasta!: number;

  @Type(() => Number)
  @IsInt()
  idUbicacion!: number;
}
