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
import type { EditarMaterial, Material } from '../types'

/**
 * Modifica UN ítem. Solo se manda lo que cambió: el servidor escribe lo que
 * llega y deja lo demás, igual que el resto de las ediciones del proyecto.
 *
 * La fecha de entrega NO se edita acá: se maneja con las acciones de entrega
 * (entregar / corregir fecha / revertir), que es como bodega la registra.
 */
export function ModalEditarMaterial({
  material,
  pendiente,
  error,
  onCerrar,
  onGuardar,
}: {
  material: Material | null
  pendiente: boolean
  error: string | null
  onCerrar: () => void
  onGuardar: (cambios: EditarMaterial) => void
}) {
  if (!material) return null
  return (
    <Formulario
      key={material.idMaterialOp}
      material={material}
      pendiente={pendiente}
      error={error}
      onCerrar={onCerrar}
      onGuardar={onGuardar}
    />
  )
}

function Formulario({
  material: m,
  pendiente,
  error,
  onCerrar,
  onGuardar,
}: {
  material: Material
  pendiente: boolean
  error: string | null
  onCerrar: () => void
  onGuardar: (cambios: EditarMaterial) => void
}) {
  const [planificador, setPlanificador] = useState(m.ordenPlanificacion)
  const [fecha, setFecha] = useState(m.fechaPlanificador)
  const [op, setOp] = useState(m.codigoOp)
  const [insumo, setInsumo] = useState(m.insumoCodigo)
  const [cantidad, setCantidad] = useState(String(m.cantidad))
  const [comentario, setComentario] = useState(m.comentario ?? '')
  const [motivo, setMotivo] = useState('')

  const cantidadNum = Number(cantidad.replace(',', '.'))
  const valido =
    planificador.trim() !== '' && op.trim() !== '' && insumo.trim() !== '' && cantidadNum > 0 && !!fecha

  // Lo que de verdad cambió: es lo único que se manda y lo que habilita Guardar.
  const cambios: Omit<EditarMaterial, 'motivo'> = {}
  if (planificador.trim().toUpperCase() !== m.ordenPlanificacion) cambios.ordenPlanificacion = planificador.trim()
  if (fecha !== m.fechaPlanificador) cambios.fechaPlanificador = fecha
  if (op.trim().toUpperCase() !== m.codigoOp) cambios.codigoOp = op.trim()
  if (insumo.trim().toUpperCase() !== m.insumoCodigo) cambios.codigoInsumo = insumo.trim()
  if (cantidadNum !== m.cantidad) cambios.cantidad = cantidadNum
  if (comentario.trim() !== (m.comentario ?? '')) cambios.comentario = comentario.trim()
  const hayCambios = Object.keys(cambios).length > 0
  const motivoOk = motivo.trim().length >= 3

  function guardar() {
    onGuardar({ ...cambios, motivo: motivo.trim() })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pendiente && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modificar ítem</DialogTitle>
          <DialogDescription>
            {m.insumoDescripcion} · OP {m.codigoOp}. Cambiar el insumo vuelve a tomar su costo de hoy.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-xs">Orden de planificación</Label>
            <Input value={planificador} onChange={(e) => setPlanificador(e.target.value)} maxLength={30} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Fecha del planificador</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">OP</Label>
            <Input value={op} onChange={(e) => setOp(e.target.value)} placeholder="25OP020325" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Código del insumo</Label>
            <Input value={insumo} onChange={(e) => setInsumo(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Cantidad ({m.unidad})</Label>
            <Input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1 block text-xs">Comentario</Label>
            <Textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="mat-motivo" className="mb-1 block text-xs">
              Motivo de la modificación (obligatorio)
            </Label>
            <Textarea
              id="mat-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Ej.: el SAC corrigió la cantidad, se pidió para otra OP…"
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              Queda en el historial del ítem junto con lo que cambió y quién lo cambió.
            </p>
          </div>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={pendiente}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!valido || !hayCambios || !motivoOk || pendiente}>
            {pendiente ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
