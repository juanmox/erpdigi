import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CrearReposicionDto {
  @IsDateString()
  fecha!: string;

  // Formato "26OP014154" — se resuelve en el servidor contra el maestro
  // (§6.1 corrección #3: "validar la OP contra el maestro, si no existe
  // mostrar error claro, no crear basura").
  @IsString()
  @MinLength(1)
  codigoOp!: string;

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

  @IsOptional()
  @IsString()
  comentario?: string;
}
