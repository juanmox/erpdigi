import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { OrdenConsumo } from '../types'

const yd = (n: number) => n.toLocaleString('es-GT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

/**
 * Corrección de registros de consumo ya enviados: anula por talla suelta, por
 * ítem completo o por la orden entera.
 *
 * Nace de la carga del histórico: el legacy traía capturas equivocadas que
 * nadie borró allá, como el `4XL` de `26OP028950` —una talla que ese producto
 * ni siquiera tiene— y van a seguir apareciendo. No hay "editar" una fila de
 * consumo: una fila es inmutable salvo por su anulación, así que corregir es
 * anular y volver a capturar, igual que el papel en blanco.
 *
 * ⚠️ La señal que delata una captura mala está en la propia tabla: se muestra
 * lo REGISTRADO junto a lo que el ERP calcularía hoy. Que no haya cálculo
 * posible —"sin estándar"— es el caso más claro, porque significa que ese
 * producto no tiene esa talla. Pero NO es automático: también hay productos a
 * los que simplemente les falta cargar el estándar, así que decide la persona.
 */
export function ModalCorregir({
  abierto,
  onCerrar,
  data,
  onAnular,
  guardando,
}: {
  abierto: boolean
  onCerrar: () => void
  data: OrdenConsumo
  onAnular: (ids: number[], motivo: string, quitarTalla: boolean) => void
  guardando: boolean
}) {
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [motivo, setMotivo] = useState('')
  const [quitarTalla, setQuitarTalla] = useState(true)

  // Solo lo que de verdad está registrado se puede anular.
  const lineas = useMemo(
    () =>
      data.lineas
        .map((l) => ({ ...l, tallas: l.tallas.filter((t) => t.idConsumoPapel != null) }))
        .filter((l) => l.tallas.length > 0),
    [data.lineas],
  )
  const todos = useMemo(
    () => lineas.flatMap((l) => l.tallas.map((t) => t.idConsumoPapel!)),
    [lineas],
  )

  const alternar = (ids: number[], marcar: boolean) =>
    setSel((prev) => {
      const s = new Set(prev)
      for (const id of ids) (marcar ? s.add(id) : s.delete(id))
      return s
    })

  const yardas = useMemo(() => {
    let t = 0
    for (const l of lineas)
      for (const x of l.tallas)
        if (sel.has(x.idConsumoPapel!)) t += x.consumoGuardadoYd ?? 0
    return t
  }, [lineas, sel])

  const puede = sel.size > 0 && motivo.trim().length >= 3 && !guardando

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90svh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Corregir registros de {data.orden.codigo}</DialogTitle>
          <DialogDescription>
            Anula lo que se registró mal. No se borra: queda con su motivo y quién lo anuló, y
            la talla vuelve a poder capturarse.
          </DialogDescription>
        </DialogHeader>

        {lineas.length === 0 ? (
          <p className="text-muted-foreground text-sm">Esta orden no tiene consumos registrados.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => alternar(todos, sel.size !== todos.length)}
              >
                {sel.size === todos.length ? 'Quitar toda la selección' : `Seleccionar la orden completa (${todos.length})`}
              </Button>
              <span className="text-muted-foreground text-xs">
                {sel.size} seleccionado(s) · {yd(yardas)} yd
              </span>
            </div>

            {lineas.map((l) => {
              const ids = l.tallas.map((t) => t.idConsumoPapel!)
              const todasMarcadas = ids.every((i) => sel.has(i))
              return (
                <div key={l.idLineaProduccion} className="rounded-md border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Checkbox
                      checked={todasMarcadas}
                      onCheckedChange={(v) => alternar(ids, v === true)}
                      aria-label={`Seleccionar todo el ítem ${l.codigoLine}`}
                    />
                    <span className="font-mono text-sm font-semibold">{l.codigoLine}</span>
                    <span className="text-muted-foreground text-xs">
                      {l.producto.codigo} · {l.producto.descripcion}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {l.tallas.map((t) => (
                      <label
                        key={t.idTalla}
                        className="hover:bg-muted/50 flex items-center gap-2 rounded px-2 py-1 text-sm"
                      >
                        <Checkbox
                          checked={sel.has(t.idConsumoPapel!)}
                          onCheckedChange={(v) => alternar([t.idConsumoPapel!], v === true)}
                        />
                        <span className="w-16 font-medium">{t.talla}</span>
                        <span className="text-muted-foreground w-14 text-xs">{t.cantidad} pz</span>
                        <span className="tabular-nums">{yd(t.consumoGuardadoYd ?? 0)} yd</span>
                        {/* El contraste contra lo calculado: sin estándar es la
                            señal más fuerte de que la talla no corresponde. */}
                        {t.consumoYd === null ? (
                          <span className="text-destructive text-xs">sin estándar</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            calculado {yd(t.consumoYd)}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}

            <div className="space-y-3 border-t pt-3">
              <div>
                <Label htmlFor="motivo-anulacion" className="mb-1 block text-xs">
                  Motivo (obligatorio)
                </Label>
                <Textarea
                  id="motivo-anulacion"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: la talla 4XL no existe en este producto, fue una captura equivocada del legacy"
                  rows={2}
                />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={quitarTalla}
                  onCheckedChange={(v) => setQuitarTalla(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Quitar también la talla de la orden
                  <span className="text-muted-foreground block text-xs">
                    Déjalo marcado si la talla nunca debió estar. Desmárcalo si la prenda sí se
                    pidió y lo que estuvo mal fue el consumo: así la talla queda pendiente de
                    capturar.
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCerrar} disabled={guardando}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!puede}
                  onClick={() => onAnular([...sel], motivo.trim(), quitarTalla)}
                >
                  {guardando ? 'Anulando…' : `Anular ${sel.size} registro(s)`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
