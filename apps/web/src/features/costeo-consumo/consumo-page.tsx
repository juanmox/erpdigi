import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { normalizarCodigoCosteo } from '@/lib/codigos-costeo'
import { costeoConsumoApi } from './api'
import { PanelPendientes } from './components/panel-pendientes'
import { TarjetaLinea } from './components/tarjeta-linea'
import type { LineaConsumo, ResultadoLote } from './types'

type Filtro = 'pendientes' | 'todas'

/** Resumen legible de un envío: qué entró, qué ya estaba y qué falló. */
function resumirLote(r: ResultadoLote): {
  tipo: 'ok' | 'error'
  texto: string
  /** Alguna línea falló porque su impresora no tenía rollo montado. */
  sinRollo: boolean
} {
  const partes: string[] = []
  if (r.enviadas.length > 0) {
    const tallas = r.enviadas.reduce((a, e) => a + e.tallas, 0)
    partes.push(`${r.enviadas.length} línea(s) enviada(s) · ${tallas} talla(s)`)
  }
  if (r.yaEstaban.length > 0) partes.push(`${r.yaEstaban.length} ya estaban enviadas`)
  if (r.fallidas.length > 0) {
    // Los motivos se repiten mucho (casi siempre "sin rollo montado"), así que
    // se agrupan en vez de listar una línea por falla.
    const motivos = [...new Set(r.fallidas.map((f) => f.motivo))].slice(0, 2)
    partes.push(`${r.fallidas.length} fallaron: ${motivos.join('; ')}`)
  }
  return {
    tipo: r.fallidas.length > 0 ? 'error' : 'ok',
    texto: partes.join(' · ') || 'No hubo nada que enviar',
    sinRollo: r.fallidas.some((f) => f.sinRollo),
  }
}

/**
 * Envío de órdenes ya impresas: descuenta el papel consumido por OP.
 * Reemplaza la "Forma 2" legacy.
 *
 * Pensada para los tres tamaños con un solo flujo, no tres pantallas:
 * la búsqueda y la cabecera de la OP quedan arriba, y las líneas son tarjetas
 * que reflowean — 1 columna en teléfono, 2 en tablet, 3 en escritorio. La
 * unidad de decisión es la línea, así que cada tarjeta se basta a sí misma
 * para responder "¿es ésta?" sin depender de una tabla ancha.
 *
 * El envío es por selección múltiple: una OP real puede traer decenas de
 * líneas y mandarlas de a una era inviable. Cada línea igual se procesa por
 * separado en el servidor, así que una que falle no arrastra a las demás.
 */
export function ConsumoPage() {
  const { tienePermiso } = useAuth()
  const puedeCapturar = tienePermiso('costeo.consumo.capturar')
  const queryClient = useQueryClient()

  const [texto, setTexto] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [mensaje, setMensaje] = useState<{
    tipo: 'ok' | 'error'
    texto: string
    sinRollo?: boolean
  } | null>(null)
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  // Vacío = ahora. Decide QUÉ rollo estaba montado, así que una orden impresa
  // ayer (con el rollo ya desmontado) solo se puede descontar retrocediendo la
  // fecha: sin este campo el mensaje "corregi la fecha" del servidor no tenía
  // ningún control detrás.
  const [fechaImpresion, setFechaImpresion] = useState('')
  const [fechaAbierta, setFechaAbierta] = useState(false)
  // El panel de pendientes es para encontrar trabajo; con una OP abierta ya
  // cumplió su función y solo compite por espacio con las líneas.
  const [panelAbierto, setPanelAbierto] = useState(true)

  const { data, isFetching, error } = useQuery({
    queryKey: ['consumo', 'orden', codigo],
    queryFn: () => costeoConsumoApi.obtenerOrden(codigo!),
    enabled: !!codigo,
    retry: false,
  })

  const capturar = useMutation({
    mutationFn: (ids: number[]) =>
      costeoConsumoApi.capturar({
        idsLineaProduccion: ids,
        // datetime-local da "2026-09-02T14:30" sin zona; el servidor guarda
        // timestamptz, así que se manda el instante completo en vez de dejar
        // que cada lado lo interprete a su manera.
        fecha: fechaImpresion ? new Date(fechaImpresion).toISOString() : undefined,
      }),
    onSuccess: (r) => {
      setMensaje(resumirLote(r))
      setSeleccion(new Set())
      queryClient.invalidateQueries({ queryKey: ['consumo', 'orden'] })
      // El consumo descuenta del rollo montado: el panel de Gestión de Rollos
      // muestra papel disponible y quedaría desactualizado.
      queryClient.invalidateQueries({ queryKey: ['rollos'] })
      queryClient.invalidateQueries({ queryKey: ['consumo', 'pendientes'] })
    },
    onError: (e) =>
      setMensaje({
        tipo: 'error',
        texto: e instanceof ApiError ? e.message : 'No se pudo registrar el consumo',
      }),
  })

  function abrirOrden(op: string) {
    setMensaje(null)
    setSeleccion(new Set())
    // No se arrastra entre órdenes: una fecha vieja olvidada descontaría del
    // rollo equivocado sin que nada lo delate.
    setFechaImpresion('')
    setFechaAbierta(false)
    setTexto(op)
    setCodigo(op)
    setPanelAbierto(false)
  }

  function buscar() {
    const t = texto.trim()
    if (!t) return
    abrirOrden(normalizarCodigoCosteo(t, 'OP'))
  }

  const lineas = useMemo(() => {
    const todas = data?.lineas ?? []
    return filtro === 'pendientes' ? todas.filter((l) => !l.completa) : todas
  }, [data, filtro])

  const enviables = useMemo(() => lineas.filter((l) => l.enviable), [lineas])

  // Una OP puede repartirse entre varias impresoras. En los datos reales hoy
  // ninguna lo hace, pero el modelo lo permite y mezclar máquinas en un envío
  // masivo sería justo el error caro: se ofrece seleccionar por impresora.
  const porImpresora = useMemo(() => {
    const m = new Map<string, LineaConsumo[]>()
    for (const l of enviables) {
      const k = l.impresora?.codigo ?? 'Sin impresora'
      m.set(k, [...(m.get(k) ?? []), l])
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [enviables])

  const resumen = useMemo(() => {
    const todas = data?.lineas ?? []
    return {
      total: todas.length,
      completas: todas.filter((l) => l.completa).length,
      bloqueadas: todas.filter((l) => !l.completa && l.sinEstandar.length > 0).length,
      enviables: todas.filter((l) => l.enviable).length,
    }
  }, [data])

  function alternar(id: number, v: boolean) {
    setSeleccion((s) => {
      const n = new Set(s)
      if (v) n.add(id)
      else n.delete(id)
      return n
    })
  }

  const todasSeleccionadas = enviables.length > 0 && seleccion.size === enviables.length

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Envío de órdenes impresas</h1>
        <p className="text-muted-foreground text-sm">
          Descuenta el papel consumido por orden de producción.
        </p>
      </div>

      {/* Búsqueda: acepta solo el correlativo (159) o el código completo. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Label htmlFor="op" className="mb-1 block text-xs">
            Orden de producción
          </Label>
          <Input
            id="op"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="26OP010345 o solo 10345"
            className="font-mono"
            inputMode="numeric"
          />
        </div>
        <Button onClick={buscar} disabled={!texto.trim() || isFetching}>
          {isFetching ? 'Buscando…' : 'Buscar'}
        </Button>
        {!panelAbierto && (
          <Button variant="outline" onClick={() => setPanelAbierto(true)}>
            Ver trabajo pendiente
          </Button>
        )}
      </div>

      {/* Sin esto había que saber de memoria qué OP existen: la pantalla
          obligaba a teclear un código a ciegas. */}
      {panelAbierto && (
        <PanelPendientes
          onElegirOp={abrirOrden}
          onCerrar={data ? () => setPanelAbierto(false) : undefined}
        />
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof ApiError ? error.message : 'No se pudo cargar la orden'}
          </AlertDescription>
        </Alert>
      )}
      {mensaje && (
        <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'}>
          <AlertDescription className="space-y-2">
            <p>{mensaje.texto}</p>
            {/* Los dos arreglos posibles, en el orden en que se aplican: casi
                siempre es que falta montar el rollo; ajustar la fecha es para
                cuando la orden se imprimió antes y ese rollo ya se desmontó. */}
            {mensaje.sinRollo && (
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/costeo/rollos?tab=montaje" className="no-underline">
                    Ir a montar el rollo
                  </Link>
                </Button>
                {!fechaAbierta && (
                  <Button size="sm" variant="ghost" onClick={() => setFechaAbierta(true)}>
                    Ajustar la fecha de impresión
                  </Button>
                )}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          {/* Cabecera de la OP: identifica lo que se está por descontar y se
              queda a la vista mientras se recorren las líneas. Lleva también
              las acciones de envío, que es la decisión que se toma acá. */}
          <div className="bg-card sticky top-0 z-10 space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-lg font-bold">{data.orden.codigo}</span>
              <span className="text-sm">{data.orden.cliente?.nombre ?? 'Sin cliente'}</span>
              {data.orden.ordenCompra && (
                <span className="text-muted-foreground text-xs">OC {data.orden.ordenCompra}</span>
              )}
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
              <span>{resumen.total} líneas</span>
              <span>{resumen.enviables} por enviar</span>
              {resumen.completas > 0 && <span>{resumen.completas} enviadas</span>}
              {resumen.bloqueadas > 0 && (
                <span className="text-destructive">{resumen.bloqueadas} sin estándar</span>
              )}
            </div>

            {puedeCapturar && enviables.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={todasSeleccionadas}
                    onCheckedChange={(v) =>
                      setSeleccion(v === true ? new Set(enviables.map((l) => l.idLineaProduccion)) : new Set())
                    }
                    aria-label="Seleccionar todas las líneas por enviar"
                  />
                  Seleccionar todas ({enviables.length})
                </label>

                {/* Solo cuando de verdad hay más de una máquina en juego. */}
                {porImpresora.length > 1 &&
                  porImpresora.map(([imp, ls]) => (
                    <Button
                      key={imp}
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSeleccion((s) => {
                          const n = new Set(s)
                          for (const l of ls) n.add(l.idLineaProduccion)
                          return n
                        })
                      }
                    >
                      + {imp} ({ls.length})
                    </Button>
                  ))}

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant={fechaImpresion ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setFechaAbierta((v) => !v)}
                  >
                    {fechaImpresion ? 'Fecha ajustada' : 'Fecha…'}
                  </Button>
                  {seleccion.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setSeleccion(new Set())}>
                      Limpiar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={seleccion.size === 0 || capturar.isPending}
                    onClick={() => capturar.mutate([...seleccion])}
                  >
                    {capturar.isPending
                      ? 'Enviando…'
                      : `Enviar seleccionadas (${seleccion.size})`}
                  </Button>
                </div>
              </div>
            )}

            {puedeCapturar && (fechaAbierta || fechaImpresion) && (
              <div className="flex flex-wrap items-end gap-2 border-t pt-2">
                <div>
                  <Label htmlFor="fecha-impresion" className="mb-1 block text-xs">
                    Fecha y hora de impresión
                  </Label>
                  <Input
                    id="fecha-impresion"
                    type="datetime-local"
                    value={fechaImpresion}
                    onChange={(e) => setFechaImpresion(e.target.value)}
                    className="w-56"
                  />
                </div>
                {fechaImpresion && (
                  <Button variant="ghost" size="sm" onClick={() => setFechaImpresion('')}>
                    Volver a ahora
                  </Button>
                )}
                <p className="text-muted-foreground w-full text-xs">
                  {fechaImpresion
                    ? 'Se descontará del rollo que estaba montado en ese momento, no del actual.'
                    : 'En blanco se usa el momento actual. Cambiala si la orden se imprimió antes y ese rollo ya se desmontó.'}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-1">
            {(['pendientes', 'todas'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filtro === f ? 'default' : 'outline'}
                onClick={() => setFiltro(f)}
              >
                {f === 'pendientes' ? 'Pendientes' : 'Todas'}
              </Button>
            ))}
          </div>

          {lineas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {filtro === 'pendientes'
                ? 'Todas las líneas de esta orden ya fueron enviadas.'
                : 'Esta orden no tiene líneas.'}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lineas.map((l) => (
                <TarjetaLinea
                  key={l.idLineaProduccion}
                  linea={l}
                  puedeCapturar={puedeCapturar}
                  seleccionada={seleccion.has(l.idLineaProduccion)}
                  onSeleccionar={(v) => alternar(l.idLineaProduccion, v)}
                  enviando={
                    capturar.isPending && !!capturar.variables?.includes(l.idLineaProduccion)
                  }
                  onEnviar={() => capturar.mutate([l.idLineaProduccion])}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
