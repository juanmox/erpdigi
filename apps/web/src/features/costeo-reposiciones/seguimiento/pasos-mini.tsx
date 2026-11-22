import { cn } from '@/lib/utils'
import { fechaHoraGT, NOMBRE_PASO, pasoEnCurso } from '../flujo'
import type { FilaSeguimiento } from '../types'

/**
 * Los 8 pasos del flujo como puntos: hechos (llenos), el actual (resaltado) y los
 * que faltan (vacíos). El detalle de quién validó va en el `title` de cada punto.
 */
export function PasosMini({ fila }: { fila: FilaSeguimiento }) {
  if (fila.estado === 'HISTORICA') return <span className="text-[11px] text-ink-faint">Anterior al flujo</span>
  const actual = pasoEnCurso(fila)
  const validacion = (paso: number) => fila.validaciones.find((v) => v.paso === paso)
  return (
    <div className="flex items-center gap-1" aria-label={`Paso actual: ${actual > 8 ? 'terminada' : NOMBRE_PASO[actual]}`}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => {
        const hecho = p < actual || actual > 8 || (p === 1 && actual > 1)
        const esActual = p === actual && !fila.anuladoEn
        const v = validacion(p)
        const titulo = `${p}. ${NOMBRE_PASO[p]}${v ? ` — ${v.usuario}, ${fechaHoraGT(v.fecha)}` : esActual ? ' — pendiente' : ''}`
        return (
          <span
            key={p}
            title={titulo}
            className={cn(
              'inline-block size-2.5 rounded-full border',
              hecho && 'border-emerald-600 bg-emerald-500',
              esActual && (fila.estado === 'DEVUELTA' ? 'border-amber-600 bg-amber-400 ring-2 ring-amber-400/40' : 'border-sky-600 bg-sky-500 ring-2 ring-sky-400/40'),
              !hecho && !esActual && 'border-border bg-transparent',
              fila.anuladoEn && 'opacity-40',
            )}
          />
        )
      })}
    </div>
  )
}
