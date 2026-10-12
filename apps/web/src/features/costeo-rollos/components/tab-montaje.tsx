import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GrupoColapsable } from '@/components/shared/grupo-colapsable'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { costeoRollosApi } from '../api'
import { codigoRollo } from '../codigo-rollo'
import type { Impresora, RolloPapel } from '../types'

// Pantalla táctil grande (PROMPT_CLAUDE_CODE.md §6.0): impresora → rollo →
// confirmar, con botones grandes para uso en planta, no en escritorio.
export function TabMontaje() {
  const queryClient = useQueryClient()
  const { data: impresoras } = useQuery({
    queryKey: ['costeo-rollos', 'impresoras'],
    queryFn: () => costeoRollosApi.listarImpresoras(),
  })
  const { data: panel } = useQuery({
    queryKey: ['costeo-rollos', 'panel'],
    queryFn: () => costeoRollosApi.panel(),
  })

  const [impresora, setImpresora] = useState<Impresora | null>(null)
  const { data: disponibles } = useQuery({
    queryKey: ['costeo-rollos', 'disponibles', impresora?.idImpresora],
    queryFn: () => costeoRollosApi.disponibles(impresora?.idImpresora),
    enabled: !!impresora,
  })

  const [rollo, setRollo] = useState<RolloPapel | null>(null)
  // Con ~190 rollos en bodega, una grilla plana obliga a barrer la pantalla
  // buscando un código. La búsqueda y el agrupado por tipo de papel son lo
  // que la vuelven usable; el orden del backend ya pone primero el papel
  // recomendado para la impresora elegida.
  const [busqueda, setBusqueda] = useState('')
  const [montando, setMontando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  // Devuelve el montaje y no un booleano: hace falta nombrar el rollo que
  // bloquea, para que el operario sepa cuál tiene que desmontar.
  const montajeDe = (idImpresora: number) =>
    panel?.find((p) => p.impresora.idImpresora === idImpresora)?.montaje ?? null
  const impresoraMontada = (idImpresora: number) => montajeDe(idImpresora) != null

  function elegirImpresora(i: Impresora) {
    setImpresora(i)
    setRollo(null)
    // Un filtro olvidado haría parecer que la impresora nueva no tiene rollos.
    setBusqueda('')
    setError(null)
    setExito(null)
  }

  const gruposDeRollos = useMemo(() => {
    if (!disponibles) return []
    const t = busqueda.trim().toLowerCase()
    const filtrados = t
      ? disponibles.filter(
          (r) =>
            codigoRollo(r).toLowerCase().includes(t) ||
            r.facturaPapel.numeroFactura.toLowerCase().includes(t) ||
            r.tipoPapel.nombre.toLowerCase().includes(t),
        )
      : disponibles
    const porTipo = new Map<number, { nombre: string; rollos: RolloPapel[] }>()
    for (const r of filtrados) {
      const g = porTipo.get(r.idTipoPapel) ?? { nombre: r.tipoPapel.nombre, rollos: [] }
      g.rollos.push(r)
      porTipo.set(r.idTipoPapel, g)
    }
    const recomendado = impresora?.idTipoPapelDefault ?? null
    // El papel recomendado para esta impresora va primero: es el que se va a
    // elegir casi siempre, y dejarlo mezclado alfabéticamente es justamente lo
    // que obligaba a buscar.
    return [...porTipo.entries()].sort(([a, ga], [b, gb]) => {
      if (a === recomendado) return -1
      if (b === recomendado) return 1
      return ga.nombre.localeCompare(gb.nombre, 'es')
    })
  }, [disponibles, busqueda, impresora])

  function volver() {
    setImpresora(null)
    setRollo(null)
    setError(null)
  }

  async function confirmar() {
    if (!impresora || !rollo) return
    setMontando(true)
    setError(null)
    try {
      await costeoRollosApi.montar(rollo.idRolloPapel, impresora.idImpresora)
      setExito(`Rollo montado en ${impresora.codigo}`)
      queryClient.invalidateQueries({ queryKey: ['costeo-rollos'] })
      setImpresora(null)
      setRollo(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al montar el rollo')
    } finally {
      setMontando(false)
    }
  }

  if (exito && !impresora) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/15 text-3xl text-emerald-600">✓</div>
        <p className="text-lg font-medium text-ink">{exito}</p>
        <Button size="lg" onClick={() => setExito(null)}>
          Montar otro rollo
        </Button>
      </div>
    )
  }

  if (!impresora) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-ink-muted">1. Elegí la impresora</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {impresoras?.map((i) => {
            // Desde el 2026-10-09 el servidor RECHAZA montar sobre una
            // impresora ocupada: hay que desmontar primero, diciendo en qué
            // estado queda el rollo. Deshabilitarla acá evita llevar al
            // operario hasta el paso 2 para recién ahí fallar.
            const ocupada = montajeDe(i.idImpresora)
            return (
              <button
                key={i.idImpresora}
                type="button"
                disabled={ocupada != null}
                onClick={() => elegirImpresora(i)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border p-5 text-center transition-colors',
                  ocupada
                    ? 'cursor-not-allowed border-border bg-black/[0.03] opacity-70 dark:bg-white/[0.04]'
                    : 'border-border bg-card hover:border-accent-brand hover:bg-accent-brand-soft active:scale-[0.98]',
                )}
                title={
                  ocupada
                    ? `Tiene montado el rollo ${codigoRollo(ocupada.rolloPapel)}. Desmontalo desde el Panel de estado.`
                    : undefined
                }
              >
                <span className="font-mono text-lg font-bold text-ink">{i.codigo}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                    ocupada ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-700',
                  )}
                >
                  {ocupada ? 'Con rollo' : 'Libre'}
                </span>
                {ocupada && (
                  <span className="text-ink-faint font-mono text-[10px] break-all">
                    {codigoRollo(ocupada.rolloPapel)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (!rollo) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-muted">
            2. Elegí el rollo para <span className="font-mono font-semibold text-ink">{impresora.codigo}</span>
          </h2>
          <Button variant="outline" size="sm" onClick={volver}>
            Cambiar impresora
          </Button>
        </div>
        {impresoraMontada(impresora.idImpresora) && (
          <Alert variant="destructive">
            <AlertDescription>
              Esta impresora ya tiene montado el rollo{' '}
              <strong>{codigoRollo(montajeDe(impresora.idImpresora)!.rolloPapel)}</strong>. Desmontalo
              primero desde el <strong>Panel de estado</strong>, diciendo en qué estado queda; recién
              después se puede montar otro.
            </AlertDescription>
          </Alert>
        )}
        <div>
          <Label className="mb-1 block text-xs">Buscar rollo, factura o tipo de papel</Label>
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="777-10-3, TEXTPRINT…"
            className="max-w-xs"
          />
        </div>

        {!disponibles?.length && (
          <p className="text-sm text-ink-faint">No hay rollos disponibles en bodega.</p>
        )}
        {!!disponibles?.length && gruposDeRollos.length === 0 && (
          <p className="text-sm text-ink-faint">
            Ningún rollo coincide con &ldquo;{busqueda}&rdquo;.
          </p>
        )}

        <div className="space-y-2">
          {gruposDeRollos.map(([idTipo, g], i) => (
            <GrupoColapsable
              // `defaultAbierto` solo se lee al montar, así que la key incluye
              // si hay búsqueda activa: sin eso, filtrar dejaría los resultados
              // escondidos detrás de un clic.
              key={`${idTipo}-${busqueda ? 'filtrado' : 'todo'}`}
              // Con búsqueda, todo abierto. Sin búsqueda, solo el primer grupo
              // —el papel recomendado para esta impresora—, que es el que se
              // usa casi siempre.
              defaultAbierto={!!busqueda || i === 0}
              titulo={
                <span className="normal-case">
                  {g.nombre}
                  <span className="text-ink-faint font-normal">
                    {' '}
                    · {g.rollos.length} rollo(s)
                    {idTipo === impresora.idTipoPapelDefault && (
                      <> · recomendado para {impresora.codigo}</>
                    )}
                  </span>
                </span>
              }
            >
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {g.rollos.map((r) => (
                  <button
                    key={r.idRolloPapel}
                    type="button"
                    onClick={() => setRollo(r)}
                    className="flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-accent-brand hover:bg-accent-brand-soft active:scale-[0.98]"
                  >
                    <span className="font-mono text-base font-bold text-ink">{codigoRollo(r)}</span>
                    <span className="text-sm text-ink-muted">{r.tipoPapel.nombre}</span>
                    {r.yardasIniciales && (
                      <span className="text-xs text-ink-faint">{r.yardasIniciales} yd</span>
                    )}
                  </button>
                ))}
              </div>
            </GrupoColapsable>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-8 text-center">
      <h2 className="text-sm font-medium text-ink-muted">3. Confirmar</h2>
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="text-sm text-ink-muted">Impresora</div>
        <div className="mb-3 font-mono text-xl font-bold text-ink">{impresora.codigo}</div>
        <div className="text-sm text-ink-muted">Rollo</div>
        <div className="font-mono text-xl font-bold text-ink">
          {codigoRollo(rollo)}
        </div>
        <div className="text-sm text-ink-muted">{rollo.tipoPapel.nombre}</div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="flex-1" onClick={() => setRollo(null)}>
          Cambiar rollo
        </Button>
        <Button size="lg" className="flex-1" disabled={montando} onClick={confirmar}>
          {montando ? 'Montando…' : 'Confirmar montaje'}
        </Button>
      </div>
    </div>
  )
}
