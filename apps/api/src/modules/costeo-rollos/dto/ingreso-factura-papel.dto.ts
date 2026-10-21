import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class IngresoFacturaPapelDto {
  @IsString()
  @MinLength(1)
  numeroFactura!: string;

  @IsDateString()
  fecha!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  totalRollos!: number;

  @Type(() => Number)
  @IsInt()
  idTipoPapel!: number;

  /**
   * Donde queda parado fisicamente el lote entero al ingresar. Obligatorio
   * desde que existe esta columna (ver migracion 20261020120000): los 235
   * rollos previos quedaron sin clasificar y se asignan aparte, por rango,
   * con `AsignarUbicacionDto` -- no hay forma de inferirlo para ellos.
   */
  @Type(() => Number)
  @IsInt()
  idUbicacion!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  yardasPorRollo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
}
