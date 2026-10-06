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
import type { GrupoImpresoraPendiente } from './types'
import { DetalleOrden } from './components/detalle-orden'
import { TablaPendientes } from './components/tabla-pendientes'
import { TarjetaLinea } from './components/tarjeta-linea'
import type { LineaConsumo, ResultadoLote } from './types'

type Filtro = 'pendientes' | 'todas'

/** Resumen legible de un envío: qué entró, qué ya estaba y qué falló. */
/** Lo que hace falta para reintentar un envío confirmando impresoras ajenas. */
interface ReintentoOcupada {
  /** Solo las líneas frenadas por el tope, no todo el lote. */
  ids: number[]
  idsImpresora: number[]
  /** "MS 1 (Ana Pérez)", para nombrar en el aviso de quién es cada máquina. */
  detalle: string[]
}

function resumirLote(r: ResultadoLote): {
  tipo: 'ok' | 'error'
  texto: string
  /** Alguna línea falló porque su impresora no tenía rollo montado. */
  sinRollo: boolean
  /**
   * Alguna línea la frenó el tope por impresora. No es un error que se
   * "arregle": se confirma y se reenvía, así que el aviso ofrece hacerlo en vez
   * de dejar al operario sin salida.
   */
  reintentoOcupada?: ReintentoOcupada
} {
  const partes: string[] = []
  if (r.enviadas.length > 0) {
    const tallas = r.enviadas.reduce((a, e) => a + e.tallas, 0)
    partes.push(`${r.enviadas.length} línea(s) enviada(s) · ${tallas} talla(s)`)
  }
  if (r.yaEstaban.length > 0) partes.push(`${r.yaEstaban.length} ya estaban enviadas`)

  // El tope por impresora se separa del resto de las fallas: se cuenta por
  // MÁQUINA y no por línea, porque el aviso es uno por máquina —repetir
  // "Ana está usando la MS 1" cincuenta veces no agrega nada.
  const ocupadas = r.fallidas.filter((f) => f.impresoraOcupada)
  const otras = r.fallidas.filter((f) => !f.impresoraOcupada)
  let reintentoOcupada: ReintentoOcupada | undefined
  if (ocupadas.length > 0) {
    const porImpresora = new Map<number, { impresora: string; usuario: string }>()
    for (const f of ocupadas) porImpresora.set(f.impresoraOcupada!.idImpresora, f.impresoraOcupada!)
    const detalle = [...porImpresora.values()].map((x) => `${x.impresora} (${x.usuario})`)
    partes.push(
      `${ocupadas.length} línea(s) en uso por otro operario: ${detalle.join(', ')}`,
    )
    reintentoOcupada = {
      ids: ocupadas.map((f) => f.idLineaProduccion),
      idsImpresora: [...porImpresora.keys()],
      detalle,
    }
  }
  if (otras.length > 0) {
    // Los motivos se repiten mucho (casi siempre "sin rollo montado"), así que
    // se agrupan en vez de listar una línea por falla.
    const motivos = [...new Set(otras.map((f) => f.motivo))].slice(0, 2)
    partes.push(`${otras.length} fallaron: ${motivos.join('; ')}`)
  }
  return {
    tipo: r.fallidas.length > 0 ? 'error' : 'ok',
    texto: partes.join(' · ') || 'No hubo nada que enviar',
    sinRollo: r.fallidas.some((f) => f.sinRollo),
    reintentoOcupada,
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
  // Registrar contra una fecha distinta a la de ahora es la EXCEPCIÓN: descuenta
  // del rollo que estaba montado en ese momento, no del actual. Sin el permiso
  // el control no aparece y el servidor rechaza cualquier fecha en el cuerpo.
  const puedeFechaManual = tienePermiso('costeo.consumo.fecha_manual')
  // Las OP se cargan en otro módulo. Sin un camino desde acá, quien no encuentra
  // su orden no tiene cómo saber dónde se dan de alta.
  const puedeVerOrdenes = tienePermiso('costeo.orden.ver')
  const queryClient = useQueryClient()

  const [texto, setTexto] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [mensaje, setMensaje] = useState<{
    tipo: 'ok' | 'error'
    texto: string
    sinRollo?: boolean
    /** Frenado por el tope de impresora: el aviso ofrece confirmar y reenviar. */
    reintentoOcupada?: ReintentoOcupada
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
  // Selección de la tabla: por ORDEN, no por línea. Marcar una orden manda sus
  // líneas pendientes EN ESA impresora — el servidor ya las agrupó así.
  const [ordenesSel, setOrdenesSel] = useState<Set<string>>(new Set())
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const [progreso, setProgreso] = useState<string | null>(null)

  const { data, isFetching, error } = useQuery({
    queryKey: ['consumo', 'orden', codigo],
    queryFn: () => costeoConsumoApi.obtenerOrden(codigo!),
    enabled: !!codigo,
    retry: false,
  })

  const { data: pendientes } = useQuery({
    queryKey: ['consumo', 'pendientes'],
    queryFn: () => costeoConsumoApi.pendientes(),
  })

  /**
   * Envía en tandas de 300 líneas, no todo de una.
   *
   * El tope lo manda el espejo a Google Sheets: una tanda de 300 líneas son
   * ~1,500 filas en la hoja, y ~1,900 líneas en un solo request excederían el
   * timeout además de la cuota. Partirlo también hace que una tanda que falle
   * no se lleve a las anteriores, y deja mostrar avance en vez de una pantalla
   * congelada. Cuando el espejo se retire, este número puede subir.
   */
  const LINEAS_POR_TANDA = 300

  const capturarEnTandas = useMutation({
    mutationFn: async ({
      ids,
      idsImpresoraAjenaConfirmadas,
    }: {
      ids: number[]
      /** Solo en el reintento del tope; vacío en el envío normal. */
      idsImpresoraAjenaConfirmadas?: number[]
    }) => {
      const tandas: number[][] = []
      for (let i = 0; i < ids.length; i += LINEAS_POR_TANDA)
        tandas.push(ids.slice(i, i + LINEAS_POR_TANDA))

      const total: ResultadoLote = { enviadas: [], yaEstaban: [], fallidas: [] }
      for (const [i, tanda] of tandas.entries()) {
        setProgreso(
          tandas.length > 1 ? `Enviando tanda ${i + 1} de ${tandas.length}…` : 'Enviando…',
        )
        const r = await costeoConsumoApi.capturar({
          idsLineaProduccion: tanda,
          fecha: fechaImpresion ? new Date(fechaImpresion).toISOString() : undefined,
          idsImpresoraAjenaConfirmadas,
        })
        // Un solo resumen al final: con 7 tandas, siete mensajes serían ilegibles.
        total.enviadas.push(...r.enviadas)
        total.yaEstaban.push(...r.yaEstaban)
        total.fallidas.push(...r.fallidas)
      }
      return total
    },
    onSuccess: (r) => {
      setProgreso(null)
      setMensaje(resumirLote(r))
      setOrdenesSel(new Set())
      queryClient.invalidateQueries({ queryKey: ['consumo'] })
      queryClient.invalidateQueries({ queryKey: ['rollos'] })
    },
    onError: (e) => {
      setProgreso(null)
      setMensaje({
        tipo: 'error',
        texto: e instanceof ApiError ? e.message : 'No se pudo registrar el consumo',
      })
    },
  })

  const enBlanco = useMutation({
    mutationFn: (v: { codigo: string; marcado: boolean; yardas: number }) =>
      costeoConsumoApi.editarEnBlanco(v.codigo, v.marcado, v.marcado ? v.yardas : undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consumo', 'pendientes'] }),
    onError: (e) =>
      setMensaje({
        tipo: 'error',
        texto: e instanceof ApiError ? e.message : 'No se pudo cambiar el papel en blanco',
      }),
  })

  const capturar = useMutation({
    mutationFn: ({
      ids,
      idsImpresoraAjenaConfirmadas,
    }: {
      ids: number[]
      idsImpresoraAjenaConfirmadas?: number[]
    }) =>
      costeoConsumoApi.capturar({
        idsLineaProduccion: ids,
        // datetime-local da "2026-09-02T14:30" sin zona; el servidor guarda
        // timestamptz, así que se manda el instante completo en vez de dejar
        // que cada lado lo interprete a su manera.
        fecha: fechaImpresion ? new Date(fechaImpresion).toISOString() : undefined,
        idsImpresoraAjenaConfirmadas,
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

  // Las órdenes seleccionadas resueltas a las líneas que de verdad se envían.
  // La cuenta sale de acá y no de `ordenesSel.size` porque lo que se manda son
  // líneas: decir "3 órdenes" cuando son 47 líneas confunde al estimar el rollo.
  const idsSeleccionados = useMemo(() => {
    const ids: number[] = []
    for (const g of pendientes?.grupos ?? [])
      for (const o of g.ordenes) if (ordenesSel.has(o.codigo)) ids.push(...o.idsLineaProduccion)
    return ids
  }, [pendientes, ordenesSel])
  const totalSeleccionado = idsSeleccionados.length
  const todasLasOrdenes = useMemo(
    () => (pendientes?.grupos ?? []).flatMap((g) => g.ordenes.map((o) => o.codigo)),
    [pendientes],
  )

  function alternarOrden(codigo: string) {
    setOrdenesSel((prev) => {
      const s = new Set(prev)
      if (s.has(codigo)) s.delete(codigo)
      else s.add(codigo)
      return s
    })
  }

  function alternarGrupo(grupo: GrupoImpresoraPendiente, marcar: boolean) {
    setOrdenesSel((prev) => {
      const s = new Set(prev)
      for (const o of grupo.ordenes) {
        if (marcar) s.add(o.codigo)
        else s.delete(o.codigo)
      }
      return s
    })
  }

  function alternarDetalle(codigo: string) {
    setExpandidas((prev) => {
      const s = new Set(prev)
      if (s.has(codigo)) s.delete(codigo)
      else s.add(codigo)
      return s
    })
  }

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

  const atajoOrdenes = puedeVerOrdenes ? (
    <Button asChild size="sm" variant="outline">
      <Link to="/costeo/ordenes" className="no-underline">
        Ir a Órdenes de Producción
      </Link>
    </Button>
  ) : null

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Impresión de OPs</h1>
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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink">Trabajo pendiente</h2>
            {totalSeleccionado > 0 && (
              <span className="text-ink-faint text-xs">
                {ordenesSel.size} orden(es) · {totalSeleccionado} línea(s) por enviar
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Seleccionar todo lo pendiente, de todas las impresoras. El
                  servidor resuelve el rollo de cada línea por su impresora, así
                  que un envío mezclado es legítimo; el selector por grupo sigue
                  siendo el camino normal (un operario trabaja una máquina). */}
              <label className="flex items-center gap-1.5">
                <Checkbox
                  checked={todasLasOrdenes.length > 0 && ordenesSel.size === todasLasOrdenes.length}
                  aria-label="Seleccionar todas las órdenes pendientes"
                  onCheckedChange={(c) =>
                    setOrdenesSel(c === true ? new Set(todasLasOrdenes) : new Set())
                  }
                />
                <span className="text-ink-faint text-xs">Todas</span>
              </label>
              {ordenesSel.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setOrdenesSel(new Set())}>
                  Limpiar selección
                </Button>
              )}
              <Button
                size="sm"
                disabled={!puedeCapturar || totalSeleccionado === 0 || capturarEnTandas.isPending}
                onClick={() => capturarEnTandas.mutate({ ids: idsSeleccionados })}
              >
                {progreso ?? `Enviar seleccionadas (${totalSeleccionado})`}
              </Button>
            </div>
          </div>

          {pendientes?.truncado && (
            <Alert variant="destructive">
              <AlertDescription>
                Se alcanzó el tope de {pendientes.lineasDevueltas} líneas: hay más trabajo
                pendiente del que se muestra. Filtrá por impresora para verlo completo.
              </AlertDescription>
            </Alert>
          )}

          <TablaPendientes
            grupos={pendientes?.grupos ?? []}
            seleccionadas={ordenesSel}
            onAlternarOrden={alternarOrden}
            onAlternarGrupo={alternarGrupo}
            expandidas={expandidas}
            onAlternarDetalle={alternarDetalle}
            renderDetalle={(o) => <DetalleOrden codigo={o.codigo} />}
            onEnBlanco={(o, marcado, yardas) =>
              enBlanco.mutate({ codigo: o.codigo, marcado, yardas })
            }
            puedeMarcarEnBlanco={puedeCapturar}
          />

          {pendientes && pendientes.grupos.length === 0 && (
            <div className="rounded-md border border-border p-4 text-center">
              <p className="text-muted-foreground text-sm">No hay trabajo pendiente.</p>
              {atajoOrdenes && <div className="mt-2">{atajoOrdenes}</div>}
            </div>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-2">
            <p>{error instanceof ApiError ? error.message : 'No se pudo cargar la orden'}</p>
            {/* Si la OP existe pero en otra de tus empresas, el arreglo es
                cambiar de empresa — ofrecer además "ir a cargarla" sería un
                segundo consejo que contradice al primero. Se distingue por
                `motivo` y no por el texto del mensaje, que se rompe en cuanto
                alguien lo reescribe. */}
            {atajoOrdenes && !(error instanceof ApiError && error.motivo === 'OP_EN_OTRA_EMPRESA') && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs">Las órdenes se cargan por plantilla desde ahí.</span>
                {atajoOrdenes}
              </div>
            )}
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
                {puedeFechaManual && !fechaAbierta && (
                  <Button size="sm" variant="ghost" onClick={() => setFechaAbierta(true)}>
                    Ajustar la fecha de impresión
                  </Button>
                )}
              </div>
            )}
            {/* El tope por impresora NO tiene "arreglo": la máquina es de otro
                y puede que igual corresponda (un cambio de turno). Así que la
                salida es confirmarlo, y el aviso dice que queda registrado —
                eso es lo que lo vuelve un tope y no un trámite invisible.
                Reenvía SOLO las líneas frenadas, no el lote entero. */}
            {mensaje.reintentoOcupada && puedeCapturar && (
              <div className="space-y-1.5">
                <p className="text-xs">
                  Si te corresponde —por ejemplo un cambio de turno— confirmá y se envía igual.
                  Queda registrado a tu nombre que era la impresora de{' '}
                  {mensaje.reintentoOcupada.detalle.join(', ')}.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={capturarEnTandas.isPending}
                  onClick={() =>
                    capturarEnTandas.mutate({
                      ids: mensaje.reintentoOcupada!.ids,
                      idsImpresoraAjenaConfirmadas: mensaje.reintentoOcupada!.idsImpresora,
                    })
                  }
                >
                  Confirmar y enviar igual ({mensaje.reintentoOcupada.ids.length} línea(s))
                </Button>
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
                  {puedeFechaManual && (
                    <Button
                      variant={fechaImpresion ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setFechaAbierta((v) => !v)}
                    >
                      {fechaImpresion ? 'Fecha ajustada' : 'Fecha…'}
                    </Button>
                  )}
                  {seleccion.size > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setSeleccion(new Set())}>
                      Limpiar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={seleccion.size === 0 || capturar.isPending}
                    onClick={() => capturar.mutate({ ids: [...seleccion] })}
                  >
                    {capturar.isPending
                      ? 'Enviando…'
                      : `Enviar seleccionadas (${seleccion.size})`}
                  </Button>
                </div>
              </div>
            )}

            {puedeCapturar && puedeFechaManual && (fechaAbierta || fechaImpresion) && (
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
                    capturar.isPending && !!capturar.variables?.ids.includes(l.idLineaProduccion)
                  }
                  onEnviar={() => capturar.mutate({ ids: [l.idLineaProduccion] })}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
