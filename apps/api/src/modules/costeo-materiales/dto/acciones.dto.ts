import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Cambios sobre UN ítem. Todo opcional: solo se escribe lo que vino. */
export class EditarMaterialDto {
  @IsOptional()
  @Matches(DIA, { message: 'fechaPlanificador debe ser yyyy-mm-dd' })
  fechaPlanificador?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  ordenPlanificacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoOp?: string;

  /** Código del insumo; si cambia se vuelve a congelar el costo. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  codigoInsumo?: string;

  @IsOptional()
  @Type(() => Number)
  cantidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comentario?: string;

  /**
   * Obligatorio: queda en el historial del ítem junto con lo que cambió y quién
   * lo cambió. Dentro de un año, "¿por qué esta cantidad no es la del SAC?" solo
   * se responde si quedó escrito.
   */
  @IsString()
  @MinLength(3, { message: 'Escribí el motivo de la modificación' })
  @MaxLength(1000)
  motivo!: string;
}

export class AnularMaterialesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];

  /** Obligatorio: dentro de un año, "¿por qué no está este ítem?" solo se responde si quedó escrito. */
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  motivo!: string;
}

/**
 * Entrega por lote. Tres acciones sobre los mismos ids:
 *  - ENTREGAR: registra la salida y la fecha de entrega (propuesta: hoy).
 *  - CORREGIR_FECHA: cambia la fecha de entrega de lo ya entregado.
 *  - REVERTIR: devuelve a PENDIENTE y limpia salida y fecha de entrega.
 */
export class EntregaMaterialesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @Type(() => Number)
  @IsInt({ each: true })
  ids!: number[];

  @IsIn(['ENTREGAR', 'CORREGIR_FECHA', 'REVERTIR'])
  accion!: 'ENTREGAR' | 'CORREGIR_FECHA' | 'REVERTIR';

  /** Obligatoria al ENTREGAR: la salida ES la entrega. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  salidaSac?: string;

  @IsOptional()
  @Matches(DIA, { message: 'fechaEntrega debe ser yyyy-mm-dd' })
  fechaEntrega?: string;

  /**
   * Obligatorio al CORREGIR_FECHA y al REVERTIR (lo valida el servicio, porque
   * depende de la acción): son correcciones y quedan en el historial del ítem.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motivo?: string;
}
