import { Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { Sidebar } from './sidebar'

function inicialesDe(nombre: string | undefined): string {
  if (!nombre) return '??'
  const partes = nombre.trim().split(/\s+/)
  const iniciales = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2)
  return iniciales.toUpperCase()
}

export function Shell() {
  const { usuario, roles, logout } = useAuth()

  return (
    <div className="flex min-h-svh bg-surface-paper">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-border px-6 py-2.5 lg:px-9">
          <div className="text-right leading-tight">
            <p className="text-[13px] font-semibold text-ink">{usuario?.nombreCompleto}</p>
            <p className="text-[11.5px] text-ink-faint">{roles.join(', ')}</p>
          </div>
          <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-accent-brand-soft text-[12.5px] font-bold text-accent-brand-strong">
            {inicialesDe(usuario?.nombreCompleto)}
          </div>
          <Button variant="outline" size="sm" onClick={() => logout()}>
            Cerrar sesión
          </Button>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
