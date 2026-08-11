import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class MontarRolloDto {
  @Type(() => Number)
  @IsInt()
  idImpresora!: number;
}
