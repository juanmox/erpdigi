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
          <CardDescription>Tu usuario tiene acceso a más de una empresa.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {empresasDisponibles.map((e) => (
            <Button
              key={e.idEmpresa}
              variant="outline"
              className="justify-between"
              disabled={enviando !== null}
              onClick={() => elegir(e.idEmpresa)}
            >
              <span>{e.nombreComercial ?? e.codigo}</span>
              <span className="text-muted-foreground text-xs">{e.rol}</span>
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
