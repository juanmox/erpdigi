import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TallaCantidadDto {
  @Type(() => Number)
  @IsInt()
  idTalla!: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  cantidad!: number;
}

/**
 * Edición de un ítem (línea) de una OP ya cargada — gateado
 * `costeo.orden.editar`.
 *
 * `producto` y `tallas` SOLO se pueden tocar si la línea todavía no se envió
 * a impresión (el servicio lo revalida, no solo la pantalla): el consumo de
 * papel ya registrado se calculó con el producto y las cantidades de ese
 * momento, y cambiarlos después los dejaría contradiciéndose en silencio.
 * `tallas` llega como el conjunto COMPLETO — reemplaza al anterior, no es un
 * delta.
 *
 * El Item (`codigoLine`) no se edita acá: lo gobierna la orden de compra de
 * la OP (ver EditarOrdenProduccionDto).
 */
export class EditarLineaProduccionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idProducto?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TallaCantidadDto)
  tallas?: TallaCantidadDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idImpresora?: number | null;

  @IsOptional()
  @IsDateString()
  fechaData?: string | null;

  @IsOptional()
  @IsDateString()
  fechaCliente?: string | null;

  @IsOptional()
  @IsDateString()
  fechaEntregar?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  estatus?: string;

  @IsOptional()
  @IsString()
  prioridad?: string | null;
}
