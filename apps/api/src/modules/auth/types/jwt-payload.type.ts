export interface JwtPayload {
  sub: number;
  username: string;
  idEmpresa: number | null;
  roles: string[];
  permisos: string[];
}
