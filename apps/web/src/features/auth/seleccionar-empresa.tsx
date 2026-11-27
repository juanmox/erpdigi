import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ApiError, useAuth } from './auth-context'

// Color de marca de respaldo (el azul corporativo) para una empresa sin `color_marca`.
const COLOR_DEFECTO = '#203080'

export function SeleccionarEmpresa() {
  const { empresasDisponibles, seleccionarEmpresa, logout } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState<number | null>(null)

  async function elegir(idEmpresa: number) {
    setError(null)
    setEnviando(idEmpresa)
    try {
      await seleccionarEmpresa(idEmpresa)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo seleccionar la empresa')
    } finally {
      setEnviando(null)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Elegí una empresa</CardTitle>
          <CardDescription>
            Tu usuario tiene acceso a más de una empresa. Dentro de cada una vas a tener todos los
            roles que se te asignaron ahí, y podés cambiar de empresa sin cerrar sesión.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {empresasDisponibles.map((e) => {
            const color = e.colorMarca ?? COLOR_DEFECTO
            const nombre = e.nombreComercial ?? e.codigo
            return (
              <button
                key={e.idEmpresa}
                type="button"
                disabled={enviando !== null}
                onClick={() => elegir(e.idEmpresa)}
                // El filo y el tinte son del color de la empresa: es la misma señal
                // que ve después en la franja y el chip del encabezado, para que
                // "en qué empresa estoy" no dependa de leer un nombre.
                style={{ borderLeftColor: color, backgroundColor: `color-mix(in srgb, ${color} 7%, transparent)` }}
                className={cn(
                  'flex flex-col gap-2.5 rounded-lg border border-l-[6px] p-3.5 text-left transition-[box-shadow,transform] outline-none',
                  'hover:-translate-y-px hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:pointer-events-none disabled:opacity-60',
                  enviando === e.idEmpresa && 'ring-2 ring-ring',
                )}
              >
                <span className="flex min-h-[42px] items-center">
                  {e.logo ? (
                    // Con tope de alto y de ancho: los logos de las dos empresas tienen
                    // proporciones muy distintas (~5.8:1 y ~2:1).
                    <img src={e.logo} alt={nombre} className="max-h-[42px] max-w-[200px] object-contain" />
                  ) : (
                    <span className="text-lg font-bold tracking-tight">{nombre}</span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {/* El nombre va escrito aunque haya logo: una señal de color sola
                      no le sirve a quien no distingue bien los colores. */}
                  <span className="text-sm font-semibold">{e.logo ? nombre : (e.razonSocial ?? '')}</span>
                </span>
                {/* Los roles se listan como información, no como opciones: entrar a
                    la empresa da todos a la vez. */}
                <span className="flex flex-wrap gap-1.5">
                  {e.roles.map((rol) => (
                    <span
                      key={rol}
                      className="text-muted-foreground rounded-full border bg-background/70 px-2 py-0.5 text-[11px] font-medium"
                    >
                      {rol}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button variant="ghost" onClick={() => logout()}>
            Cancelar
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
