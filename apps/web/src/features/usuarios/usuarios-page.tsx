import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { usuariosApi } from './api'
import { ModalPassword } from './components/modal-password'
import { ModalRoles } from './components/modal-roles'
import { ModalUsuario } from './components/modal-usuario'
import type { UsuarioAdmin } from './types'

export function UsuariosPage() {
  const { usuario: yo } = useAuth()
  const queryClient = useQueryClient()
  const { data: usuarios, isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => usuariosApi.listar(),
  })

  const [modalCrearAbierto, setModalCrearAbierto] = useState(false)
  const [usuarioPassword, setUsuarioPassword] = useState<UsuarioAdmin | null>(null)
  const [usuarioRoles, setUsuarioRoles] = useState<UsuarioAdmin | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['usuarios'] })
  }

  async function alternarActivo(u: UsuarioAdmin) {
    setMensaje(null)
    try {
      if (u.activo) await usuariosApi.desactivar(u.idUsuario)
      else await usuariosApi.activar(u.idUsuario)
      invalidar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al cambiar el estado' })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Usuarios</h1>
          <p className="text-sm text-ink-muted">{usuarios?.length ?? 0} usuarios registrados</p>
        </div>
        <Button size="sm" onClick={() => setModalCrearAbierto(true)}>
          Nuevo usuario
        </Button>
      </div>

      {mensaje && (
        <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{mensaje.texto}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Último acceso</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {usuarios?.map((u) => (
              <TableRow key={u.idUsuario}>
                <TableCell>
                  <div className="font-medium text-ink">
                    {u.nombreCompleto}
                    {u.idUsuario === yo?.idUsuario && <span className="ml-1.5 text-xs text-ink-faint">(vos)</span>}
                  </div>
                  <div className="text-xs text-ink-faint">{u.email}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.empresaRoles.length === 0 && <span className="text-xs text-ink-faint">Sin rol asignado</span>}
                    {u.empresaRoles.map((er) => (
                      <Badge key={er.idUsuarioEmpresaRol} variant="secondary">
                        {er.rol.nombre}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={u.activo ? 'default' : 'secondary'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
                </TableCell>
                <TableCell className="text-xs text-ink-muted">
                  {u.ultimoLoginEn ? new Date(u.ultimoLoginEn).toLocaleString('es-GT') : 'Nunca'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setUsuarioRoles(u)}>
                      Roles
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setUsuarioPassword(u)}>
                      Contraseña
                    </Button>
                    <Button variant="ghost" size="sm" disabled={u.idUsuario === yo?.idUsuario && u.activo} onClick={() => alternarActivo(u)}>
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ModalUsuario open={modalCrearAbierto} onOpenChange={setModalCrearAbierto} onGuardado={invalidar} />

      <ModalPassword
        usuario={usuarioPassword}
        esPropio={usuarioPassword?.idUsuario === yo?.idUsuario}
        open={usuarioPassword !== null}
        onOpenChange={(v) => !v && setUsuarioPassword(null)}
      />

      <ModalRoles
        usuario={usuarioRoles}
        open={usuarioRoles !== null}
        onOpenChange={(v) => !v && setUsuarioRoles(null)}
        onGuardado={invalidar}
      />
    </div>
  )
}
