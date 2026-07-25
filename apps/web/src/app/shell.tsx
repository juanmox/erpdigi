import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'

export function Shell() {
  const { usuario, empresasDisponibles, idEmpresa, roles, logout, tienePermiso } = useAuth()
  const empresaActual = empresasDisponibles.find((e) => e.idEmpresa === idEmpresa)
  const puedeGestionar =
    tienePermiso('recetas.insumos.editar') || tienePermiso('recetas.productos.editar') || tienePermiso('recetas.importar')

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <div>
            <p className="font-semibold">Digitexsa ERP</p>
            {empresaActual && (
              <p className="text-muted-foreground text-xs">{empresaActual.nombreComercial ?? empresaActual.codigo}</p>
            )}
          </div>
          <nav className="flex gap-4 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn('hover:text-primary', isActive ? 'text-primary font-medium' : 'text-muted-foreground')
              }
            >
              Cotización
            </NavLink>
            {puedeGestionar && (
              <NavLink
                to="/catalogo"
                className={({ isActive }) =>
                  cn('hover:text-primary', isActive ? 'text-primary font-medium' : 'text-muted-foreground')
                }
              >
                Gestión de datos
              </NavLink>
            )}
          </nav>
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
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
