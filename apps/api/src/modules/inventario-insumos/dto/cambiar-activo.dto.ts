import { IsBoolean } from 'class-validator';

export class CambiarActivoDto {
  @IsBoolean()
  activo!: boolean;
}
