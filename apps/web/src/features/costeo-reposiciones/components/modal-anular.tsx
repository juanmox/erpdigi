import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { costeoReposicionesApi } from '../api'
import type { Reposicion } from '../types'

interface ModalAnularProps {
  reposicion: Reposicion | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAnulada: () => void
}

export function ModalAnular({ reposicion, open, onOpenChange, onAnulada }: ModalAnularProps) {
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar() {
    if (!reposicion) return
    if (motivo.trim().length < 3) {
      setError('Explicá brevemente el motivo de la anulación')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await costeoReposicionesApi.anular(reposicion.idReposicion, motivo.trim())
      setMotivo('')
      onAnulada()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al anular la reposición')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular {reposicion?.codigoRepo}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div>
          <Label className="mb-1 block text-xs">Motivo de anulación</Label>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={guardando} onClick={confirmar}>
            {guardando ? 'Anulando…' : 'Confirmar anulación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
