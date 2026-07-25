import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';

class ItemResumenDto {
  @IsString()
  codigo!: string;

  @IsNumber()
  cantidad!: number;
}

export class ResumenMaterialDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemResumenDto)
  items!: ItemResumenDto[];
}
