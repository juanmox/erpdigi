import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMonto, textoPctCostoMargen, type CodigoMoneda } from '@digitexsa-erp/shared-utils'
import type { ItemAcumulado } from '../types'

interface CarritoAcumuladosProps {
  items: ItemAcumulado[]
  moneda: CodigoMoneda
  tasa: number | null
  onQuitar: (codigo: string) => void
}

export function CarritoAcumulados({ items, moneda, tasa, onQuitar }: CarritoAcumuladosProps) {
  const totalCantidad = items.reduce((s, i) => s + i.cantidad, 0)
  const totalCosto = items.reduce((s, i) => s + i.cantidad * i.costoUnitario, 0)

  if (items.length === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm italic">Sin productos aún</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead className="text-right">Cant.</TableHead>
          <TableHead className="text-right">Subtotal</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const subtotal = item.cantidad * item.costoUnitario
          return (
            <TableRow key={item.codigo}>
              <TableCell className="whitespace-normal">
                <div className="font-medium">{item.codigo}</div>
                <div className="text-muted-foreground text-xs">{item.descripcion}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{item.cantidad}</TableCell>
              <TableCell className="text-right tabular-nums">
                <div>{formatMonto(subtotal, moneda, tasa)}</div>
                <div className="text-muted-foreground text-xs whitespace-nowrap">
                  {textoPctCostoMargen(item.costoUnitario, item.precioVenta, tasa)}
                </div>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => onQuitar(item.codigo)} aria-label="Quitar">
                  <X className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-semibold">Total</TableCell>
          <TableCell className="text-right font-semibold tabular-nums">{totalCantidad}</TableCell>
          <TableCell className="text-right font-semibold tabular-nums">{formatMonto(totalCosto, moneda, tasa)}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  )
}
