import { TableCell, TableRow } from '@/components/ui/table'

/**
 * Franja de categoría de una tabla agrupada (PAPEL, TELAS, mano de obra…).
 *
 * Antes era `bg-muted` a secas — un gris del 97 % sobre blanco que casi no se
 * distinguía de las filas de datos, con texto de 12 px. Ahora lleva el tinte del
 * azul de marca, un filo de color a la izquierda y un título más grande, con la
 * cantidad de ítems. Un solo componente para las 7 tablas que la repetían: si se
 * vuelve a ajustar, es en un solo lugar.
 *
 * `extra` es la celda de la derecha (subtotal), para las tablas que la traen.
 * `colSpan` es el de la parte del título: debe dejar libre la columna del extra.
 */
export function FilaCategoria({
  titulo,
  colSpan,
  cantidad,
  extra,
}: {
  titulo: string
  colSpan: number
  cantidad?: number
  extra?: React.ReactNode
}) {
  return (
    <TableRow className="border-l-4 border-l-accent-brand bg-accent-brand-soft hover:bg-accent-brand-soft">
      <TableCell colSpan={colSpan} className="py-2.5 text-[13px] font-bold tracking-wide text-accent-brand-strong uppercase">
        {titulo}
        {cantidad != null && (
          <span className="text-ink-muted ml-2 text-xs font-medium tracking-normal normal-case">· {cantidad}</span>
        )}
      </TableCell>
      {extra != null && (
        <TableCell className="py-2.5 text-right text-[13px] font-bold tabular-nums text-accent-brand-strong">{extra}</TableCell>
      )}
    </TableRow>
  )
}
