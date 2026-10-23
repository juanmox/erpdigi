import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { avisarError } from '@/lib/avisos'

/**
 * Confirmación genérica para eliminar un ítem o una OP entera. Sin motivo:
 * el backend solo deja eliminar lo que no tiene ninguna historia real detrás
 * (consumo, reposición, OF), así que no hay nada que justificar — y lo poco
 * que sí había queda en la auditoría de todos modos.
 */
export function ModalConfirmarEliminar({
  open,
  onOpenChange,
  titulo,
  descripcion,
  onConfirmar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  descripcion: string
  /** Hace el borrado real; el modal lo cierra y avisa por él. */
  onConfirmar: () => Promise<void>
}) {
  const [eliminando, setEliminando] = useState(false)

  async function confirmar() {
    setEliminando(true)
    try {
      await onConfirmar()
      onOpenChange(false)
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'No se pudo eliminar')
    } finally {
      setEliminando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion} Esto no se puede deshacer.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={eliminando} onClick={() => void confirmar()}>
            {eliminando ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
