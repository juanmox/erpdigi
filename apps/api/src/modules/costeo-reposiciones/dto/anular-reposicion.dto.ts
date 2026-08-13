import { IsString, MinLength } from 'class-validator';

export class AnularReposicionDto {
  @IsString()
  @MinLength(3, {
    message: 'El motivo de anulación debe explicar brevemente qué pasó',
  })
  motivo!: string;
}
