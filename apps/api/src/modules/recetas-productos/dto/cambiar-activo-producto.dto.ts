import { IsBoolean } from 'class-validator';

export class CambiarActivoProductoDto {
  @IsBoolean()
  activo!: boolean;
}
