import { Type } from 'class-transformer';
import { IsIn, IsNumber, Min } from 'class-validator';

// El estado final lo elige explícitamente quien desmonta (no se infiere de las
// yardas restantes) — no hay una regla de negocio confirmada de "cuánto es muy
// poco para regresar a bodega", así que evitamos inventarla en el backend.
const ESTADOS_FINALES_ROLLO = ['EN_BODEGA', 'AGOTADO', 'DESCARTADO'] as const;
export type EstadoFinalRollo = (typeof ESTADOS_FINALES_ROLLO)[number];

export class DesmontarMontajeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yardasFinales!: number;

  @IsIn(ESTADOS_FINALES_ROLLO)
  estado!: EstadoFinalRollo;
}
