import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class ItemCotizacionDto {
  @IsString()
  codigo!: string;

  @IsNumber()
  cantidad!: number;
}

export class CrearCotizacionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemCotizacionDto)
  items!: ItemCotizacionDto[];

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsIn(['GTQ', 'USD'])
  moneda?: 'GTQ' | 'USD';
}
