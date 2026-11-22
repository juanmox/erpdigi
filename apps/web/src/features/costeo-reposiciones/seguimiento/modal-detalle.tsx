import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { costeoReposicionesApi } from '../api'
import { duracion, fechaHoraGT } from '../flujo'
import type { FilaSeguimiento } from '../types'
import { PasosMini } from './pasos-mini'
import { ChipEstado } from './tabla-seguimiento'

const ACCION: Record<string, { texto: string; clase: string }> = {
  CREAR: { texto: 'Creó', clase: 'border-border' },
  VALIDAR: { texto: 'Validó', clase: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  DEVOLVER: { texto: 'Devolvió', clase: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  CORREGIR: { texto: 'Corrigió y reenvió', clase: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400' },
  IMPRIMIR: { texto: 'Imprimió requisición', clase: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400' },
  REIMPRIMIR: { texto: 'Reimprimió (copia)', clase: 'border-border' },
  DESPACHAR: { texto: 'Despachó', clase: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  ANULAR: { texto: 'Anuló', clase: 'border-destructive/40 bg-destructive/10 text-destructive' },
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-faint">{etiqueta}</div>
      <div className="text-sm break-words text-ink">{valor || '—'}</div>
    </div>
  )
}

/** Todos los datos del formulario y la línea de tiempo con cuánto tardó cada paso. */
export function ModalDetalleReposicion({ fila, onCerrar }: { fila: FilaSeguimiento | null; onCerrar: () => void }) {
  const { data: eventos, isLoading } = useQuery({
    queryKey: ['costeo-reposiciones', 'eventos', fila?.idReposicion],
    queryFn: () => costeoReposicionesApi.eventos(fila!.idReposicion),
    enabled: !!fila,
  })

  return (
    <Dialog open={!!fila} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
        {fila && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{fila.codigo}</span>
                <ChipEstado f={fila} />
                {fila.requisicion && (
                  <Badge variant="outline">RQ-{String(fila.requisicion.numero).padStart(6, '0')}</Badge>
                )}
              </DialogTitle>
              {/* DialogDescription es un <p>: el indicador de pasos (un <div>) va afuera. */}
              <DialogDescription>
                {fila.cliente ?? '—'} · registrada por {fila.creadoPorNombre ?? '—'} el {fechaHoraGT(fila.creadoEn)}
              </DialogDescription>
              <PasosMini fila={fila} />
            </DialogHeader>

            {fila.anuladoEn && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Anulada el {fechaHoraGT(fila.anuladoEn)}: {fila.motivoAnulacion}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 rounded-md border p-3 sm:grid-cols-3">
              <Dato etiqueta="Fecha" valor={fechaHoraGT(fila.fecha)} />
              <Dato etiqueta="OP" valor={fila.codigoOp} />
              <Dato etiqueta="Tipo" valor={fila.tipo === 'MATERIALES' ? 'Materiales' : 'Reimpresión'} />
              <Dato etiqueta="Departamento" valor={fila.departamento} />
              <Dato etiqueta="Defecto" valor={fila.defecto} />
              <Dato etiqueta="Responsable" valor={fila.responsable} />
              <Dato etiqueta="Bodega SAC" valor={fila.bodegaSac} />
              {fila.tipo === 'REIMPRESION' && (
                <>
                  <Dato etiqueta="Impresora" valor={fila.impresora} />
                  <Dato etiqueta="Papel" valor={`${fila.yardasPapel} yd${fila.tipoPapel ? ` · ${fila.tipoPapel}` : ' · (se resuelve al autorizar)'}`} />
                  <Dato etiqueta="Calandra" valor={fila.calandra} />
                  <Dato etiqueta="Tela" valor={fila.tela ? `${fila.yardasTela} yd · ${fila.tela.codigo} ${fila.tela.descripcion}` : null} />
                </>
              )}
              {fila.requisicion?.numeroTalonario && <Dato etiqueta="Nº talonario" valor={fila.requisicion.numeroTalonario} />}
            </div>

            {fila.prendas.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-ink-muted">Prendas repuestas</div>
                <ul className="space-y-0.5 text-sm">
                  {fila.prendas.map((p, i) => (
                    <li key={i}>
                      <span className="font-mono text-xs">{p.producto}</span> · talla {p.talla} · {p.pieza} × {p.cantidad}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fila.materiales.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-ink-muted">Materiales</div>
                <ul className="space-y-0.5 text-sm">
                  {fila.materiales.map((m, i) => (
                    <li key={i}>
                      <span className="font-mono text-xs">{m.codigo}</span> {m.descripcion} — {m.cantidad} {m.unidad.toLowerCase()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fila.comentario && (
              <div>
                <div className="mb-1 text-xs font-medium text-ink-muted">Comentario</div>
                <p className="text-sm whitespace-pre-wrap">{fila.comentario}</p>
              </div>
            )}

            <div>
              <div className="mb-2 text-xs font-medium text-ink-muted">Línea de tiempo</div>
              {isLoading ? (
                <p className="text-sm text-ink-faint">Cargando…</p>
              ) : !eventos || eventos.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  {fila.estado === 'HISTORICA' ? 'Es anterior al flujo de validaciones: no tiene línea de tiempo.' : 'Sin eventos.'}
                </p>
              ) : (
                <ol className="relative ml-2 space-y-3 border-l border-border pl-5">
                  {eventos.map((e) => {
                    const a = ACCION[e.accion] ?? { texto: e.accion, clase: '' }
                    const mostrarTiempo = e.accion !== 'CREAR' && e.accion !== 'REIMPRIMIR'
                    return (
                      <li key={e.idEvento} className="relative">
                        <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full bg-primary" />
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant="outline" className={a.clase}>
                            {a.texto}
                          </Badge>
                          <span className="text-ink-muted">{e.paso}. {e.nombrePaso}</span>
                          <span className="font-medium text-ink">{e.usuario}</span>
                          <span className="text-xs text-ink-faint">{fechaHoraGT(e.fecha)}</span>
                          {mostrarTiempo && (
                            <span className="text-xs text-ink-faint">
                              · {e.accion === 'CORREGIR' ? 'tardó en corregir' : 'tardó'} {duracion(e.segundos)}
                            </span>
                          )}
                        </div>
                        {e.motivo && (
                          <div className="mt-1 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
                            <span className="font-medium">{e.accion === 'CORREGIR' ? 'Nota: ' : 'Motivo: '}</span>
                            {e.motivo}
                          </div>
                        )}
                        {e.cambios.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
                            {e.cambios.map((c, i) => (
                              <li key={i}>
                                <span className="font-medium">{c.campo}:</span> {c.antes ?? '—'} → {c.despues ?? '—'}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
