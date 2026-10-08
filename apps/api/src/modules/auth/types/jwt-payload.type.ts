export interface JwtPayload {
  sub: number;
  username: string;
  idEmpresa: number | null;
  roles: string[];
  permisos: string[];
  /**
   * Minutos sin actividad antes de cerrar la sesión; 0 = nunca. Resuelto en el
   * servidor por la cadena usuario → rol → default, para que el navegador no
   * tenga que conocer esa regla ni pueda alterarla.
   */
  minutosInactividad: number;
}
