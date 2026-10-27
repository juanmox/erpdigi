import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const TIPOS_REPOSICION = ['REIMPRESION', 'MATERIALES'] as const;
export type TipoReposicion = (typeof TIPOS_REPOSICION)[number];

/** Una línea de material de una reposición tipo MATERIALES. */
export class MaterialReposicionDto {
  @Type(() => Number)
  @IsInt()
  idInsumo!: number;

  /**
   * En la unidad del insumo, que se lee del catálogo y NO se manda: de los 443
   * materiales, 248 están en UNIDAD y 195 en YARDAS.
   */
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  cantidad!: number;
}

/**
 * Una PRENDA repuesta: producto + talla + pieza + cuántas ("de la talla L del
 * producto X, 3 mangas"). Una reposición puede
 * cubrir varias (el comentario legacy decía cosas como "M= 1 BK  XL= 1 FT").
 *
 * El servidor verifica que el producto y la talla existan en los ÍTEMS de la
 * orden: no se acepta cualquier combinación del catálogo.
 */
export class PrendaReposicionDto {
  @Type(() => Number)
  @IsInt()
  idProducto!: number;

  @Type(() => Number)
  @IsInt()
  idTalla!: number;

  /** Del catálogo de piezas (costeo.pieza); "PRENDA COMPLETA" es una de ellas. */
  @Type(() => Number)
  @IsInt()
  idPieza!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad!: number;
}

export class CrearReposicionDto {
  @IsDateString()
  fecha!: string;

  // Formato "26OP014154" — se resuelve en el servidor contra el maestro
  // (§6.1 corrección #3: "validar la OP contra el maestro, si no existe
  // mostrar error claro, no crear basura").
  @IsString()
  @MinLength(1)
  codigoOp!: string;

  /**
   * REIMPRESION (papel + tela) o MATERIALES (N insumos). Son EXCLUYENTES.
   *
   * ⚠️ El tipo decide qué se exige, pero las reglas se verifican contra lo que
   * de verdad llegó, no contra este campo: si el servicio confiara en él, un
   * cliente podría saltarse la validación mandando el tipo que le conviene.
   * Por defecto REIMPRESION, que es lo que eran las 3,623 existentes.
   */
  @IsOptional()
  @IsIn(TIPOS_REPOSICION)
  tipo?: TipoReposicion;

  @Type(() => Number)
  @IsInt()
  idDepartamento!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idEmpleado?: number;

  @Type(() => Number)
  @IsInt()
  idDefecto!: number;

  @IsOptional()
  @IsString()
  bodegaSac?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yardasPapel?: number;

  // Si se envía, el tipo de papel NO se acepta del cliente — se deriva del
  // rollo montado en esa impresora en ese momento (§6.1 corrección #2).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idImpresora?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idCalandra?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idInsumoTela?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yardasTela?: number;

  /**
   * Las líneas de una reposición MATERIALES. El tope de 50 es defensivo: una
   * requisición real lleva unas pocas, y sin límite un POST armado a mano
   * podría mandar miles dentro de una sola transacción.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MaterialReposicionDto)
  materiales?: MaterialReposicionDto[];

  /**
   * Las prendas que cubre la reposición. Obligatorias cuando la orden tiene
   * ítems cargados (lo verifica el servicio, que es quien conoce la orden);
   * una orden sin ítems —las migradas del legacy— se registra sin prendas.
   * Aplica a REIMPRESION y a MATERIALES. Tope de 50, mismo criterio defensivo
   * que `materiales`.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PrendaReposicionDto)
  prendas?: PrendaReposicionDto[];

  @IsOptional()
  @IsString()
  comentario?: string;
}
