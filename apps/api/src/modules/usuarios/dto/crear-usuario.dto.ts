import { IsEmail, IsString, MinLength } from 'class-validator';

export class CrearUsuarioDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password!: string;

  @IsString()
  @MinLength(1)
  nombreCompleto!: string;
}
