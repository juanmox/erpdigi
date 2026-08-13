import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearLineaProductoDto {
  @Type(() => Number)
  @IsInt()
  idCliente!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nombre!: string;
}
