import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { GrupoColapsable } from '@/components/shared/grupo-colapsable'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type {
  GrupoImpresoraPendiente,
  OcupacionImpresora,
  OrdenPendiente,
  RolloDelGrupo,
} from '../types'

/**
 * Rango permitido del papel en blanco. Es el mismo que impone el CHECK de la
 * base y el DTO: tenerlo acá es solo para que el `<input>` no deje escribir
 * algo que el servidor va a rechazar igual.
 */
export const EN_BLANCO_MIN = 2
export const EN_BLANCO_MAX = 10

interface Props {
  grupos: GrupoImpresoraPendiente[]
  /** Códigos de OP seleccionadas para enviar. */
  seleccionadas: Set<string>
  onAlternarOrden: (codigo: string) => void
  onAlternarGrupo: (grupo: GrupoImpresoraPendiente, marcar: boolean) => void
  /** Códigos de OP expandidas; el detalle lo renderiza el padre. */
  expandidas: Set<string>
  onAlternarDetalle: (codigo: string) => void
  renderDetalle: (orden: OrdenPendiente) => React.ReactNode
  onEnBlanco: (orden: OrdenPendiente, marcado: boolean, yardas: number) => void
  puedeMarcarEnBlanco: boolean
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' }) : '—'

/**
 * "hace 12 min" en vez de una hora absoluta: para decidir si la máquina sigue
 * ocupada, lo que importa es cuán reciente es la actividad, no a qué hora fue.
 */
function hace(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return `hace ${h} h ${min % 60} min`
}

/**
 * Aviso de que otro operario viene usando esta impresora.
 *
 * Es informativo: no bloquea nada acá. El tope real lo aplica el servidor al
 * enviar, y desde el resumen se confirma. Mostrarlo en el encabezado sirve para
 * que el operario lo sepa ANTES de seleccionar media cola.
 */
function AvisoOcupada({ ocupada }: { ocupada: OcupacionImpresora }) {
  return (
    <span
      className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-400"
      title={`${ocupada.usuario} — ${
        ocupada.via === 'CONSUMO' ? 'último envío' : 'montó el rollo'
      } ${new Date(ocupada.desde).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}`}
    >
      La usa {ocupada.usuario} · {ocupada.via === 'CONSUMO' ? 'envió' : 'montó'}{' '}
      {hace(ocupada.desde)}
    </span>
  )
}

const yd = (n: number) => n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * El rollo que está montado en esa impresora, en el encabezado del grupo.
 *
 * Va acá y no escondido en otra pantalla porque es la pregunta que el operario
 * se hace ANTES de marcar media cola: "¿me alcanza el papel?". Sin rollo
 * montado no se puede enviar nada, así que ese caso se dice sin vueltas en vez
 * de dejar que el envío falle después.
 */
function EstadoRollo({ rollo }: { rollo: RolloDelGrupo | null }) {
  if (!rollo)
    return (
      <span className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
        Sin rollo montado
      </span>
    )
  const r = rollo.yardasRestantesEstimadas
  // Un restante NEGATIVO no es un error: el rollo rindió menos de lo que
  // declaraba el fabricante, y medir eso era justamente el objetivo. Se marca en
  // rojo —pedido explícito— pero no se corrige ni se arrastra al rollo siguiente.
  const negativo = r != null && r < 0
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[11px] ${
        negativo
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-border bg-muted/50 text-ink-faint'
      }`}
      title={`Rollo ${rollo.codigoRollo} · ${rollo.tipoPapel}${
        rollo.yardasIniciales != null ? ` · ${yd(rollo.yardasIniciales)} yd iniciales` : ''
      }`}
    >
      {rollo.tipoPapel} ·{' '}
      {r != null ? (
        <>
          <strong>{yd(r)} yd</strong>
          {rollo.porcentajeRestante != null && ` (${rollo.porcentajeRestante.toFixed(0)}%)`}
          {negativo && ' — rindió menos de lo declarado'}
        </>
      ) : (
        'sin yardas declaradas'
      )}
    </span>
  )
}

/**
 * Lo que la selección le va a sacar al rollo, contra lo que queda.
 *
 * Es un AVISO, no un bloqueo: el usuario confirmó que un rollo que no alcanza a
 * mitad del lote "no se da mucho", y cuando pasa lo que quiere es que quede
 * registrado —no que el sistema le impida trabajar—. Además el restante es un
 * estimado, así que impedir el envío por un número aproximado sería peor que
 * avisar.
 */
function ContrasteSeleccion({
  estimado,
  rollo,
}: {
  estimado: number
  rollo: RolloDelGrupo | null
}) {
  if (estimado <= 0) return null
  const r = rollo?.yardasRestantesEstimadas ?? null
  const noAlcanza = r != null && estimado > r
  return (
    <div
      className={`mb-2 rounded-md border px-2 py-1 text-xs ${
        noAlcanza
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'border-border bg-muted/40 text-ink-faint'
      }`}
    >
      Seleccionado: <strong>{yd(estimado)} yd</strong>
      {r != null ? (
        <>
          {' '}
          de {yd(r)} que quedan en el rollo
          {noAlcanza && (
            <>
              {' '}
              — <strong>no alcanza para todo el lote</strong> (faltan {yd(estimado - r)} yd). Se
              puede enviar igual; el rollo va a quedar en negativo y eso queda registrado.
            </>
          )}
        </>
      ) : // Los dos motivos por los que no hay con qué contrastar son distintos y
      // mandan a hacer cosas distintas: sin rollo hay que ir a montar uno, y un
      // rollo sin yardas declaradas es un dato que falta del ingreso a bodega.
      // Decir "el rollo no tiene yardas" cuando no hay rollo manda a buscar el
      // dato equivocado.
      !rollo ? (
        <> — no hay ningún rollo montado en esta impresora, así que no se puede enviar todavía.</>
      ) : (
        <> — el rollo {rollo.codigoRollo} no tiene yardas declaradas, no hay con qué contrastar.</>
      )}
    </div>
  )
}

/**
 * El control del papel en blanco: la casilla y su cantidad, siempre juntas.
 *
 * ⚠️ La cantidad se guarda al SALIR del campo (o con Enter), no en cada tecla.
 * Un primer diseño guardaba en cada `change`, y al probarlo se vio el costo
 * real: elegir 7 con las flechas disparó diez PATCH seguidos (4·2·6·7·8·9·10…).
 * Sobre una orden sin imprimir eso solo ensucia la auditoría, pero sobre una ya
 * impresa cada paso ANULA Y RECREA la fila de consumo, así que dejaría cinco
 * pares anulado/creado en el histórico para un solo cambio de opinión.
 */
function ControlEnBlanco({
  orden,
  onEnBlanco,
  habilitado,
}: {
  orden: OrdenPendiente
  onEnBlanco: Props['onEnBlanco']
  habilitado: boolean
}) {
  const [valor, setValor] = useState(String(orden.enBlancoYd))
  // El servidor es la fuente: si la cantidad cambia por fuera (otro refetch, o
  // un rechazo que revierte), el campo tiene que reflejarlo.
  useEffect(() => setValor(String(orden.enBlancoYd)), [orden.enBlancoYd])

  function confirmar() {
    const n = Number(valor)
    const valido = Number.isInteger(n) && n >= EN_BLANCO_MIN && n <= EN_BLANCO_MAX
    // Un valor fuera de rango no se manda: se descarta y vuelve el del
    // servidor, en vez de dejar al operario creyendo que guardó algo.
    if (!valido) return setValor(String(orden.enBlancoYd))
    if (n !== orden.enBlancoYd) onEnBlanco(orden, true, n)
  }

  return (
    <div className="flex items-center gap-1.5">
      <Checkbox
        checked={orden.consumoEnBlanco}
        disabled={!habilitado}
        aria-label={`Papel en blanco de ${orden.codigo}`}
        onCheckedChange={(c) => onEnBlanco(orden, c === true, orden.enBlancoYd)}
      />
      {/* La cantidad solo se habilita si está marcada: un número editable con
          la casilla apagada invita a creer que ya se cargó algo. */}
      <input
        type="number"
        min={EN_BLANCO_MIN}
        max={EN_BLANCO_MAX}
        step={1}
        value={valor}
        disabled={!habilitado || !orden.consumoEnBlanco}
        aria-label={`Yardas en blanco de ${orden.codigo}`}
        onChange={(e) => setValor(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        className="border-border bg-background text-ink h-7 w-12 rounded border px-1 text-center text-xs disabled:opacity-40"
      />
      <span className="text-ink-faint text-[11px]">yd</span>
    </div>
  )
}

export function TablaPendientes({
  grupos,
  seleccionadas,
  onAlternarOrden,
  onAlternarGrupo,
  expandidas,
  onAlternarDetalle,
  renderDetalle,
  onEnBlanco,
  puedeMarcarEnBlanco,
}: Props) {
  if (grupos.length === 0) return null

  return (
    <div className="space-y-3">
      {grupos.map((g) => {
        const todas = g.ordenes.every((o) => seleccionadas.has(o.codigo))
        const piezas = g.ordenes.reduce((a, o) => a + o.totalPiezas, 0)
        // Solo lo seleccionado EN ESTE grupo: el rollo es de esta máquina, así
        // que sumar la selección de las otras daría un contraste sin sentido.
        const estimadoSel = g.ordenes
          .filter((o) => seleccionadas.has(o.codigo))
          .reduce((a, o) => a + o.estimadoYd, 0)

        return (
          <GrupoColapsable
            key={g.idImpresora ?? 'sin-impresora'}
            titulo={
              <span className="flex flex-wrap items-center gap-2">
                <strong className="text-ink">{g.impresora}</strong>
                <span className="text-ink-faint text-xs">
                  {g.ordenes.length} orden(es) · {piezas.toLocaleString('es-GT')} pieza(s)
                </span>
                <EstadoRollo rollo={g.rollo} />
                {g.ocupadaPor && <AvisoOcupada ocupada={g.ocupadaPor} />}
              </span>
            }
            defaultAbierto
          >
            <ContrasteSeleccion estimado={estimadoSel} rollo={g.rollo} />

            <div className="mb-2 flex items-center gap-2 px-1">
              <Checkbox
                checked={todas}
                aria-label={`Seleccionar todas las órdenes de ${g.impresora}`}
                onCheckedChange={(c) => onAlternarGrupo(g, c === true)}
              />
              <span className="text-ink-faint text-xs">
                {todas ? 'Deseleccionar todas' : 'Seleccionar todas'}
              </span>
            </div>

            {/* Dos presentaciones de los mismos datos, no dos pantallas: la
                tabla de xl para arriba y tarjetas abajo. Esta pantalla es la
                única pensada para tablet y teléfono en planta, así que una
                tabla forzada ahí sería exactamente el scroll horizontal que ya
                se corrigió en Órdenes. */}
            <div className="hidden overflow-x-auto rounded-md border border-border xl:block">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-10" />
                    <TableHead>OP</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Orden de compra</TableHead>
                    <TableHead>Compromiso</TableHead>
                    <TableHead className="text-right">Líneas</TableHead>
                    <TableHead className="text-right">Piezas</TableHead>
                    <TableHead className="text-right">Estimado</TableHead>
                    <TableHead>En blanco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.ordenes.flatMap((o) => [
                    <TableRow key={o.codigo}>
                      <TableCell>
                        <Checkbox
                          checked={seleccionadas.has(o.codigo)}
                          aria-label={`Seleccionar ${o.codigo}`}
                          onCheckedChange={() => onAlternarOrden(o.codigo)}
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          aria-expanded={expandidas.has(o.codigo)}
                          aria-label={`Ver detalle de ${o.codigo}`}
                          onClick={() => onAlternarDetalle(o.codigo)}
                          className="text-ink-faint hover:text-ink"
                        >
                          {expandidas.has(o.codigo) ? (
                            <ChevronDownIcon className="size-4" />
                          ) : (
                            <ChevronRightIcon className="size-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => onAlternarDetalle(o.codigo)}
                          className="text-accent-brand font-mono text-xs font-medium hover:underline"
                        >
                          {o.codigo}
                        </button>
                      </TableCell>
                      <TableCell className="break-words whitespace-normal">{o.cliente ?? '—'}</TableCell>
                      <TableCell className="text-xs">{o.ordenCompra ?? '—'}</TableCell>
                      <TableCell className="text-xs">{fecha(o.fechaCompromiso)}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.lineas}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.totalPiezas}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {o.tallasSinEstandar.length > 0 ? (
                          // Sin estándar no hay estimado real, y mostrar el
                          // parcial haría creer que el rollo alcanza. Se nombra
                          // qué falta, que es además lo que impide enviarla.
                          <span
                            className="text-destructive"
                            title={`Faltan estándares: ${o.tallasSinEstandar.join(', ')}`}
                          >
                            falta estándar
                          </span>
                        ) : (
                          yd(o.estimadoYd)
                        )}
                      </TableCell>
                      <TableCell>
                        <ControlEnBlanco
                          orden={o}
                          onEnBlanco={onEnBlanco}
                          habilitado={puedeMarcarEnBlanco}
                        />
                      </TableCell>
                    </TableRow>,
                    // El detalle va en su PROPIA fila con colSpan, pegada a la
                    // de la orden. Antes se renderizaba después de la tabla
                    // entera: con 17 órdenes en un grupo, expandir la primera
                    // mostraba su detalle a 17 filas de distancia.
                    expandidas.has(o.codigo) ? (
                      <TableRow key={`${o.codigo}-detalle`} className="bg-black/[0.02] dark:bg-white/[0.03]">
                        <TableCell colSpan={10} className="p-3">
                          {renderDetalle(o)}
                        </TableCell>
                      </TableRow>
                    ) : null,
                  ])}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2 xl:hidden">
              {g.ordenes.map((o) => (
                <div key={o.codigo} className="rounded-md border border-border p-2.5">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={seleccionadas.has(o.codigo)}
                      aria-label={`Seleccionar ${o.codigo}`}
                      onCheckedChange={() => onAlternarOrden(o.codigo)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        aria-expanded={expandidas.has(o.codigo)}
                        onClick={() => onAlternarDetalle(o.codigo)}
                        className="flex w-full items-center gap-1.5 text-left"
                      >
                        {expandidas.has(o.codigo) ? (
                          <ChevronDownIcon className="text-ink-faint size-4 shrink-0" />
                        ) : (
                          <ChevronRightIcon className="text-ink-faint size-4 shrink-0" />
                        )}
                        <span className="text-accent-brand font-mono text-xs font-medium">{o.codigo}</span>
                        <Badge variant="secondary" className="ml-auto shrink-0">
                          {o.totalPiezas} pz
                        </Badge>
                      </button>
                      <div className="text-ink-faint mt-1 text-[11px]">
                        {o.cliente ?? '—'} · OC {o.ordenCompra ?? '—'} · {o.lineas} línea(s) ·
                        compromiso {fecha(o.fechaCompromiso)}
                      </div>
                      <div className="mt-0.5 text-[11px]">
                        {o.tallasSinEstandar.length > 0 ? (
                          <span className="text-destructive">
                            falta estándar: {o.tallasSinEstandar.join(', ')}
                          </span>
                        ) : (
                          <span className="text-ink-faint">
                            estimado <strong>{yd(o.estimadoYd)} yd</strong>
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <ControlEnBlanco
                          orden={o}
                          onEnBlanco={onEnBlanco}
                          habilitado={puedeMarcarEnBlanco}
                        />
                      </div>
                    </div>
                  </div>
                  {expandidas.has(o.codigo) && <div className="mt-2">{renderDetalle(o)}</div>}
                </div>
              ))}
            </div>

          </GrupoColapsable>
        )
      })}
    </div>
  )
}
