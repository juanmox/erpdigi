import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CrearEmpresaDto {
  @IsString()
  @MinLength(1)
  codigo!: string;

  @IsString()
  @MinLength(1)
  razonSocial!: string;

  @IsOptional()
  @IsString()
  nombreComercial?: string;

  @IsOptional()
  @IsString()
  nit?: string;

  @Type(() => Number)
  @IsInt()
  idMonedaBase!: number;
}
