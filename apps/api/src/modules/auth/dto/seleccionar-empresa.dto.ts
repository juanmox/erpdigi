import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class SeleccionarEmpresaDto {
  @Type(() => Number)
  @IsInt()
  idEmpresa!: number;
}
