import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class AgregarLineaRecetaDto {
  @Type(() => Number)
  @IsInt()
  idInsumo!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  consumo!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idArea?: number | null;
}

export class EditarLineaRecetaDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  consumo!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idArea?: number | null;
}
