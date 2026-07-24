export interface JwtPayload {
  sub: number;
  email: string;
  idEmpresa: number | null;
  roles: string[];
  permisos: string[];
}
