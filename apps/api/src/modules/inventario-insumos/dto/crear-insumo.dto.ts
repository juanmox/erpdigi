import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CrearInsumoDto {
  @IsString()
  @MinLength(1)
  codigo!: string;

  @IsString()
  @MinLength(1)
  descripcion!: string;

  @Type(() => Number)
  @IsInt()
  idCategoria!: number;

  @Type(() => Number)
  @IsInt()
  idUnidad!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoPromedio?: number;
}
