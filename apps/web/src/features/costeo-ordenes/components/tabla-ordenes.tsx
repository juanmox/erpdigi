import { useQuery } from '@tanstack/react-query'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { costeoOrdenesApi } from '../api'
import type { EstadoListadoOrdenes, LineaPendienteOrden, OrdenPendiente } from '../types'

const MODOS: { valor: EstadoListadoOrdenes; etiqueta: string; vacio: string }[] = [
  {
    valor: 'pendientes',
    etiqueta: 'Pendientes',
    vacio: 'No hay órdenes con trabajo pendiente de impresión.',
  },
  { valor: 'impresas', etiqueta: 'Impresas', vacio: 'Todavía no hay órdenes impresas por completo.' },
  { valor: 'todas', etiqueta: 'Todas', vacio: 'No hay órdenes cargadas.' },
]

/**
 * Anchos de la tabla, en px y con `table-fixed`.
 *
 * Medido con 15 columnas de talla: las cuatro primeras columnas se llevaban
 * 583px (Línea 173 · Producto 190 · Impresora 109 · Fecha 111) aunque su
 * contenido real es mucho más corto — lo que las infla es el ENCABEZADO, porque
 * con `table-layout: auto` el navegador reserva lugar para "Fecha cliente"
 * entero aunque abajo solo diga `28/05/26`. De ahí que los encabezados se hayan
 * acortado y los anchos sean explícitos.
 *
 * Las columnas de talla son angostas a propósito: las cantidades **rara vez
 * pasan de 2 dígitos** (confirmado por el usuario), así que el ancho lo dicta el
 * encabezado, no el dato. Los nombres combinados (`2XS-XS`, `YL-YXL`) se dejan
 * envolver en dos renglones en vez de ensanchar la columna.
 */
const ANCHO = {
  linea: 112,
  producto: 168,
  impresora: 56,
  fecha: 68,
  talla: 36,
  total: 46,
}
const ANCHO_FIJO = ANCHO.linea + ANCHO.producto + ANCHO.impresora + ANCHO.fecha + ANCHO.total

/** dd/mm/aa en hora de Guatemala, o "—". Corto a propósito: son muchas columnas. */
function fechaCorta(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-GT', {
    timeZone: 'America/Guatemala',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function coincide(o: OrdenPendiente, texto: string) {
  if (!texto) return true
  const t = texto.toLowerCase()
  return (
    o.codigo.toLowerCase().includes(t) ||
    (o.cliente ?? '').toLowerCase().includes(t) ||
    (o.ordenCompra ?? '').toLowerCase().includes(t) ||
    o.lineas.some(
      (l) =>
        l.codigoLine.toLowerCase().includes(t) ||
        l.producto.toLowerCase().includes(t) ||
        (l.impresora ?? '').toLowerCase().includes(t),
    )
  )
}

/** "M 8 · L 19 · XL 8" — la versión compacta de la matriz, para pantallas angostas. */
function tallasEnLinea(l: LineaPendienteOrden, tallas: string[]) {
  return tallas
    .filter((t) => l.cantidades[t] != null)
    .map((t) => `${t} ${l.cantidades[t]}`)
    .join(' · ')
}

/**
 * Las OP cargadas, con las líneas agrupadas bajo su orden.
 *
 * Antes la pantalla solo tenía el buscador por código, así que no había forma
 * de ver qué se cargó salvo recordar los números (reportado por el usuario).
 *
 * Cliente y orden de compra son de la orden; producto, impresora, fecha y
 * tallas son de cada línea. Repetir los datos de la OP en cada fila haría la
 * tabla más ancha sin agregar información.
 *
 * DOS PRESENTACIONES de los mismos datos, no dos pantallas:
 * - En `xl` (1280px) y más, tabla con una columna por talla. Es la matriz que
 *   se parece a la hoja de cálculo con la que ya se trabaja y permite comparar
 *   cantidades entre líneas de un vistazo. El corte va en `xl` y no en `lg`
 *   porque el sidebar se lleva 248px: a 1024 de viewport quedan ~776 útiles y
 *   la matriz volvería a scrollear, que es lo que se quiere evitar.
 * - Abajo de `xl`, tarjetas apiladas con las tallas como texto compacto. Una
 *   matriz de 15 columnas no entra en un teléfono; forzarla obligaba a scroll
 *   horizontal dentro de la tabla, que fue justo lo que el usuario reportó
 *   ("solo se podría ver en PC").
 *
 * Las órdenes arrancan COLAPSADAS: el propósito de la pantalla es ver qué hay
 * cargado, y eso lo responden las cabeceras. Las líneas son el detalle al que
 * se entra.
 */
export function TablaOrdenes({ onAbrirOrden }: { onAbrirOrden: (codigo: string) => void }) {
  const [estado, setEstado] = useState<EstadoListadoOrdenes>('pendientes')
  const [busqueda, setBusqueda] = useState('')
  // Se guardan las EXPANDIDAS y no las colapsadas: el default es colapsado, así
  // que el conjunto vacío es el estado inicial y las órdenes que lleguen
  // después (otro modo, otro filtro) nacen colapsadas sin tener que tocarlo.
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['costeo-ordenes', 'listado', estado],
    queryFn: () => costeoOrdenesApi.listado(estado),
  })

  const ordenes = useMemo(
    () => (data?.ordenes ?? []).filter((o) => coincide(o, busqueda.trim())),
    [data, busqueda],
  )
  const tallas = data?.tallas ?? []
  const piezas = ordenes.reduce((acc, o) => acc + o.totalPiezas, 0)
  const modo = MODOS.find((m) => m.valor === estado)!
  // Solo en el modo mixto hace falta distinguirlas: en los otros dos el estado
  // de cada línea ya lo dice el filtro elegido.
  const marcarEstado = estado === 'todas'
  const todasExpandidas = ordenes.length > 0 && ordenes.every((o) => expandidas.has(o.idOrdenProduccion))

  function alternar(id: number) {
    setExpandidas((prev) => {
      const copia = new Set(prev)
      if (copia.has(id)) copia.delete(id)
      else copia.add(id)
      return copia
    })
  }

  function alternarTodas() {
    setExpandidas(todasExpandidas ? new Set() : new Set(ordenes.map((o) => o.idOrdenProduccion)))
  }

  function cambiarModo(valor: EstadoListadoOrdenes) {
    setEstado(valor)
    // Lo expandido del modo anterior no aplica al nuevo listado.
    setExpandidas(new Set())
  }

  const vacio = (
    <>
      {!busqueda && modo.vacio}
      {/* El filtro corre sobre lo ya cargado. Si el listado vino recortado,
          "no coincide" no significa "no existe", y hay que decirlo o se
          diagnostica mal. */}
      {busqueda && 'Ninguna de las órdenes cargadas coincide con el filtro.'}
      {busqueda && data && data.totalOrdenes > data.ordenes.length && (
        <span className="block">
          Hay {data.totalOrdenes - data.ordenes.length} orden(es) más que no se cargaron; si buscás
          una en particular, usá el buscador por código de arriba.
        </span>
      )}
    </>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">Órdenes cargadas</h2>
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? 'Cargando…'
              : `${ordenes.length} orden(es) · ${piezas.toLocaleString('es-GT')} pieza(s)`}
            {data && data.totalOrdenes > data.ordenes.length && !busqueda && (
              <> · se muestran las {data.ordenes.length} más recientes de {data.totalOrdenes}</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Tres botones y no un <Select>: son pocas opciones, se ve cuál está
              activa sin abrir nada, y cambiar de modo es un clic. */}
          <div className="flex rounded-md border border-border p-0.5">
            {MODOS.map((m) => (
              <Button
                key={m.valor}
                size="sm"
                variant={estado === m.valor ? 'secondary' : 'ghost'}
                className={cn('h-7 px-3 text-xs', estado !== m.valor && 'text-ink-faint')}
                onClick={() => cambiarModo(m.valor)}
              >
                {m.etiqueta}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={ordenes.length === 0}
            onClick={alternarTodas}
          >
            {todasExpandidas ? 'Colapsar todas' : 'Expandir todas'}
          </Button>
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Filtrar por OP, cliente, OC, producto o impresora…"
            className="max-w-xs"
          />
        </div>
      </div>

      {/* ── Escritorio: la matriz ────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto rounded-md border border-border xl:block">
        {/* `table-fixed` + anchos explícitos: sin eso el navegador reparte según el
            contenido y los encabezados largos se comen el espacio de las tallas.
            El `min-w` crece con la cantidad de columnas de talla, así que agregar
            tallas nuevas ensancha la tabla en vez de apretar las que ya estaban. */}
        <Table className="table-fixed" style={{ minWidth: ANCHO_FIJO + tallas.length * ANCHO.talla }}>
          <TableHeader>
            <TableRow>
              <TableHead style={{ width: ANCHO.linea }}>Item</TableHead>
              <TableHead style={{ width: ANCHO.producto }}>Producto</TableHead>
              <TableHead style={{ width: ANCHO.impresora }}>Impr.</TableHead>
              <TableHead style={{ width: ANCHO.fecha }}>F. cliente</TableHead>
              {tallas.map((t) => (
                <TableHead
                  key={t}
                  style={{ width: ANCHO.talla }}
                  // `whitespace-normal` vence al `whitespace-nowrap` del primitivo:
                  // un `2XS-XS` parte en dos renglones en vez de ensanchar la columna.
                  className="px-1 text-right text-[10.5px] leading-tight whitespace-normal"
                >
                  {t}
                </TableHead>
              ))}
              <TableHead style={{ width: ANCHO.total }} className="px-1 text-right">
                Total
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5 + tallas.length} className="text-muted-foreground text-center">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && ordenes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5 + tallas.length} className="text-muted-foreground text-center">
                  {vacio}
                </TableCell>
              </TableRow>
            )}
            {ordenes.map((o) => (
              <FilasDeOrden
                key={o.idOrdenProduccion}
                orden={o}
                tallas={tallas}
                marcarEstado={marcarEstado}
                expandida={expandidas.has(o.idOrdenProduccion)}
                onAlternar={() => alternar(o.idOrdenProduccion)}
                onAbrir={onAbrirOrden}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Angosto: tarjetas apiladas ───────────────────────────────────── */}
      <div className="space-y-2 xl:hidden">
        {isLoading && <p className="text-muted-foreground p-4 text-center text-sm">Cargando…</p>}
        {!isLoading && ordenes.length === 0 && (
          <p className="text-muted-foreground rounded-md border border-border p-4 text-center text-sm">
            {vacio}
          </p>
        )}
        {ordenes.map((o) => (
          <TarjetaOrden
            key={o.idOrdenProduccion}
            orden={o}
            tallas={tallas}
            marcarEstado={marcarEstado}
            expandida={expandidas.has(o.idOrdenProduccion)}
            onAlternar={() => alternar(o.idOrdenProduccion)}
            onAbrir={onAbrirOrden}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * El chevron es un <button> de verdad y no solo un icono dentro de una fila
 * clickeable: la fila entera alterna con el mouse, pero sin esto no habría
 * forma de expandir con teclado. Lleva `aria-expanded` para que un lector de
 * pantalla anuncie el estado.
 *
 * Su contenedor NO puede ser <button>: adentro va el código de OP, que también
 * es un botón, y un botón anidado es HTML inválido (React lo reporta como error
 * de hidratación). Por eso las dos cabeceras usan un contenedor común con
 * `onClick` en vez de envolver todo en un boton.
 */
function BotonColapsar({ expandida, onAlternar }: { expandida: boolean; onAlternar: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={expandida}
      aria-label={expandida ? 'Colapsar la orden' : 'Expandir la orden'}
      onClick={(e) => {
        // El contenedor ya alterna al hacer clic; sin esto se alternaria dos
        // veces y la fila no se movería.
        e.stopPropagation()
        onAlternar()
      }}
      className="text-ink-faint hover:text-ink shrink-0 rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {expandida ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
    </button>
  )
}

/** Lo que identifica a la orden, compartido por las dos presentaciones. */
function ResumenOrden({
  orden,
  marcarEstado,
  onAbrir,
}: {
  orden: OrdenPendiente
  marcarEstado: boolean
  onAbrir: (codigo: string) => void
}) {
  const pendientes = orden.lineas.length - orden.lineasImpresas
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={(e) => {
          // Sin esto, abrir la ficha también alternaría el colapso de la fila.
          e.stopPropagation()
          onAbrir(orden.codigo)
        }}
        className="text-accent-brand font-mono text-sm font-semibold underline-offset-2 hover:underline"
      >
        {orden.codigo}
      </button>
      <span className="text-sm font-medium text-ink">{orden.cliente ?? 'Sin cliente'}</span>
      {orden.lineaProducto && <Badge variant="secondary">{orden.lineaProducto}</Badge>}
      <span className="text-ink-faint text-xs">
        OC: {orden.ordenCompra ?? '—'} · Compromiso: {fechaCorta(orden.fechaCompromiso)} ·{' '}
        {orden.lineas.length} línea(s)
        {marcarEstado && pendientes > 0 && orden.lineasImpresas > 0 && (
          <> · {orden.lineasImpresas} impresa(s), {pendientes} pendiente(s)</>
        )}
      </span>
    </div>
  )
}

function FilasDeOrden({
  orden,
  tallas,
  marcarEstado,
  expandida,
  onAlternar,
  onAbrir,
}: {
  orden: OrdenPendiente
  tallas: string[]
  marcarEstado: boolean
  expandida: boolean
  onAlternar: () => void
  onAbrir: (codigo: string) => void
}) {
  return (
    <>
      {/* Cabecera de la OP: lo que es de la orden y no de cada línea. Toda la
          fila alterna el colapso — un objetivo de clic chico sería peor que no
          tenerlo. */}
      <TableRow
        className="cursor-pointer bg-black/[0.03] hover:bg-black/[0.05] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
        onClick={onAlternar}
      >
        <TableCell colSpan={4 + tallas.length} className="py-2">
          <div className="flex items-center gap-2">
            <BotonColapsar expandida={expandida} onAlternar={onAlternar} />
            <ResumenOrden orden={orden} marcarEstado={marcarEstado} onAbrir={onAbrir} />
          </div>
        </TableCell>
        <TableCell className="px-1 text-right text-sm font-semibold tabular-nums">
          {orden.totalPiezas.toLocaleString('es-GT')}
        </TableCell>
      </TableRow>

      {expandida &&
        orden.lineas.map((l) => (
          <TableRow
            key={l.idLineaProduccion}
            className={cn(marcarEstado && l.impresa && 'opacity-60')}
          >
            <TableCell className="font-mono text-xs break-all whitespace-normal">
              {l.codigoLine}
              {marcarEstado && (
                <Badge
                  variant={l.impresa ? 'secondary' : 'outline'}
                  className="mt-1 block w-fit text-[10px]"
                >
                  {l.impresa ? 'Impresa' : 'Pendiente'}
                </Badge>
              )}
            </TableCell>
            <TableCell className="break-words whitespace-normal">
              <div className="font-medium">{l.producto}</div>
              <div className="text-muted-foreground text-xs">{l.productoDescripcion}</div>
            </TableCell>
            <TableCell className="text-sm">{l.impresora ?? '—'}</TableCell>
            <TableCell className="text-sm">{fechaCorta(l.fechaCliente)}</TableCell>
            {tallas.map((t) => (
              <TableCell key={t} className="px-1 text-right text-sm tabular-nums">
                {/* Vacío y no 0: un cero invita a leerlo como "se pidieron cero",
                    cuando lo cierto es que esa talla no va en esta línea. */}
                {l.cantidades[t] ?? ''}
              </TableCell>
            ))}
            <TableCell className="px-1 text-right text-sm font-medium tabular-nums">
              {l.total}
            </TableCell>
          </TableRow>
        ))}
    </>
  )
}

function TarjetaOrden({
  orden,
  tallas,
  marcarEstado,
  expandida,
  onAlternar,
  onAbrir,
}: {
  orden: OrdenPendiente
  tallas: string[]
  marcarEstado: boolean
  expandida: boolean
  onAlternar: () => void
  onAbrir: (codigo: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      {/* <div> y no <button>: adentro va el código de OP, que ya es un botón. */}
      <div
        onClick={onAlternar}
        className="flex w-full cursor-pointer items-start gap-2 bg-black/[0.03] p-3 text-left hover:bg-black/[0.05] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
      >
        <span className="mt-0.5">
          <BotonColapsar expandida={expandida} onAlternar={onAlternar} />
        </span>
        <ResumenOrden orden={orden} marcarEstado={marcarEstado} onAbrir={onAbrir} />
        <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
          {orden.totalPiezas.toLocaleString('es-GT')}
        </span>
      </div>

      {expandida && (
        <ul className="divide-y divide-border">
          {orden.lineas.map((l) => (
            <li
              key={l.idLineaProduccion}
              className={cn('space-y-1 p-3', marcarEstado && l.impresa && 'opacity-60')}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs break-all">{l.codigoLine}</span>
                {marcarEstado && (
                  <Badge variant={l.impresa ? 'secondary' : 'outline'} className="text-[10px]">
                    {l.impresa ? 'Impresa' : 'Pendiente'}
                  </Badge>
                )}
                <span className="ml-auto text-sm font-semibold tabular-nums">{l.total}</span>
              </div>
              <div className="text-sm font-medium break-words">{l.producto}</div>
              <div className="text-muted-foreground text-xs break-words">
                {l.productoDescripcion}
              </div>
              <div className="text-ink-faint text-xs">
                {l.impresora ?? 'Sin impresora'} · Cliente: {fechaCorta(l.fechaCliente)}
              </div>
              {/* Las tallas como texto compacto en vez de columnas: una matriz de
                  15 columnas no entra en un teléfono. */}
              <div className="text-sm tabular-nums">{tallasEnLinea(l, tallas) || '—'}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
