import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { GrupoColapsable } from '@/components/shared/grupo-colapsable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { costeoConsumoApi } from '../api'
import type { LineaPendiente } from '../types'

interface OpPendiente {
  codigoOp: string
  cliente: string | null
  lineas: number
  piezas: number
}

/**
 * Trabajo pendiente, agrupado por impresora.
 *
 * Sin esto la pantalla obligaba a teclear un código de OP a ciegas: había que
 * saber de memoria qué órdenes existen. El operario piensa desde la máquina que
 * tiene enfrente ("¿qué me toca en la MS 2?"), no desde el número de orden.
 *
 * Se agrupa por impresora y no se muestra una lista plana porque con 53 órdenes
 * la lista plana era un muro de botones. Cada operario abre su sección.
 *
 * Consulta LÍNEAS y las agrupa acá: una misma OP puede repartirse entre varias
 * impresoras, así que pedirle al backend "órdenes" mezclaría trabajo de otra
 * máquina dentro de la misma tarjeta.
 */
export function PanelPendientes({
  onElegirOp,
  onCerrar,
}: {
  onElegirOp: (codigoOp: string) => void
  /** Presente cuando ya hay una OP abierta: el panel deja de ser el foco. */
  onCerrar?: () => void
}) {
  const [busqueda, setBusqueda] = useState('')

  const { data, isFetching } = useQuery({
    queryKey: ['consumo', 'pendientes'],
    queryFn: () => costeoConsumoApi.pendientes(),
  })

  // impresora -> OP -> totales. Se agrupa acá porque el backend devuelve líneas.
  const porImpresora = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    const filtradas = (data?.lineas ?? []).filter(
      (l: LineaPendiente) =>
        !t ||
        l.codigoOp.toLowerCase().includes(t) ||
        (l.cliente ?? '').toLowerCase().includes(t) ||
        l.producto.toLowerCase().includes(t),
    )
    const m = new Map<string, Map<string, OpPendiente>>()
    for (const l of filtradas) {
      const imp = l.impresora?.codigo ?? 'Sin impresora'
      const ops = m.get(imp) ?? new Map<string, OpPendiente>()
      const op = ops.get(l.codigoOp) ?? {
        codigoOp: l.codigoOp,
        cliente: l.cliente,
        lineas: 0,
        piezas: 0,
      }
      op.lineas++
      op.piezas += l.totalPiezas
      ops.set(l.codigoOp, op)
      m.set(imp, ops)
    }
    return [...m.entries()]
      .map(([impresora, ops]) => ({ impresora, ops: [...ops.values()] }))
      .sort((a, b) => a.impresora.localeCompare(b.impresora, 'es'))
  }, [data, busqueda])

  // Distintas, no la suma por grupo: una OP repartida entre dos impresoras
  // aparece en ambas secciones y se contaría dos veces.
  const totalOps = new Set(porImpresora.flatMap((g) => g.ops.map((o) => o.codigoOp))).size

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          Trabajo pendiente{' '}
          <span className="text-muted-foreground font-normal">
            ({totalOps} {totalOps === 1 ? 'orden' : 'órdenes'})
          </span>
        </span>
        {onCerrar && (
          <Button variant="ghost" size="sm" onClick={onCerrar}>
            Ocultar
          </Button>
        )}
      </div>

      <Input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Filtrar por orden, cliente o producto…"
        className="h-8 max-w-xs"
      />

      {isFetching ? (
        <p className="text-muted-foreground text-xs">Cargando…</p>
      ) : porImpresora.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {busqueda ? 'Nada coincide con ese filtro.' : 'No hay líneas pendientes.'}
        </p>
      ) : (
        <div className="space-y-1">
          {porImpresora.map((g) => (
            <GrupoColapsable
              // `defaultAbierto` solo se lee al montar, así que la key incluye
              // si hay búsqueda activa: al filtrar, los grupos se reabren solos
              // en vez de esconder los resultados detrás de un clic.
              key={`${g.impresora}-${busqueda ? 'f' : ''}`}
              titulo={`${g.impresora} · ${g.ops.length} orden${g.ops.length === 1 ? '' : 'es'}`}
              // Con una sola impresora en pantalla no tiene sentido esconderla.
              defaultAbierto={porImpresora.length === 1 || !!busqueda}
            >
              <div className="flex flex-wrap gap-1.5 pt-1">
                {g.ops.map((op) => (
                  <Button
                    key={op.codigoOp}
                    variant="outline"
                    size="sm"
                    className="h-auto flex-col items-start gap-0 py-1.5"
                    onClick={() => onElegirOp(op.codigoOp)}
                  >
                    <span className="font-mono text-xs font-semibold">{op.codigoOp}</span>
                    <span className="text-muted-foreground text-[11px]">
                      {op.lineas} lín · {op.piezas} pzs{op.cliente ? ` · ${op.cliente}` : ''}
                    </span>
                  </Button>
                ))}
              </div>
            </GrupoColapsable>
          ))}
        </div>
      )}
    </div>
  )
}
