import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Mismo estilo que los códigos que ya siembra seed.ts: ADMIN, OPERADOR_IMPRESION… */
const PATRON_CODIGO_ROL = /^[A-Z][A-Z0-9_]{1,29}$/;

export class CrearRolDto {
  @IsString()
  @Matches(PATRON_CODIGO_ROL, {
    message:
      'El código debe ir en MAYÚSCULAS, sin espacios (letras, números y guion bajo), de 2 a 30 caracteres',
  })
  codigo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;
}

export class ActualizarPermisosRolDto {
  /**
   * El conjunto COMPLETO de permisos que queda para el rol, no un delta: el
   * servidor reemplaza lo que había. Mandar un delta obligaría a distinguir
   * "no lo mandé" de "lo quité", que es justo donde se cuelan los errores.
   */
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  codigosPermisos!: string[];
}

/**
 * Minutos de inactividad del rol. Tiene su propio endpoint y no viaja con los
 * permisos porque son cosas distintas, y una no debe arrastrar a la otra:
 * editar permisos marca el rol como `personalizado` y hace que el seed deje de
 * reconciliarlos. Sería una sorpresa fea que cambiar un tiempo de sesión
 * congelara de paso los permisos del rol ante el próximo despliegue.
 */
export class ActualizarInactividadRolDto {
  /** null = el rol no opina; sus usuarios caen al default o a otro rol suyo. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  minutosInactividad?: number | null;
}
