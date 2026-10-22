import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { costeoFacturacionApi } from '../api'

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/**
 * Modal de detalle y gestión de una OF: asignar/corregir factura, corregir
 * fecha, agregar OP, quitar OP (motivo obligatorio) y anular la OF entera.
 * Siempre vuelve a pedir el detalle tras cada acción — más simple que
 * mantener el estado local sincronizado a mano con lo que cambió el servidor.
 */
export function ModalDetalleOf({
  codigo,
  open,
  onOpenChange,
}: {
  codigo: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { tienePermiso } = useAuth()
  const puedeEditar = tienePermiso('costeo.of.editar')
  const puedeAnular = tienePermiso('costeo.of.anular')

  const { data: of, refetch } = useQuery({
    queryKey: ['costeo-facturacion', 'detalle', codigo],
    queryFn: () => costeoFacturacionApi.obtener(codigo!),
    enabled: open && !!codigo,
  })

  const [numeroFactura, setNumeroFactura] = useState('')
  const [fechaFactura, setFechaFactura] = useState('')
  const [guardandoFactura, setGuardandoFactura] = useState(false)

  const [codigoOpNueva, setCodigoOpNueva] = useState('')
  const [agregando, setAgregando] = useState(false)

  const [motivoQuitar, setMotivoQuitar] = useState<{ idOfOp: number; codigoOp: string } | null>(null)
  const [textoMotivoQuitar, setTextoMotivoQuitar] = useState('')
  const [quitando, setQuitando] = useState(false)

  const [anulando, setAnulando] = useState(false)
  const [motivoAnular, setMotivoAnular] = useState('')
  const [confirmandoAnular, setConfirmandoAnular] = useState(false)

  // Inicializa los campos de factura desde `of`, pero solo la PRIMERA vez que
  // se ve esta OF — no en cada refetch de fondo de react-query, que trae un
  // objeto con identidad nueva aunque los valores sean iguales y resetearía
  // lo que el usuario esté tecleando. Se vuelve a sincronizar si se cierra el
  // modal y se abre de nuevo (mismo u otro código).
  const codigoSincronizado = useRef<string | null>(null)
  useEffect(() => {
    if (!open) {
      codigoSincronizado.current = null
      return
    }
    if (!of || codigoSincronizado.current === of.codigo) return
    codigoSincronizado.current = of.codigo
    setNumeroFactura(of.numeroFactura ?? '')
    setFechaFactura(of.fechaFactura ? of.fechaFactura.slice(0, 10) : '')
  }, [open, of])

  function invalidarListado() {
    queryClient.invalidateQueries({ queryKey: ['costeo-facturacion', 'listado'] })
  }

  async function guardarFactura() {
    if (!of) return
    setGuardandoFactura(true)
    try {
      await costeoFacturacionApi.asignarFactura(of.idOrdenFacturacion, {
        numeroFactura: numeroFactura.trim() || null,
        fecha: fechaFactura || null,
      })
      avisarExito('Factura actualizada.')
      refetch()
      invalidarListado()
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'No se pudo guardar la factura')
    } finally {
      setGuardandoFactura(false)
    }
  }

  async function agregarOp() {
    if (!of || !codigoOpNueva.trim()) return
    setAgregando(true)
    try {
      await costeoFacturacionApi.agregarOp(of.idOrdenFacturacion, codigoOpNueva.trim())
      avisarExito(`OP ${codigoOpNueva.trim()} agregada.`)
      setCodigoOpNueva('')
      refetch()
      invalidarListado()
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'No se pudo agregar la OP')
    } finally {
      setAgregando(false)
    }
  }

  async function confirmarQuitar() {
    if (!motivoQuitar || textoMotivoQuitar.trim().length < 3) return
    setQuitando(true)
    try {
      await costeoFacturacionApi.quitarOp(motivoQuitar.idOfOp, textoMotivoQuitar.trim())
      avisarExito(`OP ${motivoQuitar.codigoOp} quitada — queda libre para otra OF.`)
      setMotivoQuitar(null)
      setTextoMotivoQuitar('')
      refetch()
      invalidarListado()
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'No se pudo quitar la OP')
    } finally {
      setQuitando(false)
    }
  }

  async function confirmarAnular() {
    if (!of || motivoAnular.trim().length < 3) return
    setAnulando(true)
    try {
      await costeoFacturacionApi.anular(of.idOrdenFacturacion, motivoAnular.trim())
      avisarExito(`OF ${of.codigo} anulada — sus OP quedaron libres para otra OF.`)
      setConfirmandoAnular(false)
      setMotivoAnular('')
      refetch()
      invalidarListado()
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'No se pudo anular la OF')
    } finally {
      setAnulando(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `max-h` + `overflow-hidden` en el DialogContent, con el cuerpo en su
          propio `overflow-y-auto`: sin esto el DialogContent de shadcn no
          tiene techo de altura — con pocas OP no se nota, pero una OF real
          con 100+ (caso encontrado por el usuario en producción) hacía crecer
          el modal entero más allá de la pantalla, hacia arriba y hacia abajo
          (se centra con `transform`), y como el scroll de la página queda
          bloqueado mientras el modal está abierto, no había forma de llegar a
          Factura ni a Anular. Mismo recurso ya usado en ImportPreviewDialog,
          con el encabezado y el pie SIEMPRE visibles y solo el cuerpo
          scrolleando. */}
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <div className="flex max-h-[80vh] flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{of?.codigo ?? codigo}</span>
            {of?.anuladaEn && <Badge variant="destructive">Anulada</Badge>}
          </DialogTitle>
          <DialogDescription>
            {of ? `${of.cliente} · ${fechaCorta(of.fecha)}` : 'Cargando…'}
          </DialogDescription>
        </DialogHeader>

        {of && (
          // `flex-1 min-h-0`: sin min-h-0 un hijo flex no se achica más allá de
          // su contenido, así que el overflow-y-auto nunca llegaba a activarse.
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-1">
            {of.anuladaEn && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                Anulada el {fechaCorta(of.anuladaEn)} por {of.anuladaPor ?? '—'}.
                {of.motivoAnulacion && <> Motivo: {of.motivoAnulacion}</>}
              </div>
            )}

            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-medium text-ink-muted">Factura</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="mb-1 block text-xs">Número</Label>
                  <Input
                    className="w-40"
                    value={numeroFactura}
                    onChange={(e) => setNumeroFactura(e.target.value)}
                    disabled={!puedeEditar || !!of.anuladaEn}
                    placeholder="Sin asignar"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Fecha</Label>
                  <Input
                    type="date"
                    value={fechaFactura}
                    onChange={(e) => setFechaFactura(e.target.value)}
                    disabled={!puedeEditar || !!of.anuladaEn}
                  />
                </div>
                {puedeEditar && !of.anuladaEn && (
                  <Button size="sm" disabled={guardandoFactura} onClick={guardarFactura}>
                    {guardandoFactura ? 'Guardando…' : 'Guardar'}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-ink-faint">
                Número y fecha van juntos — dejar los dos en blanco quita la factura asignada.
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-ink-muted">
                OP en esta OF ({of.ops.length})
              </p>
              {of.ops.length === 0 ? (
                <p className="text-ink-faint text-sm">Ninguna.</p>
              ) : (
                // Caja con su propio scroll: una OF real puede traer 100+ OP, y sin
                // esto la tabla empujaba Factura y Anular fuera de la pantalla.
                <div className="max-h-[320px] overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 bg-popover">
                        <TableHead>OP</TableHead>
                        <TableHead>Estatus</TableHead>
                        <TableHead>Asignada por</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {of.ops.map((o) => (
                        <TableRow key={o.idOfOp}>
                          <TableCell className="font-mono">{o.codigoOp}</TableCell>
                          <TableCell>{o.estatusOp}</TableCell>
                          <TableCell className="text-xs text-ink-muted">{o.asignadoPor ?? '—'}</TableCell>
                          <TableCell>
                            {puedeEditar && !of.anuladaEn && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setMotivoQuitar({ idOfOp: o.idOfOp, codigoOp: o.codigoOp })}
                              >
                                Quitar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {puedeEditar && !of.anuladaEn && (
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="Ej: 26OP014154"
                    value={codigoOpNueva}
                    onChange={(e) => setCodigoOpNueva(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && agregarOp()}
                    className="max-w-xs font-mono"
                  />
                  <Button variant="outline" size="sm" disabled={agregando || !codigoOpNueva.trim()} onClick={agregarOp}>
                    {agregando ? 'Agregando…' : 'Agregar OP'}
                  </Button>
                </div>
              )}
            </div>

            {of.opsHistorial.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted">
                  Historial — OP quitadas ({of.opsHistorial.length})
                </p>
                <ul className="space-y-1 text-xs text-ink-faint">
                  {of.opsHistorial.map((h) => (
                    <li key={h.idOfOp}>
                      <span className="font-mono">{h.codigoOp}</span> — quitada el{' '}
                      {fechaCorta(h.anuladoEn)} por {h.anuladoPor ?? '—'}
                      {h.motivoAnulacion && <>: {h.motivoAnulacion}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {puedeAnular && !of.anuladaEn && (
              <div className="rounded-md border border-destructive/30 p-3">
                {!confirmandoAnular ? (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmandoAnular(true)}>
                    Anular esta OF
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-ink">
                      Esto libera las {of.ops.length} OP vigentes para que puedan ir a otra OF. No se
                      puede deshacer.
                    </p>
                    <Textarea
                      rows={2}
                      placeholder="Motivo de la anulación (obligatorio)"
                      value={motivoAnular}
                      onChange={(e) => setMotivoAnular(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={anulando || motivoAnular.trim().length < 3}
                        onClick={confirmarAnular}
                      >
                        {anulando ? 'Anulando…' : 'Confirmar anulación'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmandoAnular(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </div>
      </DialogContent>
    </Dialog>

    {/* Confirmación de "quitar OP": un Dialog propio, HERMANO del principal
        (no anidado dentro de su Root) — es la estructura que Radix espera
        para dos diálogos independientes que pueden coexistir. */}
    <Dialog open={!!motivoQuitar} onOpenChange={(o) => !o && setMotivoQuitar(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quitar {motivoQuitar?.codigoOp} de esta OF</DialogTitle>
          <DialogDescription>
            La OP queda libre para asignarse a otra OF. Esto no se puede deshacer, pero se puede
            volver a agregar después.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={2}
          placeholder="Motivo (obligatorio)"
          value={textoMotivoQuitar}
          onChange={(e) => setTextoMotivoQuitar(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setMotivoQuitar(null)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={quitando || textoMotivoQuitar.trim().length < 3}
            onClick={confirmarQuitar}
          >
            {quitando ? 'Quitando…' : 'Quitar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
