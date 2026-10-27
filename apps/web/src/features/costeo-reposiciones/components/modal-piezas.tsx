import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { costeoReposicionesApi } from '../api'
import type { PiezaAdmin } from '../types'

/**
 * Alta, renombrado y retiro de las piezas de una prenda (cuello, manga,
 * frontal…) que se eligen al registrar una reposición. Una pieza se RETIRA y no
 * se borra: sale del selector sin tocar las reposiciones que ya la usaron.
 *
 * Solo para quien tenga `costeo.pieza.administrar`; la página decide si
 * ofrecer el acceso. Mismo patrón que `modal-catalogos-producto` de Gestión de
 * datos.
 */
export function ModalPiezas({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const { data: piezas } = useQuery({
    queryKey: ['costeo-reposiciones', 'piezas-admin'],
    queryFn: () => costeoReposicionesApi.piezasAdmin(),
    enabled: open,
  })

  const [nombreNuevo, setNombreNuevo] = useState('')
  const [buscar, setBuscar] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null)

  function refrescar() {
    void queryClient.invalidateQueries({ queryKey: ['costeo-reposiciones', 'piezas-admin'] })
    // El selector del formulario lee las activas.
    void queryClient.invalidateQueries({ queryKey: ['costeo-reposiciones', 'piezas'] })
  }

  async function agregar() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setGuardando(true)
    try {
      const creada = await costeoReposicionesApi.crearPieza(nombre)
      setNombreNuevo('')
      refrescar()
      avisarExito(`Agregada: ${creada.nombre}`)
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'No se pudo agregar la pieza')
    } finally {
      setGuardando(false)
    }
  }

  async function cambiar(p: PiezaAdmin, body: { nombre?: string; activo?: boolean }) {
    try {
      await costeoReposicionesApi.editarPieza(p.idPieza, body)
      setEditando(null)
      refrescar()
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'No se pudo guardar el cambio')
    }
  }

  const filtro = buscar.trim().toLocaleLowerCase('es')
  const visibles = (piezas ?? []).filter((p) => !filtro || p.nombre.toLocaleLowerCase('es').includes(filtro))

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setEditando(null)
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
        <div className="flex max-h-[80vh] flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Piezas de una prenda</DialogTitle>
            <DialogDescription>
              Cuello, manga, frontal… Se eligen en el formulario de Reposiciones. Una pieza retirada deja de
              ofrecerse, pero las reposiciones que ya la usaron la conservan.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={nombreNuevo}
              placeholder="Nueva pieza"
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !guardando) void agregar()
              }}
            />
            <Button disabled={guardando || !nombreNuevo.trim()} onClick={() => void agregar()}>
              {guardando ? 'Agregando…' : 'Agregar'}
            </Button>
          </div>
          <Input value={buscar} placeholder="Buscar en el catálogo…" onChange={(e) => setBuscar(e.target.value)} />

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 bg-popover">
                  <TableHead>Pieza</TableHead>
                  <TableHead className="w-20 text-right">Usos</TableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((p) => (
                  <TableRow key={p.idPieza}>
                    <TableCell className="whitespace-normal">
                      {editando?.id === p.idPieza ? (
                        <Input
                          autoFocus
                          value={editando.nombre}
                          className="h-8"
                          onChange={(e) => setEditando({ id: p.idPieza, nombre: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void cambiar(p, { nombre: editando.nombre })
                            if (e.key === 'Escape') setEditando(null)
                          }}
                        />
                      ) : (
                        <span className={p.activo ? '' : 'text-ink-faint line-through'}>
                          {p.nombre} {!p.activo && <Badge variant="secondary">Retirada</Badge>}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.usos}</TableCell>
                    <TableCell className="text-right">
                      {editando?.id === p.idPieza ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => void cambiar(p, { nombre: editando.nombre })}>
                            Guardar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditando({ id: p.idPieza, nombre: p.nombre })}>
                            Renombrar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void cambiar(p, { activo: !p.activo })}>
                            {p.activo ? 'Retirar' : 'Reactivar'}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-ink-faint text-center">
                      {piezas ? 'Ninguna coincide.' : 'Cargando…'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
