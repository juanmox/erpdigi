import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'

export function Shell() {
  const { usuario, empresasDisponibles, idEmpresa, roles, logout } = useAuth()
  const empresaActual = empresasDisponibles.find((e) => e.idEmpresa === idEmpresa)

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <p className="font-semibold">Digitexsa ERP</p>
          {empresaActual && (
            <p className="text-muted-foreground text-xs">{empresaActual.nombreComercial ?? empresaActual.codigo}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p>{usuario?.nombreCompleto}</p>
            <p className="text-muted-foreground text-xs">{roles.join(', ')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => logout()}>
            Cerrar sesión
          </Button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground">Fase 1 — plataforma base lista. Los módulos de negocio llegan en fases siguientes.</p>
      </main>
    </div>
  )
}
