import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AutocompleteBuscadorProps<T> {
  valor: string
  onValorChange: (v: string) => void
  items: T[]
  getKey: (item: T) => string | number
  renderItem: (item: T) => ReactNode
  onSeleccionar: (item: T) => void
  placeholder?: string
  vacioTexto?: string
  disabled?: boolean
  className?: string
  id?: string
}

interface Posicion {
  left: number
  top: number
  width: number
  maxHeight: number
}

const ALTO_DESEADO = 320
const MARGEN = 8

/**
 * Autocompletar genérico con navegación ↑/↓/Enter/Escape — reemplaza los widgets
 * duplicados de buscar-producto (cotización) y buscar-insumo (receta) de 01_erp.
 * El padre controla el filtrado/fetch de `items`; este componente solo maneja
 * abrir/cerrar la lista, el índice activo y la selección.
 *
 * La lista se renderiza en un PORTAL con position: fixed, no como hijo absoluto
 * del input. Sin eso queda recortada por cualquier ancestro con overflow: un
 * DialogContent con overflow-y-auto, o un Card de shadcn con su overflow-hidden
 * por defecto (bug real ya visto en la receta del desarrollo y en la pantalla de
 * cotización). Al vivir en el body, además, se puede medir el espacio real de la
 * ventana y decidir si abrir hacia abajo o hacia arriba.
 */
export function AutocompleteBuscador<T>({
  valor,
  onValorChange,
  items,
  getKey,
  renderItem,
  onSeleccionar,
  placeholder,
  vacioTexto = 'Sin resultados',
  disabled,
  className,
  id,
}: AutocompleteBuscadorProps<T>) {
  const [abierto, setAbierto] = useState(false)
  const [idxActivo, setIdxActivo] = useState(-1)
  const [pos, setPos] = useState<Posicion | null>(null)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      const t = e.target as Node
      // La lista ya no es descendiente del contenedor (vive en un portal), así
      // que hay que exceptuarla a mano o un clic en ella cerraría la lista
      // antes de que el ítem procese su propio onClick.
      if (contenedorRef.current?.contains(t) || listaRef.current?.contains(t)) return
      setAbierto(false)
    }
    document.addEventListener('click', onClickFuera)
    return () => document.removeEventListener('click', onClickFuera)
  }, [])

  useEffect(() => {
    setIdxActivo(-1)
  }, [items])

  // Posición y alto máximo, recalculados mientras la lista está abierta: abre
  // hacia el lado con más espacio y nunca se sale de la ventana.
  useLayoutEffect(() => {
    if (!abierto) {
      setPos(null)
      return
    }
    function medir() {
      const el = contenedorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const abajo = window.innerHeight - r.bottom - MARGEN
      const arriba = r.top - MARGEN
      const haciaAbajo = abajo >= Math.min(ALTO_DESEADO, arriba)
      const disponible = Math.max(120, haciaAbajo ? abajo : arriba)
      const maxHeight = Math.min(ALTO_DESEADO, disponible)
      setPos({
        left: r.left,
        width: r.width,
        top: haciaAbajo ? r.bottom + 4 : r.top - 4 - maxHeight,
        maxHeight,
      })
    }
    medir()
    window.addEventListener('resize', medir)
    // capture: true para enterarse también del scroll de contenedores internos
    // (el DialogContent), no solo del de la ventana.
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [abierto, items.length])

  function seleccionar(i: number) {
    const item = items[i]
    if (!item) return
    onSeleccionar(item)
    setAbierto(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!abierto || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdxActivo((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdxActivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (idxActivo >= 0) seleccionar(idxActivo)
    } else if (e.key === 'Escape') {
      setAbierto(false)
    }
  }

  return (
    <div ref={contenedorRef} className={cn('relative', className)}>
      <input
        id={id}
        type="text"
        className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={valor}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          onValorChange(e.target.value)
          setAbierto(true)
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={onKeyDown}
      />
      {abierto &&
        pos &&
        createPortal(
          <div
            ref={listaRef}
            style={{
              left: pos.left,
              top: pos.top,
              width: pos.width,
              maxHeight: pos.maxHeight,
              // Un Dialog modal de Radix pone `pointer-events: none` en el body
              // y solo lo reactiva dentro del DialogContent. Como esta lista es
              // hija directa del body, sin esto se ve pero NO se puede clickear.
              pointerEvents: 'auto',
            }}
            // Radix cierra el diálogo ante un pointerdown fuera del
            // DialogContent, y la lista lo está (vive en el portal). Cortar la
            // propagación evita que elegir un ítem cierre el modal entero.
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-popover text-popover-foreground fixed z-[100] overflow-y-auto rounded-md border shadow-md"
          >
            {items.length === 0 ? (
              <div className="text-muted-foreground p-3 text-center text-sm italic">{vacioTexto}</div>
            ) : (
              items.map((item, i) => (
                <div
                  key={getKey(item)}
                  className={cn(
                    'cursor-pointer border-b px-3 py-2 text-sm last:border-b-0',
                    i === idxActivo ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                  onClick={() => seleccionar(i)}
                >
                  {renderItem(item)}
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
