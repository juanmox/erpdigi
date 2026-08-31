import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class ListarDesarrollosDto {
  /// Búsqueda libre por código o descripción.
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['BORRADOR', 'APROBADO', 'todos'])
  estado?: 'BORRADOR' | 'APROBADO' | 'todos';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idCliente?: number;

  /// Solo los que todavía no están asignados a ningún producto — es lo que
  /// necesita el selector de Desarrollo al dar de alta un producto.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  sinProducto?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluirInactivos?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
