import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export class ListarRollosDto {
  @IsOptional()
  @IsIn(['EN_BODEGA', 'MONTADO', 'AGOTADO', 'DESCARTADO'])
  estado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idTipoPapel?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idFacturaPapel?: number;
}
