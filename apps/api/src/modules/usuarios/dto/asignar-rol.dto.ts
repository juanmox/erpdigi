import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class AsignarRolDto {
  @Type(() => Number)
  @IsInt()
  idEmpresa!: number;

  @Type(() => Number)
  @IsInt()
  idRol!: number;
}
