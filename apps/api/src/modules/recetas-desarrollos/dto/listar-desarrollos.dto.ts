import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/// Operadores de comparación numérica de los filtros. Van como palabra y no
/// como símbolo (`>=`) para no depender de cómo viaje en la URL.
export const OPERADORES_COMPARACION = ['eq', 'ne', 'gte', 'lte'] as const;
export type OperadorComparacion = (typeof OPERADORES_COMPARACION)[number];

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

  /// Talla base del desarrollo.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idTallaBase?: number;

  /// Solo los que todavía no están asignados a ningún producto — es lo que
  /// necesita el selector de Desarrollo al dar de alta un producto.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  sinProducto?: boolean;

  /// Variante de tres estados de `sinProducto`, para la pantalla de filtros.
  @IsOptional()
  @IsIn(['con', 'sin'])
  producto?: 'con' | 'sin';

  /// Número de insumos de la receta, comparado con `insumosN`. Sin `insumosN`
  /// se ignora: un operador sin valor no filtra nada.
  @IsOptional()
  @IsIn(OPERADORES_COMPARACION)
  insumosOp?: OperadorComparacion;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  insumosN?: number;

  /// Costo unitario (GTQ) comparado con `costoN`.
  @IsOptional()
  @IsIn(OPERADORES_COMPARACION)
  costoOp?: OperadorComparacion;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoN?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluirInactivos?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
