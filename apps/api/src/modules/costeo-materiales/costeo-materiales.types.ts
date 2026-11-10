/**
 * Una fila del preview del import de materiales.
 *
 * Los campos `*Texto` son lo CRUDO del archivo y son lo único que el
 * navegador devuelve en el "aplicar" (ver `dto/aplicar-importar.dto.ts`): lo
 * demás se resuelve de nuevo en el servidor. El resto es lo que la pantalla
 * muestra para decidir.
 */
export interface FilaPreviewMaterial {
  fila: number;
  fechaTexto: string;
  planificadorTexto: string;
  opTexto: string;
  codigoTexto: string;
  cantidadTexto: string;
  salidaTexto: string;
  comentarioTexto: string;

  // Resuelto (null si la fila tiene error y no se pudo resolver)
  fecha: string | null;
  ordenPlanificacion: string | null;
  codigoOp: string | null;
  /** La OP ya existe en esta empresa: el ítem queda ligado desde el inicio. */
  opLigada: boolean;
  insumoCodigo: string | null;
  insumoDescripcion: string | null;
  unidad: string | null;
  cantidad: number | null;
  /** null = el insumo no tiene precio: el ítem queda "sin costo". */
  costoUnitario: number | null;
  salidaSac: string | null;
  comentario: string | null;
  /** Con SALIDA el ítem nace ENTREGADO; sin ella, PENDIENTE. */
  nace: 'ENTREGADO' | 'PENDIENTE' | null;

  error: string | null;
  aviso: string | null;
}

export type EstadoMaterial =
  | 'todos'
  | 'pendientes'
  | 'entregados'
  | 'anulados'
  | 'sin_costo'
  | 'sin_ligar'
  /** Con al menos un cambio en su historial (por cualquier razón). */
  | 'modificados';

export type CampoFecha = 'planificador' | 'carga' | 'entrega';

export interface FiltrosMateriales {
  ordenPlanificacion?: string;
  op?: string;
  insumo?: string;
  salida?: string;
  estado?: EstadoMaterial;
  campoFecha?: CampoFecha;
  desde?: string;
  hasta?: string;
  soloMios?: boolean;
}

/** Filtros del historial global. Las fechas son del CAMBIO, no del ítem. */
export interface FiltrosHistorial {
  /** yyyy-mm-dd: día del cambio, en hora de Guatemala. */
  desde?: string;
  hasta?: string;
  accion?: string;
  /** Texto contenido en el nombre de quien hizo el cambio. */
  usuario?: string;
  op?: string;
  ordenPlanificacion?: string;
  insumo?: string;
}

/** Lo que el controlador resuelve del token y el servicio aplica. */
export interface PermisosMateriales {
  /** `costeo.material.importar`: puede modificar o anular lo que cargó él. */
  importar: boolean;
  /** `costeo.material.entregar`: registra salidas y ajusta la fecha de entrega. */
  entregar: boolean;
  /** `costeo.material.editar_ajenos`: toca lo de otros y lo ya entregado. */
  editarAjenos: boolean;
  /** `costeo.material.valorizar`: congela los costos pendientes. */
  valorizar: boolean;
  /** `costeo.dashboard.ver_financiero`: ve costos y totales en dinero. */
  verDinero: boolean;
}
