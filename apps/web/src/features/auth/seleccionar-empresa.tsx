import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ApiError, useAuth } from './auth-context'

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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Elegí una empresa</CardTitle>
          <CardDescription>
            Tu usuario tiene acceso a más de una empresa. Dentro de cada una vas a tener todos los
            roles que se te asignaron ahí, y podés cambiar de empresa sin cerrar sesión.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {empresasDisponibles.map((e) => (
            <Button
              key={e.idEmpresa}
              variant="outline"
              className="h-auto flex-col items-start gap-0.5 py-2.5 text-left"
              disabled={enviando !== null}
              onClick={() => elegir(e.idEmpresa)}
            >
              <span className="font-medium">{e.nombreComercial ?? e.codigo}</span>
              {/* Los roles se listan como información, no como opciones: entrar a
                  la empresa da todos a la vez. */}
              <span className="text-muted-foreground text-xs whitespace-normal">
                {e.roles.join(' · ')}
              </span>
            </Button>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button variant="ghost" onClick={() => logout()}>
            Cancelar
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
