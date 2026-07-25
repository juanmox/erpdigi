import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, ValidateNested } from 'class-validator';

class CambioPrecioDto {
  @IsInt()
  idInsumo!: number;

  @IsNumber()
  costoPromedio!: number;
}

export class GuardarPreciosDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CambioPrecioDto)
  cambios!: CambioPrecioDto[];
}
