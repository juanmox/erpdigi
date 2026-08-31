import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// No se hereda de CrearDesarrolloDto con PartialType a propósito: `codigo` no
// es editable (es la clave por la que lo referencia productos.desarrollo, y
// como NO hay FK que haga CASCADE, renombrarlo dejaría al producto colgando).
// Además, un PartialType acá reintroduciría el bug de productos.editar(), donde
// omitir un campo lo pone en NULL en vez de dejarlo como está.
export class EditarDesarrolloDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  descripcion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idCliente?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idTallaBase?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minutosMo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costoMoMinuto?: number;

  @IsOptional()
  @IsString()
  notas?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
