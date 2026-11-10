import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Fila del "aplicar" del import de materiales.
 *
 * CLASE y no la interfaz del preview: una interfaz se borra al compilar y el
 * `ValidationPipe` no validaría nada. Solo se aceptan los campos CRUDOS del
 * archivo; todo lo que el preview resolvió (insumo, OP, costo, estado) se
 * vuelve a resolver en el servidor contra el estado actual, porque la salida
 * del preview pasa por el navegador y vuelve (convención #1).
 */
export class FilaAplicarMaterialDto {
  @Type(() => Number)
  @IsInt()
  fila!: number;

  @IsString()
  @MaxLength(60)
  fechaTexto!: string;

  @IsString()
  @MaxLength(60)
  planificadorTexto!: string;

  @IsString()
  @MaxLength(60)
  opTexto!: string;

  @IsString()
  @MaxLength(60)
  codigoTexto!: string;

  @IsString()
  @MaxLength(40)
  cantidadTexto!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  salidaTexto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comentarioTexto?: string;
}

export class AplicarImportarMaterialesDto {
  @IsArray()
  @ArrayNotEmpty()
  // Un archivo histórico puede traer miles de filas; el límite de cuerpo del
  // servidor (20 MB) es el que manda, esto solo frena un POST absurdo.
  @ArrayMaxSize(20000)
  @ValidateNested({ each: true })
  @Type(() => FilaAplicarMaterialDto)
  filas!: FilaAplicarMaterialDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombreArchivo?: string;
}
