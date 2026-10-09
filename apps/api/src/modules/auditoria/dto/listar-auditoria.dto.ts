import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

/** `yyyy-mm-dd`: un día calendario, no un instante. */
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export class ListarAuditoriaDto {
  @IsOptional()
  @IsString()
  entidad?: string;

  @IsOptional()
  @IsIn(['CREATE', 'UPDATE', 'DELETE', 'LOGIN'])
  accion?: string;

  /** Parte del nombre: se busca por texto, sin distinguir mayúsculas. */
  @IsOptional()
  @IsString()
  usuario?: string;

  @IsOptional()
  @Matches(DIA, { message: 'desde debe tener el formato aaaa-mm-dd' })
  desde?: string;

  @IsOptional()
  @Matches(DIA, { message: 'hasta debe tener el formato aaaa-mm-dd' })
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  porPagina?: number;
}
