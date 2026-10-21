import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Asigna, corrige o quita la factura de una OF.
 *
 * Los dos campos van juntos o ninguno (mismo CHECK que en la base,
 * `ck_orden_facturacion_factura`): mandar solo uno es un 400 explícito en
 * el servicio, no un estado a medias silencioso. Mandar los dos vacíos/omitidos
 * quita la factura — útil si se tecleó mal y hay que empezar de nuevo.
 */
export class AsignarFacturaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  numeroFactura?: string | null;

  @IsOptional()
  @IsDateString()
  fecha?: string | null;
}
