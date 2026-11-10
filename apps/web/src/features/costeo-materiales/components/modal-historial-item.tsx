import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { costeoMaterialesApi } from '../api'
import { AccionBadge, CambiosDeEvento } from './historial-comun'
import { fechaHora } from './historial-etiquetas'

const ESTADO: Record<string, string> = { PENDIENTE: 'Pendiente', ENTREGADO: 'Entregado', ANULADO: 'Anulado' }

/**
 * La historia de UN ítem: cómo se cargó y cada cambio que tuvo, con quién lo
 * hizo, cuándo y por qué. Del más antiguo al más reciente, que es como se lee
 * una historia.
 */
export function ModalHistorialItem({ idMaterialOp, onCerrar }: { idMaterialOp: number | null; onCerrar: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['costeo-materiales', 'historial-item', idMaterialOp],
    queryFn: () => costeoMaterialesApi.historialDeItem(idMaterialOp!),
    enabled: idMaterialOp != null,
  })

  return (
    <Dialog open={idMaterialOp != null} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial del ítem</DialogTitle>
          <DialogDescription>
            {data ? (
              <>
                <span className="font-mono">{data.item.codigoOp}</span> ·{' '}
                <span className="font-mono">{data.item.insumoCodigo}</span> {data.item.insumoDescripcion}
              </>
            ) : (
              'Cómo se cargó y cada cambio que tuvo.'
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-muted-foreground text-sm">Cargando…</p>}
        {error && <p className="text-destructive text-sm">{error instanceof ApiError ? error.message : 'No se pudo cargar el historial'}</p>}

        {data && (
          <>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>
                Planificación <span className="text-foreground font-mono">{data.item.ordenPlanificacion}</span>
              </span>
              <span>
                Cantidad{' '}
                <span className="text-foreground">
                  {data.item.cantidad.toLocaleString('es-GT', { maximumFractionDigits: 4 })} {data.item.unidad}
                </span>
              </span>
              <Badge variant={data.item.estado === 'ANULADO' ? 'destructive' : 'outline'}>{ESTADO[data.item.estado]}</Badge>
              <span>
                {data.eventos.length - 1 === 0
                  ? 'Sin modificaciones desde que se cargó'
                  : `${data.eventos.length - 1} cambio(s) desde que se cargó`}
              </span>
            </div>

            <ol className="border-border relative ml-2 space-y-4 border-l pl-5">
              {data.eventos.map((e) => (
                <li key={`${e.accion}-${e.id}`} className="relative">
                  <span className="bg-primary absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full" aria-hidden />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <AccionBadge accion={e.accion} />
                    <span className="text-sm font-medium">{e.usuario}</span>
                    <span className="text-muted-foreground text-xs">{fechaHora(e.fecha)}</span>
                  </div>
                  {e.detalle && <p className="text-muted-foreground mt-1 text-sm">{e.detalle}</p>}
                  {e.cambios.length > 0 && (
                    <div className="mt-1.5">
                      <CambiosDeEvento cambios={e.cambios} />
                    </div>
                  )}
                  {e.motivo && (
                    <p className="bg-muted/60 mt-1.5 rounded-md px-2.5 py-1.5 text-sm break-words">
                      <span className="text-muted-foreground">Motivo: </span>
                      {e.motivo}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
