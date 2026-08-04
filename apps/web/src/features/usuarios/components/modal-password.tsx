import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { usuariosApi } from '../api'
import type { UsuarioAdmin } from '../types'

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%'

function generarPassword(): string {
  const valores = new Uint32Array(14)
  crypto.getRandomValues(valores)
  return Array.from(valores, (v) => ALFABETO[v % ALFABETO.length]).join('')
}

interface ModalPasswordProps {
  usuario: UsuarioAdmin | null
  esPropio: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModalPassword({ usuario, esPropio, open, onOpenChange }: ModalPasswordProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirmar('')
      setError(null)
    }
  }, [open])

  function generar() {
    const nueva = generarPassword()
    setPassword(nueva)
    setConfirmar(nueva)
  }

  async function guardar() {
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await usuariosApi.establecerPassword(usuario!.idUsuario, password)
      if (esPropio) {
        // El reset revoca todas las sesiones del usuario, incluida la propia — si no
        // cerramos sesión explícitamente acá, el admin sigue "logueado" con el access
        // token en memoria (dura 15 min) hasta que el refresh silencioso falle solo,
        // sin ninguna explicación visible.
        await logout()
        navigate('/login', { replace: true })
        return
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al establecer la contraseña')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Restablecer contraseña — {usuario?.nombreCompleto}</DialogTitle>
        </DialogHeader>

        {esPropio && (
          <Alert>
            <AlertDescription>
              Es tu propia cuenta — al confirmar se cierra tu sesión actual y vas a tener que
              volver a iniciar sesión con la contraseña nueva.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Contraseña nueva</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Confirmar contraseña</Label>
            <Input type="text" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={generar}>
            Generar automáticamente
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Establecer contraseña'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
