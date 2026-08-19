import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsISO8601,
} from 'class-validator';

export class CrearConsumoEstandarDto {
  @Type(() => Number)
  @IsInt()
  idProducto!: number;

  @Type(() => Number)
  @IsInt()
  idTalla!: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  pulgadasPapel!: number;

  // Opcional: en blanco = hoy (ver CLAUDE.md, decisión del usuario — el
  // legacy "Consumos" no trae fecha, no se debe inventar una fecha pasada).
  @IsOptional()
  @IsISO8601()
  vigenteDesde?: string;

  @IsOptional()
  @IsISO8601()
  vigenteHasta?: string;
}
