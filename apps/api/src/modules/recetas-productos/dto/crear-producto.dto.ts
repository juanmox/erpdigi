import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CrearProductoDto {
  @IsString()
  @MinLength(1)
  codigo!: string;

  @IsString()
  @MinLength(1)
  descripcion!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idCliente?: number | null;

  /** Marca o división del cliente (ver recetas.subclientes). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idSubcliente?: number | null;

  @IsOptional()
  @IsString()
  desarrollo?: string | null;

  @IsOptional()
  @IsString()
  patron?: string | null;

  @IsOptional()
  @IsString()
  tamano?: string | null;

  @IsOptional()
  @IsString()
  deporte?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioVenta?: number;

  // minutosMo / costoMoMinuto se quitaron del alta de productos (2026-08-26):
  // la mano de obra vive en el desarrollo, que es dueño de la receta.
}
