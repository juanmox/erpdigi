import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** `aaaa-mm-dd`: un día calendario, no un instante. */
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export class ListarIngresosDto {
  /** Parte del número de factura; se busca por texto, sin distinguir mayúsculas. */
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @Matches(DIA, { message: 'desde debe tener el formato aaaa-mm-dd' })
  desde?: string;

  @IsOptional()
  @Matches(DIA, { message: 'hasta debe tener el formato aaaa-mm-dd' })
  hasta?: string;

  /**
   * Tope de ARTÍCULOS (filas de `factura_papel`), no de números de factura: es
   * lo que se consulta. El default alcanza de sobra para "qué cargué hoy", que
   * es la pregunta de la pantalla; el filtro de texto y el de fechas están para
   * ir más atrás.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limite?: number;
}
