import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { costeoRollosApi } from '../api'
import type { EstadoRollo, PanelItem } from '../types'

interface ModalDesmontajeProps {
  item: PanelItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDesmontado: () => void
}

const OPCIONES_ESTADO: { valor: EstadoRollo; etiqueta: string; descripcion: string }[] = [
  { valor: 'EN_BODEGA', etiqueta: 'Regresa a bodega', descripcion: 'Le queda papel utilizable, se puede volver a montar después' },
  { valor: 'AGOTADO', etiqueta: 'Agotado', descripcion: 'Ya no queda papel útil en el rollo' },
  { valor: 'DESCARTADO', etiqueta: 'Descartado', descripcion: 'Se retira por daño u otro motivo, sin importar si le queda papel' },
]

export function ModalDesmontaje({ item, open, onOpenChange, onDesmontado }: ModalDesmontajeProps) {
  const queryClient = useQueryClient()
  const [yardasFinales, setYardasFinales] = useState('')
  const [estado, setEstado] = useState<EstadoRollo>('EN_BODEGA')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idMontajeRollo = item?.montaje?.idMontajeRollo

  // Se pide fresco al abrir (no se reutiliza lo que trae el panel) porque acá
  // hace falta yardasAlIniciarEsteMontaje/consumoEsteMontaje — si el rollo ya
  // se montó antes en otra sesión, esos valores no son los mismos que
  // yardasIniciales/consumoTotalHistoricoRollo del panel.
  const { data: detalle, isLoading } = useQuery({
    queryKey: ['costeo-rollos', 'montajes', idMontajeRollo],
    queryFn: () => costeoRollosApi.detalleMontaje(idMontajeRollo!),
    enabled: open && !!idMontajeRollo,
  })

  useEffect(() => {
    if (open) {
      setYardasFinales('')
      setEstado('EN_BODEGA')
      setError(null)
    }
  }, [open])

  if (!item?.montaje) return null
  const { impresora } = item

  const yardasAlIniciar = detalle?.yardasAlIniciarEsteMontaje ?? null
  const consumoEsteMontaje = detalle?.consumoEsteMontaje ?? 0
  const finalesNum = Number(yardasFinales)
  const usadasFisicas =
    yardasAlIniciar != null && yardasFinales !== '' && !Number.isNaN(finalesNum) ? yardasAlIniciar - finalesNum : null
  const merma = usadasFisicas != null ? usadasFisicas - consumoEsteMontaje : null

  async function confirmar() {
    if (!idMontajeRollo) return
    if (yardasFinales === '' || Number.isNaN(finalesNum) || finalesNum < 0) {
      setError('Ingresá las yardas finales del rollo')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await costeoRollosApi.desmontar(idMontajeRollo, { yardasFinales: finalesNum, estado })
      queryClient.invalidateQueries({ queryKey: ['costeo-rollos'] })
      onDesmontado()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al desmontar el rollo')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Desmontar rollo — {impresora.codigo}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="rounded-md bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]">
            <div className="font-mono">
              {item.montaje.rolloPapel.facturaPapel.numeroFactura}-{item.montaje.rolloPapel.facturaPapel.totalRollos}-
              {item.montaje.rolloPapel.secuencia}
            </div>
            <div className="text-ink-muted">{item.montaje.rolloPapel.tipoPapel.nombre}</div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Yardas al iniciar este montaje</Label>
            <Input value={isLoading ? 'Cargando…' : (yardasAlIniciar ?? '—')} disabled />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Yardas finales (lectura al desmontar)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={yardasFinales}
              onChange={(e) => setYardasFinales(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 text-sm">
            <div>
              <div className="text-ink-faint">Consumo de este montaje</div>
              <div className="font-medium">{consumoEsteMontaje.toFixed(2)} yd</div>
            </div>
            <div>
              <div className="text-ink-faint">Merma calculada</div>
              <div className="font-medium">{merma != null ? `${merma.toFixed(2)} yd` : '—'}</div>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Estado final del rollo</Label>
            <div className="space-y-2">
              {OPCIONES_ESTADO.map((op) => (
                <button
                  key={op.valor}
                  type="button"
                  onClick={() => setEstado(op.valor)}
                  className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                    estado === op.valor ? 'border-accent-brand bg-accent-brand-soft' : 'border-border hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="text-sm font-medium text-ink">{op.etiqueta}</div>
                  <div className="text-xs text-ink-muted">{op.descripcion}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={guardando || isLoading} onClick={confirmar}>
            {guardando ? 'Guardando…' : 'Confirmar desmontaje'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
