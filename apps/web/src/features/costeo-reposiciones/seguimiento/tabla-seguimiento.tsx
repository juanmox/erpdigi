import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  claseEstado,
  clasePuntoSemaforo,
  claseSemaforo,
  etiquetaCorte,
  etiquetaEstado,
  fechaHoraGT,
  minutosTexto,
  textoSemaforo,
  tiempoDesde,
} from '../flujo'
import type { FilaSeguimiento } from '../types'
import { PasosMini } from './pasos-mini'

const resumenPrendas = (f: FilaSeguimiento) =>
  f.prendas.map((p) => `${p.producto} ${p.talla}×${p.cantidad} ${p.pieza}`).join(', ')

const resumenMaterial = (f: FilaSeguimiento) =>
  f.tipo === 'MATERIALES'
    ? f.materiales.map((m) => `${m.codigo} × ${m.cantidad} ${m.unidad.toLowerCase()}`).join(' · ')
    : [
        f.yardasPapel ? `${f.yardasPapel} yd papel${f.impresora ? ` (${f.impresora})` : ''}` : null,
        f.tela ? `${f.yardasTela} yd ${f.tela.codigo}` : null,
      ]
        .filter(Boolean)
        .join(' · ')

/**
 * El semáforo del corte: antes del corte no tiene color (esperar es lo esperado); desde
 * la hora del corte corre hasta que bodega la deja lista; después, la demora en recoger
 * es de quien debe recoger. Los minutos que deciden el color los pone el servidor.
 */
function Espera({ f }: { f: FilaSeguimiento }) {
  if (f.anuladoEn || f.estado === 'HISTORICA') return null
  const s = f.semaforo
  if (!s) {
    // Sin corte asignado (la empresa no tiene cortes configurados): solo el tiempo en el paso.
    if (f.estado === 'DESPACHADA') return null
    return <span className="text-[11px] text-ink-faint">hace {tiempoDesde(f.estadoDesde)}</span>
  }
  const detalle = [
    s.procesoMin != null ? `Corte → lista: ${minutosTexto(s.procesoMin)}${s.procesoCerrado ? '' : ' (corriendo)'}` : null,
    s.esperaMin != null ? `Lista → entrega: ${minutosTexto(s.esperaMin)} (le toca al solicitante)` : null,
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px]', claseSemaforo(s.color))} title={detalle || undefined}>
      <span className={cn('inline-block size-2 shrink-0 rounded-full', clasePuntoSemaforo(s.color))} />
      {etiquetaCorte(s.corteEn)} · {textoSemaforo(s)}
    </span>
  )
}

export function ChipEstado({ f }: { f: Pick<FilaSeguimiento, 'estado' | 'pasoPendiente' | 'anuladoEn'> }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', claseEstado(f))}>
      {etiquetaEstado(f)}
    </Badge>
  )
}

/**
 * Tabla de reposiciones del seguimiento (y de la cola de validación, con
 * selección). En `xl` es tabla; abajo, tarjetas: una tabla de 10 columnas no
 * entra en un teléfono.
 */
export function TablaSeguimiento({
  filas,
  seleccion,
  onAlternar,
  onVer,
  acciones,
  bloqueo,
}: {
  filas: FilaSeguimiento[]
  /** Si viene, se muestran casillas de selección. */
  seleccion?: Set<number>
  onAlternar?: (ids: number[], marcar: boolean) => void
  onVer: (f: FilaSeguimiento) => void
  acciones?: (f: FilaSeguimiento) => React.ReactNode
  /** Motivo por el que una fila no se puede marcar; null si se puede. */
  bloqueo?: (f: FilaSeguimiento) => string | null
}) {
  const conSel = !!seleccion && !!onAlternar
  const marcables = filas.filter((f) => !bloqueo?.(f))
  const todas = marcables.length > 0 && marcables.every((f) => seleccion?.has(f.idReposicion))
  const algunas = marcables.some((f) => seleccion?.has(f.idReposicion))

  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border xl:block">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow>
              {conSel && (
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="Seleccionar todo lo que se ve"
                    checked={todas ? true : algunas ? 'indeterminate' : false}
                    onCheckedChange={(v) => onAlternar!(marcables.map((f) => f.idReposicion), v === true)}
                  />
                </TableHead>
              )}
              <TableHead>Reposición</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Defecto / depto.</TableHead>
              <TableHead>Prendas</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Creada por</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Pasos</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => (
              <TableRow key={f.idReposicion} className={cn(f.anuladoEn && 'opacity-60')}>
                {conSel && (
                  <TableCell>
                    <Checkbox
                      aria-label={`Seleccionar ${f.codigo}`}
                      checked={seleccion!.has(f.idReposicion)}
                      disabled={!!bloqueo?.(f)}
                      title={bloqueo?.(f) ?? undefined}
                      onCheckedChange={(v) => onAlternar!([f.idReposicion], v === true)}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <button type="button" className="font-mono text-xs font-medium text-ink underline-offset-2 hover:underline" onClick={() => onVer(f)}>
                    {f.codigo}
                  </button>
                  <div className="max-w-[160px] truncate text-[11px] text-ink-faint">{f.cliente ?? '—'}</div>
                  {f.requisicion && <div className="text-[11px] text-ink-muted">RQ-{String(f.requisicion.numero).padStart(6, '0')}</div>}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">{fechaHoraGT(f.fecha)}</TableCell>
                <TableCell className="max-w-[180px] text-xs whitespace-normal">
                  {f.defecto}
                  <div className="text-[11px] text-ink-faint">{f.departamento}</div>
                </TableCell>
                <TableCell className="max-w-[220px] text-xs whitespace-normal">{resumenPrendas(f) || '—'}</TableCell>
                <TableCell className="max-w-[200px] text-xs whitespace-normal">
                  {f.tipo === 'MATERIALES' && <Badge variant="secondary" className="mr-1">Materiales</Badge>}
                  {resumenMaterial(f) || '—'}
                </TableCell>
                <TableCell className="text-xs">{f.creadoPorNombre ?? '—'}</TableCell>
                <TableCell>
                  <ChipEstado f={f} />
                  <div>
                    <Espera f={f} />
                  </div>
                  {bloqueo?.(f) && <div className="max-w-[200px] text-[11px] whitespace-normal text-ink-faint">{bloqueo(f)}</div>}
                  {f.devolucion && (
                    <div className="max-w-[200px] text-[11px] whitespace-normal text-amber-700 dark:text-amber-400" title={f.devolucion.motivo ?? ''}>
                      Devuelta por {f.devolucion.usuario}: {f.devolucion.motivo}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <PasosMini fila={f} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onVer(f)}>
                      Ver
                    </Button>
                    {acciones?.(f)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2 xl:hidden">
        {conSel && filas.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={todas ? true : algunas ? 'indeterminate' : false}
              onCheckedChange={(v) => onAlternar!(marcables.map((f) => f.idReposicion), v === true)}
            />
            Seleccionar todo lo que se ve
          </label>
        )}
        {filas.map((f) => (
          <div key={f.idReposicion} className={cn('rounded-md border p-3 text-sm', f.anuladoEn && 'opacity-60')}>
            <div className="flex items-start gap-2">
              {conSel && (
                <Checkbox
                  className="mt-0.5"
                  aria-label={`Seleccionar ${f.codigo}`}
                  checked={seleccion!.has(f.idReposicion)}
                  disabled={!!bloqueo?.(f)}
                  onCheckedChange={(v) => onAlternar!([f.idReposicion], v === true)}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="font-mono text-xs font-semibold text-ink" onClick={() => onVer(f)}>
                    {f.codigo}
                  </button>
                  <ChipEstado f={f} />
                </div>
                <div className="text-xs text-ink-faint">
                  {f.cliente ?? '—'} · {fechaHoraGT(f.fecha)} · {f.creadoPorNombre ?? '—'}
                </div>
                {bloqueo?.(f) && <div className="text-[11px] text-ink-faint">{bloqueo(f)}</div>}
                <div className="mt-1 text-xs">
                  <span className="font-medium">{f.defecto}</span> · {f.departamento}
                </div>
                {resumenPrendas(f) && <div className="mt-1 text-xs break-words">{resumenPrendas(f)}</div>}
                <div className="mt-1 text-xs break-words text-ink-muted">{resumenMaterial(f)}</div>
                {f.devolucion && (
                  <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    Devuelta por {f.devolucion.usuario}: {f.devolucion.motivo}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PasosMini fila={f} />
                    <Espera f={f} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onVer(f)}>
                      Ver
                    </Button>
                    {acciones?.(f)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
