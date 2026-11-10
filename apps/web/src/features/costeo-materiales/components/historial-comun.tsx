import { Badge } from '@/components/ui/badge'
import type { AccionHistorial, CambioMaterial } from '../types'
import { ETIQUETA_ACCION } from './historial-etiquetas'

/**
 * Lo que comparten el modal del historial de UN ítem y la pestaña del historial
 * general: cómo se pinta cada acción y cada campo, y cómo se escribe un valor.
 */

const ETIQUETA_CAMPO: Record<string, string> = {
  ordenPlanificacion: 'Orden de planificación',
  fechaPlanificador: 'Fecha del planificador',
  codigoOp: 'OP',
  insumo: 'Insumo',
  cantidad: 'Cantidad',
  comentario: 'Comentario',
  costoUnitario: 'Costo unitario',
  estado: 'Estado',
  salidaSac: 'Salida SAC',
  fechaEntrega: 'Fecha de entrega',
  opLigada: 'OP en el ERP',
}

/** Qué tan "grave" se ve cada acción: las correcciones se distinguen de lo rutinario. */
const VARIANTE: Record<AccionHistorial, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  CARGA: 'outline',
  EDITAR: 'default',
  ANULAR: 'destructive',
  ENTREGAR: 'secondary',
  CORREGIR_FECHA: 'default',
  REVERTIR: 'destructive',
  COSTO_CONGELADO: 'outline',
  LIGAR_OP: 'outline',
}

export function AccionBadge({ accion }: { accion: AccionHistorial }) {
  return <Badge variant={VARIANTE[accion]}>{ETIQUETA_ACCION[accion] ?? accion}</Badge>
}

/** yyyy-mm-dd -> dd/mm/aaaa, sin pasar por Date (evita el corrimiento de zona). */
const fechaCorta = (dia: string) => {
  const [a, m, d] = dia.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Un valor del historial como se lee en pantalla; `null` es "vacío", no un texto. */
function valor(campo: string, v: string | null): string | null {
  if (v == null) return null
  if (campo === 'fechaPlanificador' || campo === 'fechaEntrega') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? fechaCorta(v) : v
  if (campo === 'cantidad') return Number(v).toLocaleString('es-GT', { maximumFractionDigits: 4 })
  if (campo === 'costoUnitario')
    return 'Q ' + Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
  return v
}

function Valor({ campo, v }: { campo: string; v: string | null }) {
  const t = valor(campo, v)
  return t == null ? <span className="text-muted-foreground italic">vacío</span> : <span className="break-words">{t}</span>
}

/** Los campos de un acto como líneas "Campo: antes → después". */
export function CambiosDeEvento({ cambios }: { cambios: CambioMaterial[] }) {
  if (cambios.length === 0) return null
  return (
    <ul className="space-y-0.5 text-sm">
      {cambios.map((c, i) => (
        <li key={`${c.campo}-${i}`} className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-muted-foreground">{ETIQUETA_CAMPO[c.campo] ?? c.campo}:</span>
          <Valor campo={c.campo} v={c.antes} />
          <span className="text-muted-foreground">→</span>
          <span className="font-medium">
            <Valor campo={c.campo} v={c.despues} />
          </span>
        </li>
      ))}
    </ul>
  )
}
