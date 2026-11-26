import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CorteDto {
  /** `HH:MM`, hora de Guatemala. */
  @IsString()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora del corte va en formato HH:MM (00:00 a 23:59).',
  })
  hora!: string;

  /** ISO: 1 = lunes … 7 = domingo. */
  @IsArray()
  @ArrayMinSize(1, { message: 'El corte tiene que atender al menos un día.' })
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  dias!: number[];
}

/** El conjunto COMPLETO de cortes de la empresa. */
export class GuardarCortesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Tiene que quedar al menos un corte.' })
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => CorteDto)
  cortes!: CorteDto[];
}

export class SemaforoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  minutosVerde!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(1440)
  minutosAmarillo!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  minutosRecoger!: number;
}
