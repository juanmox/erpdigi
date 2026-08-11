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
