import { Fragment } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatMonto, formatPrecioVenta, textoPctCostoMargen, type CodigoMoneda } from '@digitexsa-erp/shared-utils'
import type { RecetaProducto } from '../types'

interface CardRecetaProps {
  receta: RecetaProducto
  moneda: CodigoMoneda
  tasa: number | null
}

export function CardReceta({ receta, moneda, tasa }: CardRecetaProps) {
  const { producto, insumos, manoObra } = receta

  const grupos: Record<string, typeof insumos> = {}
  for (const i of insumos) {
    ;(grupos[i.categoria] ??= []).push(i)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <p className="font-semibold">
            {producto.codigo} · {producto.descripcion}
          </p>
          <dl className="text-muted-foreground mt-1 grid grid-cols-2 gap-x-4 text-xs sm:grid-cols-3">
            {producto.desarrollo && (
              <div>
                <dt className="uppercase">Desarrollo</dt>
                <dd className="text-foreground font-medium">{producto.desarrollo}</dd>
              </div>
            )}
            {producto.patron && (
              <div>
                <dt className="uppercase">Patrón</dt>
                <dd className="text-foreground font-medium">{producto.patron}</dd>
              </div>
            )}
            {producto.clienteNombre && (
              <div>
                <dt className="uppercase">Cliente</dt>
                <dd className="text-foreground font-medium">{producto.clienteNombre}</dd>
              </div>
            )}
            {producto.tamano && (
              <div>
                <dt className="uppercase">Talla</dt>
                <dd className="text-foreground font-medium">{producto.tamano}</dd>
              </div>
            )}
            {producto.deporte && (
              <div>
                <dt className="uppercase">Deporte</dt>
                <dd className="text-foreground font-medium">{producto.deporte}</dd>
              </div>
            )}
            <div>
              <dt className="uppercase">Mano de obra</dt>
              <dd className="text-foreground font-medium">{producto.minutosMo} min</dd>
            </div>
          </dl>
        </div>
        <span className="bg-accent text-accent-foreground rounded-md border px-2 py-1 text-sm font-semibold">
          {formatPrecioVenta(producto.precioVenta, moneda, tasa)}
        </span>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead>Consumo</TableHead>
                <TableHead>Área</TableHead>
                <TableHead className="text-right">C. Prom.</TableHead>
                <TableHead className="text-right">C. Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(grupos).map(([categoria, filas]) => (
                <Fragment key={categoria}>
                  <TableRow className="bg-muted">
                    <TableCell colSpan={5} className="text-xs font-bold tracking-wide uppercase">
                      {categoria}
                    </TableCell>
                  </TableRow>
                  {filas.map((i) => (
                    <TableRow key={`${i.codigo}-${i.area}`}>
                      <TableCell>
                        {i.codigo && <span className="font-medium">{i.codigo}</span>} {i.descripcion}
                      </TableCell>
                      <TableCell>
                        {i.consumo} {i.unidad}
                      </TableCell>
                      <TableCell>{i.area ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMonto(i.costoPromedio, moneda, tasa, 4)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMonto(i.costoTotal, moneda, tasa, 4)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              <TableRow className="bg-muted">
                <TableCell colSpan={5} className="text-xs font-bold tracking-wide uppercase">
                  {manoObra.categoria}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>{manoObra.descripcion}</TableCell>
                <TableCell>
                  {manoObra.consumo} {manoObra.unidad}
                </TableCell>
                <TableCell>{manoObra.area}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMonto(manoObra.costoPromedio, moneda, tasa, 4)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMonto(manoObra.costoTotal, moneda, tasa, 4)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 flex items-center justify-between border-t-2 pt-3">
          <span className="text-muted-foreground text-sm">
            {textoPctCostoMargen(producto.costoUnitario, producto.precioVenta, tasa)}
          </span>
          <span className="text-lg font-bold">{formatMonto(producto.costoUnitario, moneda, tasa, 4)}</span>
        </div>
      </CardContent>
    </Card>
  )
}
