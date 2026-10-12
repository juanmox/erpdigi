import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class EditarRolloIngresoDto {
  @Type(() => Number)
  @IsInt()
  idRolloPapel!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yardasIniciales?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoUnitario?: number;
}

export class EditarIngresoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  numeroFactura?: string;

  /**
   * El tipo de papel es del ARTÍCULO (la fila de `factura_papel`), no de cada
   * rollo: todos los rollos de un artículo son del mismo papel. Cambiarlo
   * re-tipa a todos.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idTipoPapel?: number;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EditarRolloIngresoDto)
  rollos!: EditarRolloIngresoDto[];
}
