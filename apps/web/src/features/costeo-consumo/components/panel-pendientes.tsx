import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { costeoRollosApi } from '@/features/costeo-rollos/api'
import { costeoConsumoApi } from '../api'

const TODAS = '__todas__'

/**
 * Trabajo pendiente, filtrable por impresora.
 *
 * Sin esto la pantalla obligaba a teclear un código de OP a ciegas: había que
 * saber de memoria qué órdenes existen. El operario piensa desde la máquina que
 * tiene enfrente ("¿qué me toca en la MS 2?"), no desde el número de orden.
 *
 * Lista LÍNEAS y no órdenes: una misma OP puede repartirse entre varias
 * impresoras, así que agrupar por OP mostraría trabajo de otra máquina.
 */
export function PanelPendientes({ onElegirOp }: { onElegirOp: (codigoOp: string) => void }) {
  const [impresora, setImpresora] = useState(TODAS)

  const { data: panel } = useQuery({
    queryKey: ['rollos', 'panel'],
    queryFn: () => costeoRollosApi.panel(),
  })
  const idImpresora = impresora === TODAS ? undefined : Number(impresora)
  const { data, isFetching } = useQuery({
    queryKey: ['consumo', 'pendientes', idImpresora ?? 'todas'],
    queryFn: () => costeoConsumoApi.pendientes(idImpresora),
  })

  const lineas = data?.lineas ?? []
  // Agrupado por OP solo para presentar: se entra a la pantalla por orden.
  const porOp = new Map<string, { cliente: string | null; lineas: number; piezas: number }>()
  for (const l of lineas) {
    const a = porOp.get(l.codigoOp) ?? { cliente: l.cliente, lineas: 0, piezas: 0 }
    a.lineas++
    a.piezas += l.totalPiezas
    porOp.set(l.codigoOp, a)
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Trabajo pendiente</span>
        <Select value={impresora} onValueChange={setImpresora}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Impresora" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas las impresoras</SelectItem>
            {panel?.map((p) => (
              <SelectItem key={p.impresora.idImpresora} value={String(p.impresora.idImpresora)}>
                {p.impresora.codigo}
                {p.montaje ? '' : ' · sin rollo'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isFetching ? (
        <p className="text-muted-foreground text-xs">Cargando…</p>
      ) : porOp.size === 0 ? (
        <p className="text-muted-foreground text-xs">
          {idImpresora ? 'Esta impresora no tiene trabajo pendiente.' : 'No hay líneas pendientes.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {[...porOp.entries()].map(([op, a]) => (
            <Button
              key={op}
              variant="outline"
              size="sm"
              className="h-auto flex-col items-start gap-0 py-1.5"
              onClick={() => onElegirOp(op)}
            >
              <span className="font-mono text-xs font-semibold">{op}</span>
              <span className="text-muted-foreground text-[11px]">
                {a.lineas} lín · {a.piezas} pzs{a.cliente ? ` · ${a.cliente}` : ''}
              </span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
