import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMonto, formatearHoras, type CodigoMoneda } from '@digitexsa-erp/shared-utils'
import type { ResumenMaterial } from '../types'
import { imprimirResumen } from '../imprimir'

export interface ResumenAMostrar {
  data: ResumenMaterial
  moneda: CodigoMoneda
  tasa: number | null
  titulo: string
  productos: { codigo: string; descripcion: string; cantidad: number }[]
}

interface ModalResumenProps {
  resumen: ResumenAMostrar | null
  onClose: () => void
}

export function ModalResumen({ resumen, onClose }: ModalResumenProps) {
  if (!resumen) return null
  const { data, moneda, tasa, titulo, productos } = resumen

  const grupos: Record<string, typeof data.insumos> = {}
  for (const i of data.insumos) {
    ;(grupos[i.categoria] ??= []).push(i)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resumen de material — {titulo}</DialogTitle>
        </DialogHeader>

        <div className="flex justify-between text-sm">
          <span>
            Total de prendas: <strong>{data.totalPrendas}</strong>
          </span>
          <span>Moneda: {moneda}</span>
        </div>

        {productos.length > 0 && (
          <div className="text-sm">
            <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">Productos incluidos</p>
            <ul className="list-disc pl-5">
              {productos.map((p) => (
                <li key={p.codigo}>
                  <strong>{p.codigo}</strong> — {p.descripcion} <span className="text-muted-foreground">({p.cantidad} u.)</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead className="text-right">Cantidad total</TableHead>
                <TableHead className="text-right">Costo total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(grupos).map(([categoria, filas]) => (
                <Fragment key={categoria}>
                  <TableRow className="bg-muted">
                    <TableCell colSpan={3} className="text-xs font-bold uppercase">
                      {categoria}
                    </TableCell>
                  </TableRow>
                  {filas.map((i) => (
                    <TableRow key={i.codigo}>
                      <TableCell>
                        {i.codigo} — {i.descripcion}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.cantidadTotal.toLocaleString('es-GT', { maximumFractionDigits: 3 })} {i.unidad}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMonto(i.costoTotal, moneda, tasa)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              <TableRow className="bg-muted">
                <TableCell colSpan={3} className="text-xs font-bold uppercase">
                  Mano de obra
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Mano de obra</TableCell>
                <TableCell className="text-right tabular-nums">
                  {data.manoObra.minutosTotal.toFixed(0)} min ({formatearHoras(data.manoObra.minutosTotal)})
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMonto(data.manoObra.costoTotal, moneda, tasa)}</TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-right font-semibold">
                  Costo de insumos
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatMonto(data.costoInsumos, moneda, tasa)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={2} className="text-right font-semibold">
                  Costo general (con MO)
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatMonto(data.costoGeneral, moneda, tasa)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => imprimirResumen(data, moneda, tasa, titulo, productos)}>
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
