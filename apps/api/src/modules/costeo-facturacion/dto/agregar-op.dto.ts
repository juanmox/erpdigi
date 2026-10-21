import { IsString, MinLength } from 'class-validator';

export class AgregarOpDto {
  @IsString()
  @MinLength(1)
  codigoOp!: string;
}
