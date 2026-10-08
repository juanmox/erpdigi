import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  MENSAJE_USERNAME_INVALIDO,
  PATRON_USERNAME,
} from '../../../common/username';

export class EditarUsuarioDto {
  @IsOptional()
  @Matches(PATRON_USERNAME, { message: MENSAJE_USERNAME_INVALIDO })
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nombreCompleto?: string;

  /**
   * Minutos sin actividad antes de cerrar la sesión de ESTE usuario. `null`
   * vuelve a lo que diga su rol; `0` = nunca cerrar.
   *
   * El rango lo impone también un CHECK en la base: el tope de 1440 evita que
   * un typo (1500 en vez de 15) desactive el control sin que nadie lo note.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  minutosInactividad?: number | null;
}
