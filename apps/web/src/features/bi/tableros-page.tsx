import { embedDashboard } from '@superset-ui/embedded-sdk'
import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { biApi, useTablerosBi } from './api'

/**
 * Tableros gerenciales (Apache Superset) incrustados en el ERP.
 *
 * El navegador nunca recibe credenciales de Superset: pide a la API del ERP un
 * "guest token" de corta vida para UN tablero, que ya trae fijada la empresa de
 * la sesión. Lo que se ve lo decide el servidor, no esta pantalla.
 */
export function TablerosPage() {
  const { idEmpresa } = useAuth()
  const { data, isLoading, error } = useTablerosBi()
  const [claveElegida, setClaveElegida] = useState<string | null>(null)
  const [errorEmbed, setErrorEmbed] = useState<string | null>(null)
  const montaje = useRef<HTMLDivElement>(null)

  const tableros = data?.tableros ?? []
  // Si el tablero elegido ya no está disponible (cambio de empresa o de
  // permisos), cae en el primero en vez de mostrar uno que el servidor negaría.
  const tablero = tableros.find((t) => t.clave === claveElegida) ?? tableros[0]
  const urlSuperset = data?.urlSuperset
  // Valores simples (no el objeto) para que el efecto solo se repita cuando de
  // verdad cambia el tablero mostrado.
  const uuid = tablero?.uuid
  const clave = tablero?.clave
  const titulo = tablero?.titulo
  const permiteDescarga = tablero?.permiteDescarga ?? false

  useEffect(() => {
    const punto = montaje.current
    if (!punto || !uuid || !clave || !urlSuperset) return
    let cancelado = false
    let desmontar: (() => void) | undefined
    setErrorEmbed(null)
    punto.replaceChildren()
    embedDashboard({
      id: uuid,
      supersetDomain: urlSuperset,
      mountPoint: punto,
      fetchGuestToken: async () => (await biApi.token(clave)).token,
      dashboardUiConfig: {
        hideTitle: true,
        // Un solo rol guest para todos en Superset: el menú de descarga se oculta
        // por pantalla a quien no tiene `costeo.dashboard.exportar` y siempre en
        // los tableros de costos.
        hideChartControls: !permiteDescarga,
        filters: { visible: true, expanded: true },
      },
      iframeTitle: titulo,
    })
      .then((e) => {
        if (cancelado) e.unmount()
        else desmontar = e.unmount
      })
      .catch((e: unknown) => {
        if (!cancelado) setErrorEmbed(e instanceof Error ? e.message : 'No se pudo abrir el dashboard')
      })
    return () => {
      cancelado = true
      desmontar?.()
      punto.replaceChildren()
    }
    // `idEmpresa` fuerza un acceso nuevo al cambiar de empresa: el token viejo
    // lleva la regla por fila de la anterior.
  }, [uuid, clave, titulo, urlSuperset, permiteDescarga, idEmpresa])

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboards</h1>
          {tablero && <p className="text-sm text-ink-muted">{tablero.descripcion}</p>}
        </div>
        {tableros.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Dashboards">
            {tableros.map((t) => (
              <Button
                key={t.clave}
                role="tab"
                aria-selected={t.clave === tablero?.clave}
                size="sm"
                variant={t.clave === tablero?.clave ? 'default' : 'outline'}
                onClick={() => setClaveElegida(t.clave)}
              >
                {t.titulo}
              </Button>
            ))}
          </div>
        )}
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Cargando…</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>No se pudo cargar la lista de dashboards.</AlertDescription>
        </Alert>
      )}
      {data && !data.configurado && (
        <Alert>
          <AlertDescription>
            Los dashboards todavía no están configurados en este servidor.
          </AlertDescription>
        </Alert>
      )}
      {data?.configurado && tableros.length === 0 && (
        <Alert>
          <AlertDescription>No tenés dashboards habilitados. Pedí acceso a un administrador.</AlertDescription>
        </Alert>
      )}
      {errorEmbed && (
        <Alert variant="destructive">
          <AlertDescription>
            Los dashboards no están disponibles en este momento. Intentá de nuevo en unos minutos.
          </AlertDescription>
        </Alert>
      )}

      {tablero && (
        <div
          ref={montaje}
          data-testid="tablero-embebido"
          // El SDK inserta un <iframe>; se estira al ancho y alto disponibles.
          className={cn(
            'h-[calc(100svh-11rem)] min-h-[520px] w-full overflow-hidden rounded-lg border border-black/10 bg-white',
            '[&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0',
          )}
        />
      )}
    </div>
  )
}
