import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Saca de circulación un RANGO de rollos de una factura, o lo revierte.
 *
 * Va por rango y no de a uno porque el caso real son bloques seguidos: una
 * factura de 40 rollos de la que los primeros 20 se gastaron en el WebApp
 * legacy antes de que existiera Costeo. Marcarlos uno por uno serían 20 clics.
 */
export class MarcarConsumidoFueraDto {
  @Type(() => Number)
  @IsInt()
  idFacturaPapel!: number;

  /** Primera secuencia del rango, inclusive. */
  @Type(() => Number)
  @IsInt()
  desde!: number;

  /** Última secuencia del rango, inclusive. */
  @Type(() => Number)
  @IsInt()
  hasta!: number;

  /**
   * `false` revierte: los devuelve a EN_BODEGA y limpia el motivo. Se permite
   * con el mismo permiso, para que marcar de más no sea irreversible.
   */
  @IsOptional()
  @IsBoolean()
  marcar?: boolean;

  /**
   * Obligatorio al marcar (la base además lo exige). Dentro de un año, "se
   * consumieron en el Google Sheets antes de arrancar el ERP" explica lo que
   * de otro modo parece un error de carga.
   */
  @IsOptional()
  @IsString()
  @MinLength(3)
  motivo?: string;
}
