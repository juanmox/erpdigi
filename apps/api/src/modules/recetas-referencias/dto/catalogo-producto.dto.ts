import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Alta de un valor en uno de los catálogos de atributos del producto. */
export class CrearCatalogoProductoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;
}

/**
 * Renombrar o retirar. Un valor se RETIRA (`activo: false`), no se borra: la
 * FK desde productos es RESTRICT, así que uno en uso no se podría borrar de
 * todos modos, y retirarlo lo saca de los selectores sin tocar los productos.
 */
export class EditarCatalogoProductoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
