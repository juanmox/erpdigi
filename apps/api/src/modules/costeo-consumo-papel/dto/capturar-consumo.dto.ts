import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CapturarConsumoDto {
  @Type(() => Number)
  @IsInt()
  idLineaProduccion!: number;

  /**
   * Solo si la línea no trae impresora, o se usó otra. NO se acepta el rollo ni
   * el tipo de papel: el servidor los resuelve con `fn_rollo_en(impresora,
   * fecha)`, igual que Reposiciones — el legacy los pedía a mano y por eso a
   * veces quedaban en "Buscando...".
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idImpresora?: number;

  /** Vacío = ahora. Importa porque decide QUÉ rollo estaba montado. */
  @IsOptional()
  @IsISO8601()
  fecha?: string;

  @IsOptional()
  @IsString()
  observacion?: string;
}

export class AnularConsumoDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
