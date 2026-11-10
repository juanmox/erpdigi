import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface ValoresAccion {
  salida: string
  fecha: string
  motivo: string
}

/**
 * Diálogo único para las acciones por lote sobre materiales: entregar (salida +
 * fecha), corregir la fecha de entrega y anular (motivo). Cada una pide solo los
 * campos que le corresponden, para que el operario no tenga que adivinar cuáles
 * importan.
 */
export function DialogoAccion({
  abierto,
  titulo,
  descripcion,
  campos,
  textoConfirmar,
  peligroso,
  fechaInicial,
  pendiente,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean
  titulo: string
  descripcion: string
  campos: ('salida' | 'fecha' | 'motivo')[]
  textoConfirmar: string
  peligroso?: boolean
  /** yyyy-mm-dd propuesta para el campo de fecha (hoy). */
  fechaInicial: string
  pendiente: boolean
  onCerrar: () => void
  onConfirmar: (v: ValoresAccion) => void
}) {
  const [salida, setSalida] = useState('')
  const [fecha, setFecha] = useState(fechaInicial)
  const [motivo, setMotivo] = useState('')

  const falta =
    (campos.includes('salida') && !salida.trim()) ||
    (campos.includes('fecha') && !fecha) ||
    (campos.includes('motivo') && motivo.trim().length < 3)

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !pendiente && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {campos.includes('salida') && (
            <div>
              <Label htmlFor="acc-salida" className="mb-1 block text-xs">
                Salida SAC (obligatoria)
              </Label>
              <Input
                id="acc-salida"
                value={salida}
                onChange={(e) => setSalida(e.target.value)}
                placeholder="Ej.: 9723"
                maxLength={30}
                autoFocus
              />
            </div>
          )}
          {campos.includes('fecha') && (
            <div>
              <Label htmlFor="acc-fecha" className="mb-1 block text-xs">
                Fecha de entrega
              </Label>
              <Input id="acc-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          )}
          {campos.includes('motivo') && (
            <div>
              <Label htmlFor="acc-motivo" className="mb-1 block text-xs">
                Motivo (obligatorio)
              </Label>
              <Textarea
                id="acc-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Ej.: la OP se canceló, se cargó dos veces por error…"
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={pendiente}>
            Cancelar
          </Button>
          <Button
            variant={peligroso ? 'destructive' : 'default'}
            disabled={falta || pendiente}
            onClick={() => onConfirmar({ salida: salida.trim(), fecha, motivo: motivo.trim() })}
          >
            {pendiente ? 'Aplicando…' : textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
