import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Solo los campos que el servidor realmente usa. Lo demás del preview (el
 * nombre del tipo de papel, el error, el número de fila) llega y el
 * `whitelist: true` del ValidationPipe lo descarta: el preview corre en el
 * servidor pero su resultado viaja al navegador y vuelve, así que nada de lo
 * que trae puede darse por bueno — el tipo de papel se re-resuelve por código
 * y la factura se vuelve a chequear contra la base al aplicar.
 */
export class FilaAplicarIngresoRolloDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  numeroFactura!: string;

  @IsISO8601()
  fecha!: string;

  @IsString()
  @MinLength(1)
  tipoPapelCodigo!: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  cantidadRollos!: number;

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

export class AplicarImportarIngresosDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => FilaAplicarIngresoRolloDto)
  filas!: FilaAplicarIngresoRolloDto[];
}
