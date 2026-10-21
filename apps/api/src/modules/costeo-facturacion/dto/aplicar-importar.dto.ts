import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Fila del "aplicar" del import de OP → OF.
 *
 * CLASE, no la interfaz `FilaPreviewOfOp` que devuelve el preview — una
 * interfaz se borra al compilar y el `ValidationPipe` global no validaría
 * nada del cuerpo (hallazgo de code review del 2026-08-31 en Consumo
 * Estándar, mismo riesgo acá).
 *
 * Solo se aceptan los campos CRUDOS del archivo. Nada de lo que el preview
 * resolvió (`codigoOp`, `clienteOp`, `estado`...) se recibe de vuelta: el
 * preview corre en el servidor pero su salida pasa por el navegador, así que
 * confiar en esos campos permitiría asignar una OP a una OF con un preview
 * viejo, o armar un POST a mano que salte las reglas. El servicio los
 * vuelve a resolver, dentro de la transacción, contra el estado actual.
 */
export class FilaAplicarOfOpDto {
  @Type(() => Number)
  @IsInt()
  fila!: number;

  @IsString()
  @MinLength(1)
  opTexto!: string;

  @IsString()
  @MinLength(1)
  ofTexto!: string;

  @IsString()
  @MinLength(1)
  fechaOfTexto!: string;

  @IsOptional()
  @IsString()
  numeroFacturaTexto?: string;

  @IsOptional()
  @IsString()
  fechaFacturaTexto?: string;
}

export class AplicarImportarOfDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FilaAplicarOfOpDto)
  filas!: FilaAplicarOfOpDto[];
}
