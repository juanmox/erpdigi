import { useEffect, useRef, useState } from 'react'
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

/**
 * Autocompletar genérico con navegación ↑/↓/Enter/Escape — reemplaza los widgets
 * duplicados de buscar-producto (cotización) y buscar-insumo (receta) de 01_erp.
 * El padre controla el filtrado/fetch de `items`; este componente solo maneja
 * abrir/cerrar la lista, el índice activo y la selección.
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
  const contenedorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false)
      }
    }
    document.addEventListener('click', onClickFuera)
    return () => document.removeEventListener('click', onClickFuera)
  }, [])

  useEffect(() => {
    setIdxActivo(-1)
  }, [items])

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
        className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
      {abierto && (
        <div className="bg-popover text-popover-foreground absolute top-full z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-md border shadow-md">
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
        </div>
      )}
    </div>
  )
}
