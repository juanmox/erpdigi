import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { GrupoColapsable } from '@/components/shared/grupo-colapsable'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { GrupoImpresoraPendiente, OrdenPendiente } from '../types'

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

/** El control del papel en blanco: la casilla y su cantidad, siempre juntas. */
function ControlEnBlanco({
  orden,
  onEnBlanco,
  habilitado,
}: {
  orden: OrdenPendiente
  onEnBlanco: Props['onEnBlanco']
  habilitado: boolean
}) {
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
        value={orden.enBlancoYd}
        disabled={!habilitado || !orden.consumoEnBlanco}
        aria-label={`Yardas en blanco de ${orden.codigo}`}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= EN_BLANCO_MIN && n <= EN_BLANCO_MAX)
            onEnBlanco(orden, true, n)
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

        return (
          <GrupoColapsable
            key={g.idImpresora ?? 'sin-impresora'}
            titulo={
              <span className="flex flex-wrap items-center gap-2">
                <strong className="text-ink">{g.impresora}</strong>
                <span className="text-ink-faint text-xs">
                  {g.ordenes.length} orden(es) · {piezas.toLocaleString('es-GT')} pieza(s)
                </span>
              </span>
            }
            defaultAbierto
          >
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
              <Table className="min-w-[760px]">
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
                        <TableCell colSpan={9} className="p-3">
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
