export interface EmpresaRolUsuario {
  idUsuarioEmpresaRol: number
  idUsuario: number
  idEmpresa: number
  idRol: number
  activo: boolean
  empresa: { idEmpresa: number; codigo: string; nombreComercial: string | null }
  rol: { idRol: number; codigo: string; nombre: string }
}

export interface UsuarioAdmin {
  idUsuario: number
  username: string
  email: string | null
  nombreCompleto: string
  activo: boolean
  ultimoLoginEn: string | null
  creadoEn: string
  empresaRoles: EmpresaRolUsuario[]
}

export interface EmpresaOpcion {
  idEmpresa: number
  codigo: string
  nombreComercial: string | null
  activo: boolean
}

export interface RolOpcion {
  idRol: number
  codigo: string
  nombre: string
}
