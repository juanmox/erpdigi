import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { usuariosApi } from '../api'
import type { UsuarioAdmin } from '../types'

interface ModalUsuarioProps {
  usuario: UsuarioAdmin | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardado: () => void
}

// Un solo modal para crear y editar — en modo edición (usuario != null) no
// pide contraseña (eso vive aparte en ModalPassword, con su propio manejo de
// revocación de sesiones). El usuario (no el email) es el identificador de
// login: idUsuario (inmutable) es lo que referencia todo el historial de
// transacciones, así que editar usuario o email acá no afecta ningún
// registro pasado.
export function ModalUsuario({ usuario, open, onOpenChange, onGuardado }: ModalUsuarioProps) {
  const editando = usuario !== null
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombreCompleto, setNombreCompleto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setUsername(usuario?.username ?? '')
      setEmail(usuario?.email ?? '')
      setNombreCompleto(usuario?.nombreCompleto ?? '')
      setPassword('')
      setError(null)
    }
  }, [open, usuario])

  async function guardar() {
    if (!username.trim() || !nombreCompleto.trim() || (!editando && password.length < 8)) {
      setError('Completa usuario y nombre — la contraseña debe tener al menos 8 caracteres')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      if (editando) {
        await usuariosApi.editar(usuario.idUsuario, {
          username: username.trim(),
          email: email.trim() || undefined,
          nombreCompleto: nombreCompleto.trim(),
        })
      } else {
        await usuariosApi.crear({
          username: username.trim(),
          email: email.trim() || undefined,
          password,
          nombreCompleto: nombreCompleto.trim(),
        })
      }
      onGuardado()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Error al ${editando ? 'editar' : 'crear'} el usuario`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Nombre completo</Label>
            <Input value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Usuario</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder="ej: juan, lissette"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Correo electrónico (opcional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {!editando && (
            <div>
              <Label className="mb-1 block text-xs">Contraseña inicial</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
