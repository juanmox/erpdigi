import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class EditarEnBlancoDto {
  @IsBoolean()
  consumoEnBlanco!: boolean;

  /**
   * Yardas de papel en blanco de la orden. Entero entre 2 y 10 — el mismo
   * rango que impone el CHECK de la base, para que un POST armado a mano
   * choque con el mismo límite que el formulario.
   *
   * Opcional: al desmarcar no se manda, y al marcar sin especificar se
   * conserva el valor que la orden ya tenía.
   */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  enBlancoYd?: number;
}
