import { useQueryClient } from '@tanstack/react-query'
import { Building2Icon, CheckIcon, LogOutIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'
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
import { useInactividad } from '@/features/auth/use-inactividad'
import { Button } from '@/components/ui/button'
import { Sidebar } from './sidebar'

function inicialesDe(nombre: string | undefined): string {
  if (!nombre) return '??'
  const partes = nombre.trim().split(/\s+/)
  const iniciales = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2)
  return iniciales.toUpperCase()
}

export function Shell() {
  const { usuario, roles, idEmpresa, empresasDisponibles, seleccionarEmpresa, logout, tienePermiso } =
    useAuth()
  const puedeAdministrarUsuarios = tienePermiso('plataforma.usuarios.administrar')
  const puedeAdministrarRoles = tienePermiso('plataforma.roles.administrar')
  const empresaActual = empresasDisponibles.find((e) => e.idEmpresa === idEmpresa)
  const colorEmpresa = empresaActual?.colorMarca ?? undefined
  const queryClient = useQueryClient()
  const [cambiandoEmpresa, setCambiandoEmpresa] = useState(false)

  // Cierre por inactividad. Va en el Shell y no en cada página porque envuelve
  // todo lo autenticado: una sola instancia cuenta para la aplicación entera.
  const { minutosInactividad } = useAuth()
  const { segundosRestantes, seguirConectado } = useInactividad(
    minutosInactividad,
    !!usuario,
    () => void logout(),
  )
  // Cambiar de empresa sin cerrar sesión: `seleccionarEmpresa` reemite el token
  // con los permisos de la empresa nueva. Antes el único camino era salir y
  // volver a entrar.
  async function cambiarEmpresa(id: number) {
    if (id === idEmpresa || cambiandoEmpresa) return
    setCambiandoEmpresa(true)
    try {
      await seleccionarEmpresa(id)
      // Los datos en caché son de la empresa anterior.
      queryClient.clear()
    } finally {
      setCambiandoEmpresa(false)
    }
  }

  return (
    <div className="flex min-h-svh bg-surface-paper">
      {/* Aviso antes de cerrar: sin él, alguien que estaba leyendo una pantalla
          o con un formulario a medio llenar pierde el trabajo sin entender por
          qué. El botón devuelve el contador a cero sin tocar nada más. */}
      {segundosRestantes != null && (
        <div
          role="alertdialog"
          aria-live="assertive"
          className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-3 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm backdrop-blur"
        >
          <span className="text-ink">
            Tu sesión se va a cerrar en <strong>{segundosRestantes}s</strong> por inactividad.
          </span>
          <Button size="sm" onClick={seguirConectado}>
            Seguir conectado
          </Button>
        </div>
      )}
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Franja del color de la empresa activa, a todo el ancho y arriba de
            todo. Es la señal periférica: se ve aunque no se esté mirando el
            encabezado, y cambia entera al cambiar de empresa. */}
        <div className="h-1 shrink-0 bg-accent-brand" style={colorEmpresa ? { backgroundColor: colorEmpresa } : undefined} />
        <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-2.5 lg:px-9">
          {/* Chip con el nombre de la empresa, teñido con su color. Redundante
              con la franja a propósito: una señal de color sola no sirve para
              quien no distingue bien los colores, así que el nombre va escrito. */}
          {empresaActual && (
            <div
              className="flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1"
              style={
                colorEmpresa
                  ? { borderColor: `${colorEmpresa}40`, backgroundColor: `${colorEmpresa}14` }
                  : undefined
              }
            >
              <span
                className="size-2 shrink-0 rounded-full bg-accent-brand"
                style={colorEmpresa ? { backgroundColor: colorEmpresa } : undefined}
              />
              <span className="truncate text-[12.5px] font-semibold text-ink">
                {empresaActual.nombreComercial ?? empresaActual.codigo}
              </span>
            </div>
          )}
          <div className="ml-auto min-w-0 text-right leading-tight">
            <p className="truncate text-[13px] font-semibold text-ink">{usuario?.nombreCompleto}</p>
            {/* Un usuario con 3 roles da una línea larga; se recorta en vez de
                empujar el encabezado, y el listado completo queda en el title. */}
            <p className="truncate text-[11.5px] text-ink-faint" title={roles.join(', ')}>
              {roles.join(', ')}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-accent-brand-soft text-[12.5px] font-bold text-accent-brand-strong outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {inicialesDe(usuario?.nombreCompleto)}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-semibold text-ink">{usuario?.nombreCompleto}</p>
                <p className="text-xs text-ink-faint">{usuario?.username}</p>
              </DropdownMenuLabel>
              {empresasDisponibles.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-ink-faint text-xs font-normal">
                    Empresa
                  </DropdownMenuLabel>
                  {empresasDisponibles.map((e) => (
                    <DropdownMenuItem
                      key={e.idEmpresa}
                      disabled={cambiandoEmpresa}
                      onSelect={() => void cambiarEmpresa(e.idEmpresa)}
                    >
                      {e.idEmpresa === idEmpresa ? <CheckIcon /> : <Building2Icon />}
                      {e.nombreComercial ?? e.codigo}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {(puedeAdministrarUsuarios || puedeAdministrarRoles) && (
                <>
                  <DropdownMenuSeparator />
                  {puedeAdministrarUsuarios && (
                    <DropdownMenuItem asChild>
                      <Link to="/usuarios">
                        <UsersIcon />
                        Usuarios
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {puedeAdministrarRoles && (
                    <DropdownMenuItem asChild>
                      <Link to="/roles">
                        <ShieldCheckIcon />
                        Roles y permisos
                      </Link>
                    </DropdownMenuItem>
                  )}
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
