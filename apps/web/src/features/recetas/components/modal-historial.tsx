import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMonto } from '@digitexsa-erp/shared-utils'
import { recetasApi } from '../api'
import { imprimirCotizacion } from '../imprimir'
import type { ResumenAMostrar } from './modal-resumen'

interface ModalHistorialProps {
  open: boolean
  onClose: () => void
  onMostrarResumen: (r: ResumenAMostrar) => void
}

export function ModalHistorial({ open, onClose, onMostrarResumen }: ModalHistorialProps) {
  const [idSeleccionado, setIdSeleccionado] = useState<number | null>(null)

  const { data: historial } = useQuery({
    queryKey: ['recetas', 'cotizaciones'],
    queryFn: () => recetasApi.listarCotizaciones(),
    enabled: open,
  })

  const { data: detalle } = useQuery({
    queryKey: ['recetas', 'cotizacion', idSeleccionado],
    queryFn: () => recetasApi.obtenerCotizacion(idSeleccionado as number),
    enabled: idSeleccionado !== null,
  })

  async function verResumen(id: number) {
    const d = await recetasApi.obtenerCotizacion(id)
    const items = d.detalle.map((x) => ({ codigo: x.codigoProducto, cantidad: x.cantidad }))
    const productos = d.detalle.map((x) => ({ codigo: x.codigoProducto, descripcion: x.descripcion, cantidad: x.cantidad }))
    const usaUsd = d.cotizacion.moneda === 'USD' && !!d.cotizacion.tasaCambio
    const resumen = await recetasApi.resumenMaterial(items)
    onMostrarResumen({
      data: resumen,
      moneda: usaUsd ? 'USD' : 'GTQ',
      tasa: usaUsd ? d.cotizacion.tasaCambio : null,
      titulo: d.cotizacion.folio,
      productos,
    })
  }

  async function imprimir(id: number) {
    const d = await recetasApi.obtenerCotizacion(id)
    imprimirCotizacion(d)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de cotizaciones</DialogTitle>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Piezas</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {historial?.map((c) => {
              const tasa = c.moneda === 'USD' ? c.tasaCambio : null
              return (
                <TableRow
                  key={c.idCotizacion}
                  className="cursor-pointer"
                  onClick={() => setIdSeleccionado(c.idCotizacion)}
                >
                  <TableCell className="font-medium">{c.folio}</TableCell>
                  <TableCell>{new Date(c.fechaCreacion).toLocaleString('es-GT')}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.totalCantidad}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMonto(c.totalCosto, c.moneda, tasa)} <Badge variant="secondary">{c.moneda}</Badge>
                  </TableCell>
                  <TableCell className="max-w-40 truncate text-sm">{c.notas}</TableCell>
                  <TableCell className="space-x-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" onClick={() => verResumen(c.idCotizacion)}>
                      Resumen
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => imprimir(c.idCotizacion)}>
                      Imprimir
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {detalle && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <p className="font-semibold">Detalle — {detalle.cotizacion.folio}</p>
            {detalle.detalle.map((linea) => (
              <div key={linea.idDetalle} className="rounded-md border p-2 text-sm">
                <p className="font-medium">
                  {linea.codigoProducto} — {linea.descripcion}
                </p>
                <p className="text-muted-foreground">
                  Cantidad: {linea.cantidad} · Costo unit.:{' '}
                  {formatMonto(linea.costoUnitario, detalle.cotizacion.moneda, detalle.cotizacion.tasaCambio, 4)} · Total:{' '}
                  {formatMonto(linea.costoTotal, detalle.cotizacion.moneda, detalle.cotizacion.tasaCambio)}
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
