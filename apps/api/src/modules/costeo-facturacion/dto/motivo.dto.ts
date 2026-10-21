import { IsString, MinLength } from 'class-validator';

/**
 * El motivo obligatorio al quitar una OP de una OF o al anular una OF
 * entera — mismo criterio que `MarcarConsumidoFueraDto`/reposiciones: dentro
 * de un año, el motivo es lo único que explica por qué ya no está.
 */
export class MotivoDto {
  @IsString()
  @MinLength(3)
  motivo!: string;
}
