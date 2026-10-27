export interface TableroBi {
  clave: string
  titulo: string
  descripcion: string
  /** UUID embebido en Superset; el SDK lo necesita para montar el iframe. */
  uuid: string
  /** Mostrar el menú de descarga en este tablero (control de pantalla, no un gate real). */
  permiteDescarga: boolean
}

export interface ListadoTablerosBi {
  /** Sin Superset configurado el menú "Tableros" no se muestra. */
  configurado: boolean
  urlSuperset: string | null
  tableros: TableroBi[]
}
