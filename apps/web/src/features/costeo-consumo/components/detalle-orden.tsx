import { useQuery } from '@tanstack/react-query'
import { costeoConsumoApi } from '../api'
import { TarjetaLinea } from './tarjeta-linea'

/**
 * El detalle de una orden dentro de la tabla de pendientes: las mismas
 * tarjetas que ya existían, con sus tallas, enguiamiento y señales.
 *
 * Se trae **a demanda** y no junto con la lista: la tabla puede traer cientos
 * de órdenes y cargar el detalle de todas para mostrar el de una sería pedir
 * miles de tallas que nadie va a mirar. Como react-query cachea por código,
 * expandir y colapsar la misma orden no vuelve a consultar.
 */
export function DetalleOrden({
  codigo,
  puedeCapturar,
  idsEnviando,
  onEnviarLinea,
  seleccionadas,
  onSeleccionarLinea,
}: {
  codigo: string
  puedeCapturar: boolean
  /** Las líneas que están viajando ahora mismo, para atenuar su botón. */
  idsEnviando: number[]
  onEnviarLinea: (idLineaProduccion: number) => void
  /** Ids de línea marcados, compartidos con la tabla de arriba. */
  seleccionadas: Set<number>
  onSeleccionarLinea: (idLineaProduccion: number, marcar: boolean) => void
}) {
  const { data, isFetching, error } = useQuery({
    queryKey: ['consumo', 'orden', codigo],
    queryFn: () => costeoConsumoApi.obtenerOrden(codigo),
    retry: false,
  })

  if (isFetching && !data)
    return <p className="text-muted-foreground p-2 text-xs">Cargando el detalle…</p>
  if (error)
    return <p className="text-destructive p-2 text-xs">No se pudo cargar el detalle de {codigo}.</p>
  if (!data) return null

  return (
    <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
      {data.lineas.map((l) => (
        <TarjetaLinea
          key={l.idLineaProduccion}
          linea={l}
          // El envío por línea volvió el 2026-10-08, a pedido del usuario: un
          // ítem grande a veces se manda solo. Se había quitado al construir la
          // vista tabular por miedo a que dos caminos de envío produjeran el
          // "creí que ya lo había mandado", pero mandar de más es imposible:
          // la línea enviada desaparece de `pendientes` (que filtra por
          // consumo vigente), `capturarUna` saltea las tallas ya enviadas, y
          // el índice `ux_consumo_papel_produccion_natural` lo prohíbe en la
          // base. La casilla de la fila de la ORDEN sigue siendo el camino
          // para mandar el lote completo.
          onEnviar={() => onEnviarLinea(l.idLineaProduccion)}
          enviando={idsEnviando.includes(l.idLineaProduccion)}
          puedeCapturar={puedeCapturar}
          // La casilla de la tarjeta y la de la fila de la orden escriben en
          // el MISMO conjunto de ids: la de la orden es un atajo para marcar
          // todas sus líneas, y queda a medias si van algunas.
          seleccionada={seleccionadas.has(l.idLineaProduccion)}
          onSeleccionar={(v) => onSeleccionarLinea(l.idLineaProduccion, v)}
        />
      ))}
    </div>
  )
}
