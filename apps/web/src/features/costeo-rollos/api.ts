import { apiFetch, descargarArchivo } from '@/lib/api'
import type {
  EstadoRollo,
  FacturaConRollos,
  HistorialIngresos,
  Inventario,
  FilaPreviewIngresoRollo,
  Impresora,
  MontajeDetalle,
  MontajeHistorial,
  PanelItem,
  RolloPapel,
  TipoPapel,
  Ubicacion,
} from './types'

export const costeoRollosApi = {
  listarImpresoras: () => apiFetch<Impresora[]>('/costeo/rollos/impresoras'),
  listarTiposPapel: () => apiFetch<TipoPapel[]>('/costeo/rollos/tipos-papel'),
  listarUbicaciones: () => apiFetch<Ubicacion[]>('/costeo/rollos/ubicaciones'),
  panel: () => apiFetch<PanelItem[]>('/costeo/rollos/panel'),
  /** Lo cargado a bodega, agrupado por número de factura. */
  historialIngresos: (q: { texto?: string; desde?: string; hasta?: string } = {}) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v)
    const qs = p.toString()
    return apiFetch<HistorialIngresos>(`/costeo/rollos/ingresos${qs ? `?${qs}` : ''}`)
  },
  inventario: () => apiFetch<Inventario>('/costeo/rollos/inventario'),
  disponibles: (idImpresora?: number) =>
    apiFetch<RolloPapel[]>(`/costeo/rollos/disponibles${idImpresora ? `?idImpresora=${idImpresora}` : ''}`),
  obtener: (idRolloPapel: number) => apiFetch<RolloPapel & { montajes: MontajeDetalle[] }>(`/costeo/rollos/${idRolloPapel}`),
  ingreso: (body: {
    numeroFactura: string
    fecha: string
    totalRollos: number
    idTipoPapel: number
    idUbicacion: number
    yardasPorRollo?: number
    costoUnitario?: number
  }) =>
    apiFetch<FacturaConRollos>('/costeo/rollos/ingreso', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /**
   * Devuelve TODOS los artículos cargados con ese número: el mismo número de
   * factura puede estar cargado con varios tipos de papel.
   */
  buscarFacturas: (numeroFactura: string) =>
    apiFetch<{ facturas: FacturaConRollos[] }>(
      `/costeo/rollos/facturas/${encodeURIComponent(numeroFactura)}`,
    ),
  editarIngreso: (
    idFacturaPapel: number,
    body: {
      numeroFactura?: string
      /** Del artículo entero: cambiarlo re-tipa todos sus rollos. */
      idTipoPapel?: number
      fecha?: string
      rollos: { idRolloPapel: number; yardasIniciales?: number; costoUnitario?: number }[]
    },
  ) =>
    apiFetch<FacturaConRollos>(`/costeo/rollos/facturas/${idFacturaPapel}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  montar: (idRolloPapel: number, idImpresora: number) =>
    apiFetch<MontajeDetalle>(`/costeo/rollos/${idRolloPapel}/montar`, {
      method: 'POST',
      body: JSON.stringify({ idImpresora }),
    }),
  /**
   * Solo el estado final: las yardas finales las calcula el servidor desde el
   * restante del rollo. Mandarlas desde acá sería dejar que el cliente decida
   * un dato de inventario.
   */
  desmontar: (idMontajeRollo: number, body: { estado: EstadoRollo }) =>
    apiFetch<MontajeDetalle>(`/costeo/rollos/montajes/${idMontajeRollo}/desmontar`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  detalleMontaje: (idMontajeRollo: number) => apiFetch<MontajeDetalle>(`/costeo/rollos/montajes/${idMontajeRollo}`),
  historialMontajes: (idImpresora?: number) =>
    apiFetch<{ montajes: MontajeHistorial[] }>(
      `/costeo/rollos/montajes${idImpresora ? `?idImpresora=${idImpresora}` : ''}`,
    ),

  /**
   * Saca de circulación un rango de rollos, o lo revierte. Exige el permiso
   * `costeo.rollo.marcar_consumido_fuera`, que no tiene ningún rol de planta.
   */
  marcarConsumidoFuera: (body: {
    idFacturaPapel: number
    desde: number
    hasta: number
    marcar?: boolean
    motivo?: string
  }) =>
    apiFetch<{ afectados: number; secuencias: number[]; sinCambio: number }>(
      '/costeo/rollos/marcar-consumido-fuera',
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  /** Ubica un rango de rollos de una factura, sin importar su estado. */
  asignarUbicacion: (body: { idFacturaPapel: number; desde: number; hasta: number; idUbicacion: number }) =>
    apiFetch<{ afectados: number; secuencias: number[]; sinCambio: number }>(
      '/costeo/rollos/asignar-ubicacion',
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  plantillaImportar: () =>
    descargarArchivo('/costeo/rollos/plantilla-importar', 'plantilla_ingreso_rollos.xlsx'),
  previewImportar: (archivo: File) =>
    apiFetch<{ filas: FilaPreviewIngresoRollo[] }>('/costeo/rollos/importar/preview', {
      method: 'POST',
      body: archivo,
    }),
  aplicarImportar: (filas: FilaPreviewIngresoRollo[]) =>
    apiFetch<{ facturas: number; rollos: number }>('/costeo/rollos/importar/aplicar', {
      method: 'POST',
      body: JSON.stringify({ filas }),
    }),
}
