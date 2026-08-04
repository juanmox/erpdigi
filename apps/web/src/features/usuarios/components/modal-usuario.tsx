import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { usuariosApi } from '../api'

interface ModalUsuarioProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardado: () => void
}

export function ModalUsuario({ open, onOpenChange, onGuardado }: ModalUsuarioProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombreCompleto, setNombreCompleto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setEmail('')
      setPassword('')
      setNombreCompleto('')
      setError(null)
    }
  }, [open])

  async function guardar() {
    if (!email.trim() || !nombreCompleto.trim() || password.length < 8) {
      setError('Completa todos los campos — la contraseña debe tener al menos 8 caracteres')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await usuariosApi.crear({ email: email.trim(), password, nombreCompleto: nombreCompleto.trim() })
      onGuardado()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear el usuario')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
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
            <Label className="mb-1 block text-xs">Correo electrónico</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Contraseña inicial</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={guardando} onClick={guardar}>
            {guardando ? 'Creando…' : 'Crear usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
