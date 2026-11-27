import { Type } from 'class-transformer';
import { IsInt, IsString, MinLength } from 'class-validator';

export class EditarInsumoDto {
  @IsString()
  @MinLength(1)
  descripcion!: string;

  @Type(() => Number)
  @IsInt()
  idCategoria!: number;

  @Type(() => Number)
  @IsInt()
  idUnidad!: number;
}
