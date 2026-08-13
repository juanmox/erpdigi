export interface Departamento {
  idDepartamento: number
  codigo: string
  nombre: string
}

export interface Defecto {
  idDefecto: number
  codigo: string
  nombre: string
  categoria: string | null
  imputableA: string | null
}

export interface Calandra {
  idCalandra: number
  codigo: string
}

export interface Impresora {
  idImpresora: number
  codigo: string
}

export interface InsumoTela {
  idInsumo: number
  codigo: string
  descripcion: string
}

export interface SiguienteNumero {
  siguienteNumero: number
  cliente: string | null
  lineaProducto: string | null
}

export interface Reposicion {
  idReposicion: number
  fecha: string
  numeroRepo: number
  codigoRepo: string
  bodegaSac: string | null
  yardasPapel: string
  yardasTela: string
  comentario: string | null
  creadoEn: string
  anuladoEn: string | null
  motivoAnulacion: string | null
  departamento: Departamento
  defecto: Defecto
  empleado: { nombres: string } | null
  impresora: Impresora | null
  calandra: Calandra | null
  tipoPapel: { nombre: string } | null
  insumoTela: InsumoTela | null
  ordenProduccion: {
    codigo: string
    cliente: { nombre: string } | null
    lineaProducto: { nombre: string } | null
  }
}
