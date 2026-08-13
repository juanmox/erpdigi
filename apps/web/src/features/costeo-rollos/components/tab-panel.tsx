import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { GrupoColapsable } from '@/components/shared/grupo-colapsable'
import { cn } from '@/lib/utils'
import { costeoRollosApi } from '../api'
import type { PanelItem } from '../types'
import { ModalDesmontaje } from './modal-desmontaje'

// Orden fijo a pedido del usuario (sesión F3): MS 1-6 + MP 7-8 primero, luego
// RG NEXT/ONE + Mimaki — nunca alfabético. El backend ya devuelve `panel` en
// este orden (Impresora.orden); acá solo se parte en las dos secciones
// colapsables por Impresora.grupo.
const GRUPOS: { clave: string; titulo: string }[] = [
  { clave: 'MS_DT', titulo: 'Impresoras MS DT' },
  { clave: 'DP', titulo: 'Impresoras DP' },
]

// No hay una regla de negocio confirmada de "cuánto papel restante es poco"
// (ver DesmontarMontajeDto) — estos cortes son solo estilo visual del panel,
// no se envían al backend ni afectan ningún cálculo.
function colorRestante(pct: number | null): string {
  if (pct == null) return 'bg-black/10 dark:bg-white/10'
  if (pct <= 15) return 'bg-red-500'
  if (pct <= 40) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function TabPanel() {
  const { data: panel, isLoading } = useQuery({
    queryKey: ['costeo-rollos', 'panel'],
    queryFn: () => costeoRollosApi.panel(),
    refetchInterval: 30_000,
  })

  const [seleccionado, setSeleccionado] = useState<PanelItem | null>(null)

  if (isLoading) return <p className="text-sm text-ink-muted">Cargando panel…</p>

  return (
    <div className="space-y-4">
      {GRUPOS.map(({ clave, titulo }) => {
        const items = panel?.filter((item) => item.impresora.grupo === clave) ?? []
        if (items.length === 0) return null
        return (
          <GrupoColapsable key={clave} titulo={titulo}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <div key={item.impresora.idImpresora} className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-base font-semibold text-ink">{item.impresora.codigo}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        item.montaje ? 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400',
                      )}
                    >
                      {item.montaje ? 'Montado' : 'Libre'}
                    </span>
                  </div>

                  {item.montaje ? (
                    <div className="space-y-2.5">
                      <div>
                        <div className="font-mono text-sm text-ink">
                          {item.montaje.rolloPapel.facturaPapel.numeroFactura}-{item.montaje.rolloPapel.facturaPapel.totalRollos}-
                          {item.montaje.rolloPapel.secuencia}
                        </div>
                        <div className="text-xs text-ink-muted">{item.montaje.rolloPapel.tipoPapel.nombre}</div>
                      </div>

                      <div className="text-xs text-ink-muted">
                        Consumo: <span className="font-medium text-ink">{item.montaje.consumoTotalHistoricoRollo.toFixed(2)} yd</span>
                        {item.montaje.yardasRestantesEstimadas != null && (
                          <>
                            {' · '}Restante: <span className="font-medium text-ink">{item.montaje.yardasRestantesEstimadas.toFixed(2)} yd</span>
                          </>
                        )}
                      </div>

                      {item.montaje.porcentajeRestante != null && (
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                          <div
                            className={cn('h-full transition-all', colorRestante(item.montaje.porcentajeRestante))}
                            style={{ width: `${Math.max(0, Math.min(100, item.montaje.porcentajeRestante))}%` }}
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setSeleccionado(item)}
                        className="w-full rounded-md border border-border py-1.5 text-xs font-medium text-ink hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                      >
                        Desmontar
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-faint">Sin rollo montado</p>
                  )}
                </div>
              ))}
            </div>
          </GrupoColapsable>
        )
      })}

      <ModalDesmontaje
        item={seleccionado}
        open={!!seleccionado}
        onOpenChange={(open) => !open && setSeleccionado(null)}
        onDesmontado={() => setSeleccionado(null)}
      />
    </div>
  )
}
