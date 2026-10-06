import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface GrupoColapsableProps {
  /**
   * `ReactNode` y no `string`: el encabezado de Impresión de OPs lleva el
   * nombre de la impresora más sus contadores con estilos distintos. Ensanchar
   * el tipo es compatible hacia atrás — un `string` ya es un `ReactNode`.
   *
   * ⚠️ El encabezado ES un `<button>`, así que lo que se pase no puede traer
   * otro botón adentro: un botón anidado es HTML inválido y React lo reporta
   * como error de hidratación (ya pasó en la tabla de Órdenes).
   */
  titulo: React.ReactNode
  defaultAbierto?: boolean
  children: React.ReactNode
}

/**
 * Sección con encabezado clickeable que colapsa/expande su contenido.
 * useState local, sin Radix — uso simple (agrupar tarjetas de impresoras por
 * MS_DT/DP), no necesita animación ni controlar el estado desde afuera.
 */
export function GrupoColapsable({ titulo, defaultAbierto = true, children }: GrupoColapsableProps) {
  const [abierto, setAbierto] = useState(defaultAbierto)

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted"
      >
        <ChevronDownIcon className={cn('size-3.5 transition-transform', !abierto && '-rotate-90')} />
        {titulo}
      </button>
      {abierto && <div className="mt-1">{children}</div>}
    </div>
  )
}
