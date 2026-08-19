import { IsBoolean } from 'class-validator';

export class EditarLineaProduccionDto {
  @IsBoolean()
  consumoEnBlanco!: boolean;
}
