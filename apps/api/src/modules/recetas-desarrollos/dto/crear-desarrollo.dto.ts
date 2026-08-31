import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CrearDesarrolloDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codigo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(250)
  descripcion!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idCliente?: number | null;

  /// Talla con la que se calculó el consumo del prototipo (referencia).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idTallaBase?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minutosMo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoMoMinuto?: number;

  @IsOptional()
  @IsString()
  notas?: string | null;
}
