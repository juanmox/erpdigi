import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatFechaLargaGuatemala } from '@digitexsa-erp/shared-utils'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { recetasApi } from '@/features/recetas/api'
import { MODULOS } from '@/app/modulos'

function StatCard({
  label,
  valor,
  nota,
  cargando,
}: {
  label: string
  valor: string
  nota?: ReactNode
  cargando?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[11.5px] font-semibold text-ink-muted">{label}</div>
      <div className="mt-2 font-mono text-[26px] font-bold tracking-tight text-ink">{cargando ? '—' : valor}</div>
      {nota && <div className="mt-1 text-xs text-ink-faint">{nota}</div>}
    </div>
  )
}

export function InicioPage() {
  const { usuario, roles, tienePermiso } = useAuth()
  const puedeVerCatalogo = tienePermiso('recetas.catalogo.ver')
  const puedeVerCotizaciones = tienePermiso('recetas.cotizaciones.ver')

  const tipoCambioQuery = useQuery({
    queryKey: ['inicio', 'tipo-cambio'],
    queryFn: () => recetasApi.tipoCambio(),
    enabled: puedeVerCatalogo,
  })

  const cotizacionesQuery = useQuery({
    queryKey: ['inicio', 'cotizaciones'],
    queryFn: () => recetasApi.listarCotizaciones(),
    enabled: puedeVerCotizaciones,
  })

  const ahora = new Date()
  const cotizaciones = cotizacionesQuery.data ?? []
  const cotizacionesDelMes = cotizaciones.filter((c) => {
    const f = new Date(c.fechaCreacion)
    return f.getFullYear() === ahora.getFullYear() && f.getMonth() === ahora.getMonth()
  })

  const tc = tipoCambioQuery.data

  return (
    <div className="mx-auto max-w-[1180px] px-6 py-7 lg:px-9">
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Panel de inicio</h1>
          <div className="mt-1 text-[13px] text-ink-muted">
            {formatFechaLargaGuatemala(ahora)}
            {usuario && <span className="ml-1 font-mono text-ink-faint">· {roles.join(', ') || 'Sin rol'}</span>}
          </div>
        </div>
      </div>

      {puedeVerCatalogo && (
        <div className="mb-7 max-w-xs">
          <StatCard
            label="Tipo de cambio"
            valor={tc?.tasa ? `Q${tc.tasa.toFixed(4)}` : '—'}
            nota={
              tc?.tasa ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2 py-0.5 text-[11px] font-semibold text-good before:size-[5px] before:rounded-full before:bg-current">
                  {tc.fuente ?? 'Banguat'}
                  {tc.fecha ? ` · ${tc.fecha}` : ''}
                </span>
              ) : undefined
            }
            cargando={tipoCambioQuery.isLoading}
          />
        </div>
      )}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[14.5px] font-bold text-ink">Módulos</h2>
        <span className="text-xs text-ink-faint">
          {MODULOS.filter((m) => m.activo).length} activo{MODULOS.filter((m) => m.activo).length === 1 ? '' : 's'} ·{' '}
          {MODULOS.filter((m) => !m.activo).length} en construcción
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {MODULOS.map((modulo) =>
          modulo.activo ? (
            <Link
              key={modulo.codigo}
              to={modulo.ruta!}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4.5 shadow-sm transition-[transform,border-color] hover:-translate-y-0.5 hover:border-accent-brand"
            >
              <div className="flex size-[34px] items-center justify-center rounded-[9px] bg-accent-brand text-xs font-bold text-white">
                {modulo.codigo}
              </div>
              <div>
                <div className="text-[15px] font-bold tracking-tight text-ink">{modulo.nombre}</div>
                <div className="mt-1 min-h-[34px] text-[12.5px] leading-snug text-ink-muted">{modulo.descripcion}</div>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-border/70 pt-2.5 text-xs">
                <span className="text-ink-muted">
                  {puedeVerCotizaciones ? (
                    <>
                      <span className="font-mono font-semibold text-ink">{cotizacionesDelMes.length}</span> cotizaciones
                    </>
                  ) : (
                    ' '
                  )}
                </span>
                <span className="font-bold text-accent-brand">Abrir →</span>
              </div>
            </Link>
          ) : (
            <div
              key={modulo.codigo}
              className="flex cursor-default flex-col gap-3 rounded-xl border border-dashed border-border p-4.5 opacity-70"
            >
              <div className="flex items-start justify-between">
                <div className="flex size-[34px] items-center justify-center rounded-[9px] bg-black/[0.04] text-xs font-bold text-ink-faint dark:bg-white/[0.06]">
                  {modulo.codigo}
                </div>
              </div>
              <div>
                <div className="text-[15px] font-bold tracking-tight text-ink">{modulo.nombre}</div>
                <div className="mt-1 min-h-[34px] text-[12.5px] leading-snug text-ink-muted">{modulo.descripcion}</div>
              </div>
              <div className={cn('mt-auto flex items-center justify-between border-t border-border/70 pt-2.5 text-xs')}>
                <span>&nbsp;</span>
                <span className="font-semibold text-ink-faint">Próximamente</span>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
