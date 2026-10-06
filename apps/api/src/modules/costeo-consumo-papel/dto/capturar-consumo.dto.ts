import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
} from 'class-validator';

export class CapturarConsumoDto {
  /**
   * Una o varias líneas. Se acepta un arreglo aunque casi siempre venga con un
   * solo elemento, para que el envío masivo no necesite un endpoint aparte que
   * duplique la misma lógica.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  idsLineaProduccion!: number[];

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

  /**
   * Impresoras que otro operario viene usando y sobre las que se confirma
   * enviar igual (tope por impresora). Es una LISTA explícita y no un booleano
   * a propósito: un "sí, mandá todo" confirmaría a ciegas máquinas que el
   * operario no vio en el aviso. El servidor valida exactamente éstas.
   *
   * Cada envío así queda registrado en `consumo_papel.impresora_ocupada_por`.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  idsImpresoraAjenaConfirmadas?: number[];

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
