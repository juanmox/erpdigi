import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Edición del encabezado de una OP ya cargada — gateado `costeo.orden.editar`
 * (solo ADMIN/ADMIN_IT_COSTEO).
 *
 * `undefined` deja el campo como está (mismo criterio que EditarProductoDto);
 * `idLineaProducto` acepta `null` para quitarla (es opcional de verdad). El
 * código de OP, el estatus y el papel en blanco NO se editan acá: el código
 * no se corrige (se elimina y se reimporta) y el papel en blanco sigue
 * viviendo en Impresión de OPs.
 */
export class EditarOrdenProduccionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idCliente?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idLineaProducto?: number | null;

  // El Item de cada línea se deriva de esta columna (`<OC>-n`), así que
  // cambiarla renombra los Item — ver costeo-ordenes.service.ts. Por eso es
  // obligatoria si se manda (no se puede dejar vacía) pero el servicio además
  // la rechaza si alguna línea ya se envió a impresión.
  @IsOptional()
  @IsString()
  @MinLength(1)
  ordenCompra?: string;

  @IsOptional()
  @IsDateString()
  fechaRecibido?: string | null;

  @IsOptional()
  @IsDateString()
  fechaCompromiso?: string | null;
}
