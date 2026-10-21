import { IsDateString } from 'class-validator';

/** Corrige la fecha de la OF (no la de la factura — ver AsignarFacturaDto). */
export class EditarOrdenFacturacionDto {
  @IsDateString()
  fecha!: string;
}
