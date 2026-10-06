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
export function DetalleOrden({ codigo }: { codigo: string }) {
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
          // Dentro de la tabla el envío se decide por ORDEN, no por línea: la
          // tarjeta queda como lo que es acá, una ficha de consulta. Ofrecer
          // dos caminos de envío en la misma pantalla es lo que produce el
          // "creí que ya lo había mandado".
          onEnviar={() => {}}
          enviando={false}
          puedeCapturar={false}
          seleccionada={false}
          onSeleccionar={() => {}}
        />
      ))}
    </div>
  )
}
