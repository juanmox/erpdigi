import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
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
}
