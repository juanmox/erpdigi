export interface PermisoCatalogo {
  idPermiso: number
  codigo: string
  descripcion: string | null
}

export interface Rol {
  idRol: number
  codigo: string
  nombre: string
  descripcion: string | null
  esRolSistema: boolean
  /** true = el seed ya no le toca los permisos; se administran desde acá. */
  personalizado: boolean
  permisos: { permiso: PermisoCatalogo }[]
}
