import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { costeoRollosApi } from '../api'
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
  const [montando, setMontando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  const impresoraMontada = (idImpresora: number) => panel?.some((p) => p.impresora.idImpresora === idImpresora && p.montaje)

  function elegirImpresora(i: Impresora) {
    setImpresora(i)
    setRollo(null)
    setError(null)
    setExito(null)
  }

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
          {impresoras?.map((i) => (
            <button
              key={i.idImpresora}
              type="button"
              onClick={() => elegirImpresora(i)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-5 text-center transition-colors hover:border-accent-brand hover:bg-accent-brand-soft active:scale-[0.98]"
            >
              <span className="font-mono text-lg font-bold text-ink">{i.codigo}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                  impresoraMontada(i.idImpresora) ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-700',
                )}
              >
                {impresoraMontada(i.idImpresora) ? 'Con rollo' : 'Libre'}
              </span>
            </button>
          ))}
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
          <Alert>
            <AlertDescription>
              Esta impresora ya tiene un rollo montado — al confirmar se cierra automáticamente ese montaje.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {disponibles?.length ? (
            disponibles.map((r) => (
              <button
                key={r.idRolloPapel}
                type="button"
                onClick={() => setRollo(r)}
                className="flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-accent-brand hover:bg-accent-brand-soft active:scale-[0.98]"
              >
                <span className="font-mono text-base font-bold text-ink">
                  {r.facturaPapel.numeroFactura}-{r.facturaPapel.totalRollos}-{r.secuencia}
                </span>
                <span className="text-sm text-ink-muted">{r.tipoPapel.nombre}</span>
                {r.yardasIniciales && <span className="text-xs text-ink-faint">{r.yardasIniciales} yd</span>}
              </button>
            ))
          ) : (
            <p className="text-sm text-ink-faint">No hay rollos disponibles en bodega.</p>
          )}
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
          {rollo.facturaPapel.numeroFactura}-{rollo.facturaPapel.totalRollos}-{rollo.secuencia}
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
