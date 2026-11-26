import { OmitType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CrearReposicionDto } from './crear-reposicion.dto';

/**
 * Corrección de una reposición devuelta (o todavía sin validar). Mismos campos que
 * al crear salvo la OP: cambiar de orden es anular y crear otra.
 */
export class CorregirReposicionDto extends OmitType(CrearReposicionDto, [
  'codigoOp',
] as const) {
  /** Respuesta de quien corrige a la devolución: queda en la línea de tiempo. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nota?: string;
}

/** Tope por lote: un día pesado son ~200 reposiciones. */
const TOPE_LOTE = 300;

export class ValidarReposicionesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TOPE_LOTE)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];

  /** El paso que se valida (2..6). Se manda explícito para que un lote no avance
   *  por error reposiciones que estaban en otro paso. */
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(6)
  paso!: number;

  /** Solo paso 6: otra impresora (con rollo montado) si la original no lo tiene. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idImpresora?: number;
}

export class DevolverReposicionesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TOPE_LOTE)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(6)
  paso!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  motivo!: string;
}

export class ImprimirRequisicionesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TOPE_LOTE)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];
}

/** Bodega deja listas las requisiciones y avisa a quienes las pidieron (paso 8). */
export class PrepararRequisicionesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TOPE_LOTE)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];
}

export class EntregaItemDto {
  @Type(() => Number)
  @IsInt()
  idReposicion!: number;

  /** Número del talonario físico, opcional: por ahora conviven los dos. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroTalonario?: string;

  /** Quién recogió físicamente, opcional (texto libre). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  recibidoPor?: string;
}

/** El solicitante recogió: bodega marca la entrega (paso 9). */
export class EntregarRequisicionesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TOPE_LOTE)
  @ValidateNested({ each: true })
  @Type(() => EntregaItemDto)
  items!: EntregaItemDto[];
}

/** Autorizar de una vez lo que quedó esperando validación (modo sin validaciones). */
export class AutorizarDirectoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(TOPE_LOTE)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];
}

/** Prender o apagar el modo transitorio sin validaciones. */
export class ConfigurarReposicionesDto {
  @IsBoolean()
  sinValidacion!: boolean;
}
