export interface JwtClaims {
  sub: number
  email: string
  idEmpresa: number | null
  roles: string[]
  permisos: string[]
  exp: number
}

// Decodificación simple, SIN verificar firma — solo para mostrar datos en la UI.
// La aplicación real de permisos siempre ocurre en el servidor.
export function decodeJwt(token: string): JwtClaims | null {
  try {
    const [, payload] = token.split('.')
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as JwtClaims
  } catch {
    return null
  }
}
