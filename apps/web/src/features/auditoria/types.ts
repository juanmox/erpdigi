/** Una acción de la bitácora, ya narrada por el servidor. */
export interface EntradaBitacora {
  idAuditoria: number
  fecha: string
  /** El nombre guardado como TEXTO: sobrevive al borrado del usuario. */
  usuario: string | null
  /** El usuario ya no existe: el nombre quedó, su ficha no. */
  usuarioBorrado: boolean
  ip: string | null
  userAgent: string | null
  /** La frase: "montó un rollo en la MS 1". */
  texto: string
  /** Lo que cambió, ya traducido. */
  detalle: string | null
  entidad: string
  accion: string
  idEntidad: string
}

export interface PaginaBitacora {
  total: number
  pagina: number
  porPagina: number
  paginas: number
  entradas: EntradaBitacora[]
}

export interface FiltrosBitacora {
  entidades: { entidad: string; etiqueta: string; n: number }[]
  usuarios: string[]
  acciones: string[]
}

export interface ConsultaBitacora {
  entidad?: string
  accion?: string
  usuario?: string
  desde?: string
  hasta?: string
  pagina?: number
}
