import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class ListarProductosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cliente?: number;

  @IsOptional()
  @IsString()
  deporte?: string;

  @IsOptional()
  @IsString()
  talla?: string;

  @IsOptional()
  @IsString()
  patron?: string;

  @IsOptional()
  @IsString()
  desarrollo?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['activos', 'inactivos', 'todos'])
  estado?: 'activos' | 'inactivos' | 'todos';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
