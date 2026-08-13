import { useQuery } from '@tanstack/react-query'
import { GrupoColapsable } from '@/components/shared/grupo-colapsable'
import { costeoRollosApi } from '@/features/costeo-rollos/api'
import { cn } from '@/lib/utils'

interface PanelImpresorasProps {
  idImpresoraSeleccionada: string
  onSeleccionar: (idImpresora: number) => void
}

// Mismo orden/agrupación fijos que tab-panel.tsx (sesión F3, a pedido del
// usuario) — no alfabético.
const GRUPOS: { clave: string; titulo: string }[] = [
  { clave: 'MS_DT', titulo: 'Impresoras MS DT' },
  { clave: 'DP', titulo: 'Impresoras DP' },
]

export function PanelImpresoras({ idImpresoraSeleccionada, onSeleccionar }: PanelImpresorasProps) {
  const { data: panel } = useQuery({
    queryKey: ['costeo-rollos', 'panel'],
    queryFn: () => costeoRollosApi.panel(),
    refetchInterval: 30_000,
  })

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-ink-muted">Impresoras — click para elegir</p>
      {GRUPOS.map(({ clave, titulo }) => {
        const items = panel?.filter((item) => item.impresora.grupo === clave) ?? []
        if (items.length === 0) return null
        return (
          <GrupoColapsable key={clave} titulo={titulo}>
            <div className="space-y-1.5">
              {items.map((item) => {
                const seleccionada = idImpresoraSeleccionada === String(item.impresora.idImpresora)
                return (
                  <button
                    key={item.impresora.idImpresora}
                    type="button"
                    onClick={() => onSeleccionar(item.impresora.idImpresora)}
                    className={cn(
                      'w-full rounded-lg border p-2.5 text-left transition-colors',
                      seleccionada ? 'border-accent-brand bg-accent-brand-soft' : 'border-border hover:bg-black/[0.02] dark:hover:bg-white/[0.03]',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold text-ink">{item.impresora.codigo}</span>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase',
                          item.montaje
                            ? 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400',
                        )}
                      >
                        {item.montaje ? 'Montado' : 'Libre'}
                      </span>
                    </div>
                    {item.montaje ? (
                      <div className="mt-1 text-[11px] text-ink-muted">
                        <span className="font-mono">
                          {item.montaje.rolloPapel.facturaPapel.numeroFactura}-{item.montaje.rolloPapel.facturaPapel.totalRollos}-
                          {item.montaje.rolloPapel.secuencia}
                        </span>
                        <br />
                        {item.montaje.rolloPapel.tipoPapel.nombre}
                        {item.montaje.yardasRestantesEstimadas != null && ` · ${item.montaje.yardasRestantesEstimadas.toFixed(0)} yd`}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-ink-faint">Sin rollo montado</p>
                    )}
                  </button>
                )
              })}
            </div>
          </GrupoColapsable>
        )
      })}
    </div>
  )
}
