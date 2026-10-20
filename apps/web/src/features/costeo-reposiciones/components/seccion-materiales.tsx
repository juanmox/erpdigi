import { useMemo, useState } from 'react'
import { AutocompleteBuscador } from '@/components/shared/autocomplete-buscador'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { InsumoTela } from '../types'

export interface LineaMaterial {
  idInsumo: number
  codigo: string
  descripcion: string
  unidad: string
  cantidad: string
}

/**
 * Las líneas de material de una reposición tipo MATERIALES.
 *
 * Una requisición lleva N materiales, no uno: de 309 grupos de reposiciones
 * que comparten OP, fecha, departamento y defecto, 229 tienen insumos
 * distintos — ya se partía una requisición en varias filas porque solo cabía
 * un insumo.
 *
 * ⚠️ La cantidad se muestra con la unidad del insumo al lado y NO se convierte
 * nada: el hilo se guarda en yardas pero bodega lo entrega en conos, y el
 * largo del cono no está en los datos (de 165 descripciones de hilo solo una
 * lo menciona, y dice 5000 yd). Una ayuda de conversión fija estaría mal.
 */
export function SeccionMateriales({
  lineas,
  onChange,
  insumos,
  disabled,
}: {
  lineas: LineaMaterial[]
  onChange: (lineas: LineaMaterial[]) => void
  insumos: InsumoTela[] | undefined
  disabled?: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const [elegido, setElegido] = useState<InsumoTela | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const yaPuestos = useMemo(() => new Set(lineas.map((l) => l.idInsumo)), [lineas])

  const opciones = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    const todos = (insumos ?? []).filter((i) => !yaPuestos.has(i.idInsumo))
    // Los de Materiales primero: son los que se requisan casi siempre. Pero no
    // se excluyen los demás — alguien ya pidió un papel adhesivo 5 veces por
    // el casillero de tela, así que la cerca por categoría tiene fuga.
    const orden = (i: InsumoTela) => (i.categoria === 'Materiales' ? 0 : 1)
    const filtrados = texto
      ? todos.filter(
          (i) =>
            i.codigo.toLowerCase().includes(texto) ||
            i.descripcion.toLowerCase().includes(texto),
        )
      : todos
    return [...filtrados].sort((a, b) => orden(a) - orden(b)).slice(0, 40)
  }, [insumos, busqueda, yaPuestos])

  function agregar() {
    if (!elegido) {
      setAviso('Elegí un material de la lista.')
      return
    }
    const n = Number(cantidad)
    if (!cantidad.trim() || !Number.isFinite(n) || n <= 0) {
      setAviso('La cantidad tiene que ser mayor que cero.')
      return
    }
    onChange([
      ...lineas,
      {
        idInsumo: elegido.idInsumo,
        codigo: elegido.codigo,
        descripcion: elegido.descripcion,
        unidad: elegido.unidad ?? '',
        cantidad: String(n),
      },
    ])
    setElegido(null)
    setBusqueda('')
    setCantidad('')
    setAviso(null)
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <Label className="mb-1 block text-xs">Material</Label>
        <AutocompleteBuscador
          valor={busqueda}
          onValorChange={(v) => {
            setBusqueda(v)
            setElegido(null)
            setAviso(null)
          }}
          items={opciones}
          getKey={(i) => i.idInsumo}
          renderItem={(i) => (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-xs">{i.codigo}</span>
              <span className="break-words">{i.descripcion}</span>
              {i.unidad && (
                <span className="text-ink-faint text-xs">({i.unidad})</span>
              )}
            </span>
          )}
          onSeleccionar={(i) => {
            setElegido(i)
            setBusqueda(`${i.codigo} · ${i.descripcion}`)
            setAviso(null)
          }}
          placeholder="Buscar por código o descripción…"
          vacioTexto="Ningún material coincide"
          disabled={disabled}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Label className="mb-1 block text-xs">
            Cantidad{elegido?.unidad ? ` (${elegido.unidad})` : ''}
          </Label>
          <Input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={cantidad}
            onChange={(e) => {
              setCantidad(e.target.value)
              setAviso(null)
            }}
            disabled={disabled || !elegido}
          />
        </div>
        <Button type="button" variant="outline" onClick={agregar} disabled={disabled}>
          Agregar
        </Button>
      </div>

      {aviso && <p className="text-destructive text-xs">{aviso}</p>}

      {lineas.length === 0 ? (
        <p className="text-ink-faint text-xs">
          Todavía no agregaste ningún material. Una requisición de materiales necesita al
          menos uno.
        </p>
      ) : (
        <ul className="space-y-1">
          {lineas.map((l) => (
            <li
              key={l.idInsumo}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-border px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs">{l.codigo}</span>{' '}
                <span className="break-words">{l.descripcion}</span>
              </span>
              <span className="tabular-nums">
                {l.cantidad} {l.unidad}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(lineas.filter((x) => x.idInsumo !== l.idInsumo))}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
