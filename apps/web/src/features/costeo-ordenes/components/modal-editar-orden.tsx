import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { costeoOrdenesApi } from '../api'
import type { OrdenProduccionDetalle } from '../types'

/**
 * Edita el encabezado de una OP ya cargada — gateado `costeo.orden.editar`
 * en el padre. El código de OP no se edita acá (si se subió con el número
 * equivocado, la salida es eliminarla y re-importar).
 */
export function ModalEditarOrden({
  open,
  onOpenChange,
  orden,
  onGuardado,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  orden: OrdenProduccionDetalle
  onGuardado: () => void
}) {
  const { data: clientes } = useQuery({
    queryKey: ['costeo-ordenes', 'clientes'],
    queryFn: () => costeoOrdenesApi.clientes(),
    enabled: open,
  })

  const [idCliente, setIdCliente] = useState('')
  const [ordenCompra, setOrdenCompra] = useState('')
  const [fechaRecibido, setFechaRecibido] = useState('')
  const [fechaCompromiso, setFechaCompromiso] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Se sincroniza UNA vez por apertura, no en cada render — un `useEffect`
  // sin guarda pisaría lo que el admin ya tecleó si `orden` cambia de
  // identidad entre medio (mismo defecto ya corregido en el modal de OF).
  const sincronizado = useRef(false)
  useEffect(() => {
    if (!open) {
      sincronizado.current = false
      return
    }
    if (sincronizado.current) return
    sincronizado.current = true
    setIdCliente(orden.cliente ? String(orden.cliente.idCliente) : '')
    setOrdenCompra(orden.ordenCompra ?? '')
    setFechaRecibido(orden.fechaRecibido ? orden.fechaRecibido.slice(0, 10) : '')
    setFechaCompromiso(orden.fechaCompromiso ? orden.fechaCompromiso.slice(0, 10) : '')
  }, [open, orden])

  // El consumo PRODUCCIÓN de cualquier línea bloquea el cambio de orden de
  // compra en el servidor (renombra todos los Item, que ya viajaron a los
  // reportes). Se repite acá solo para deshabilitar el campo con el motivo
  // a la vista — el servidor es quien de verdad lo impide.
  const algunaEnviada = orden.lineasProduccion.some((l) => l.enviada)

  async function guardar() {
    setGuardando(true)
    try {
      const payload: Parameters<typeof costeoOrdenesApi.editarOrden>[1] = {}
      if (idCliente && (!orden.cliente || Number(idCliente) !== orden.cliente.idCliente))
        payload.idCliente = Number(idCliente)
      if (ordenCompra.trim() && ordenCompra.trim() !== (orden.ordenCompra ?? ''))
        payload.ordenCompra = ordenCompra.trim()
      const fechaRecibidoActual = orden.fechaRecibido ? orden.fechaRecibido.slice(0, 10) : ''
      if (fechaRecibido !== fechaRecibidoActual) payload.fechaRecibido = fechaRecibido || null
      const fechaCompromisoActual = orden.fechaCompromiso ? orden.fechaCompromiso.slice(0, 10) : ''
      if (fechaCompromiso !== fechaCompromisoActual) payload.fechaCompromiso = fechaCompromiso || null

      if (Object.keys(payload).length === 0) {
        onOpenChange(false)
        return
      }

      await costeoOrdenesApi.editarOrden(orden.idOrdenProduccion, payload)
      avisarExito('Orden actualizada.')
      onOpenChange(false)
      onGuardado()
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'Error al guardar la orden')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* max-h + overflow-hidden en el DialogContent, con el cuerpo en su
          propio overflow-y-auto — mismo recurso que ImportPreviewDialog y el
          modal de detalle de OF, para que el pie quede siempre alcanzable. */}
      <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden">
        <div className="flex max-h-[80vh] flex-col">
          <DialogHeader>
            <DialogTitle>
              Editar <span className="font-mono">{orden.codigo}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1">
            <div>
              <Label className="mb-1 block text-xs">Cliente</Label>
              <Select value={idCliente} onValueChange={setIdCliente}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {clientes?.map((c) => (
                    <SelectItem key={c.idCliente} value={String(c.idCliente)}>
                      {c.codigo} — {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1 block text-xs">Orden de compra</Label>
              <Input
                value={ordenCompra}
                onChange={(e) => setOrdenCompra(e.target.value)}
                disabled={algunaEnviada}
                className="font-mono"
              />
              {algunaEnviada ? (
                <p className="mt-1 text-[11px] text-destructive">
                  No se puede cambiar: al menos un ítem ya se envió a impresión y su Item ya viajó a los
                  reportes.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-ink-faint">
                  Cambiarla renombra el Item de todos los ítems de esta orden (ej. {ordenCompra || '…'}-1,
                  -2…).
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="mb-1 block text-xs">Fecha recibido</Label>
                <Input type="date" value={fechaRecibido} onChange={(e) => setFechaRecibido(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Fecha compromiso</Label>
                <Input
                  type="date"
                  value={fechaCompromiso}
                  onChange={(e) => setFechaCompromiso(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={guardando} onClick={() => void guardar()}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
