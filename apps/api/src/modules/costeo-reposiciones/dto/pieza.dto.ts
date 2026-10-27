import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CrearPiezaDto {
  @IsString()
  @MaxLength(200)
  nombre!: string;
}

export class EditarPiezaDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
