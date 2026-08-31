import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Fila del "aplicar" del import de consumo estándar.
 *
 * Es una CLASE, no la interfaz `FilaPreviewConsumoEstandar` que devuelve el
 * preview: el controlador recibía esa interfaz y TypeScript la borra al
 * compilar, así que el `ValidationPipe` global no validaba absolutamente nada
 * del cuerpo (hallazgo de code review, 2026-08-31).
 *
 * Además solo se declaran los campos que el servidor de verdad usa. Los ids que
 * el preview calculó (`idProducto`, `idTalla`, `reemplazaId`, `corrigeId`) y su
 * `error` NO se aceptan a propósito: el preview corre en el navegador y vuelve,
 * así que confiarlos permitía editar la fila equivocada con un preview viejo, o
 * pisar el consumo de cualquier producto con un POST armado a mano. El servicio
 * los vuelve a resolver contra el estado actual de la base.
 */
export class FilaAplicarConsumoEstandarDto {
  @Type(() => Number)
  @IsInt()
  fila!: number;

  @IsString()
  @MinLength(1)
  productoCodigo!: string;

  @IsString()
  @MinLength(1)
  tallaNombre!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  pulgadasPapel!: number;

  /// ISO (YYYY-MM-DD). Vacío = hoy, igual que en el alta uno-por-uno.
  @IsOptional()
  @IsString()
  vigenteDesde?: string | null;

  @IsOptional()
  @IsString()
  vigenteHasta?: string | null;
}

export class AplicarImportarConsumoEstandarDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FilaAplicarConsumoEstandarDto)
  filas!: FilaAplicarConsumoEstandarDto[];
}
