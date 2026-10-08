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
  /**
   * Minutos de inactividad antes de cerrar la sesión. null = el rol no opina, y
   * sus usuarios caen al default (15) o a otro de sus roles. 0 = nunca cerrar.
   */
  minutosInactividad: number | null
  permisos: { permiso: PermisoCatalogo }[]
}
