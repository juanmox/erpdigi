import { LogOutIcon, UsersIcon } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/auth-context'
import { Sidebar } from './sidebar'

function inicialesDe(nombre: string | undefined): string {
  if (!nombre) return '??'
  const partes = nombre.trim().split(/\s+/)
  const iniciales = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2)
  return iniciales.toUpperCase()
}

export function Shell() {
  const { usuario, roles, logout, tienePermiso } = useAuth()
  const puedeAdministrarUsuarios = tienePermiso('plataforma.usuarios.administrar')

  return (
    <div className="flex min-h-svh bg-surface-paper">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border px-6 py-2.5 lg:px-9">
          <div className="text-right leading-tight">
            <p className="text-[13px] font-semibold text-ink">{usuario?.nombreCompleto}</p>
            <p className="text-[11.5px] text-ink-faint">{roles.join(', ')}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-accent-brand-soft text-[12.5px] font-bold text-accent-brand-strong outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {inicialesDe(usuario?.nombreCompleto)}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-semibold text-ink">{usuario?.nombreCompleto}</p>
                <p className="text-xs text-ink-faint">@{usuario?.username}</p>
              </DropdownMenuLabel>
              {puedeAdministrarUsuarios && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/usuarios">
                      <UsersIcon />
                      Usuarios
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()}>
                <LogOutIcon />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
