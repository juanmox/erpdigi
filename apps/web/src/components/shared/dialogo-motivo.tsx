import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/**
 * Confirmación de una acción que exige explicar por qué (devolver, anular…).
 * El motivo es obligatorio (mínimo 3 caracteres, igual que en el servidor).
 */
export function DialogoMotivo({
  abierto,
  titulo,
  descripcion,
  textoConfirmar,
  peligroso,
  placeholder,
  pendiente,
  onCerrar,
  onConfirmar,
  children,
}: {
  abierto: boolean
  titulo: string
  descripcion: React.ReactNode
  textoConfirmar: string
  peligroso?: boolean
  placeholder?: string
  pendiente: boolean
  onCerrar: () => void
  onConfirmar: (motivo: string) => void
  /** Contenido adicional entre la descripción y el motivo. */
  children?: React.ReactNode
}) {
  const [motivo, setMotivo] = useState('')
  useEffect(() => {
    if (abierto) setMotivo('')
  }, [abierto])

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !pendiente && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        {children}
        <div>
          <Label htmlFor="dialogo-motivo" className="mb-1 block text-xs">
            Motivo (obligatorio)
          </Label>
          <Textarea
            id="dialogo-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={pendiente}>
            Cancelar
          </Button>
          <Button
            variant={peligroso ? 'destructive' : 'default'}
            disabled={motivo.trim().length < 3 || pendiente}
            onClick={() => onConfirmar(motivo.trim())}
          >
            {pendiente ? 'Aplicando…' : textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
