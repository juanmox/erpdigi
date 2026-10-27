import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Pieza, PrendaDisponible } from '../types'

/** Una prenda ya agregada a la reposición: producto + talla + pieza + cantidad. */
export interface LineaPrenda {
  idProducto: number
  codigo: string
  idTalla: number
  talla: string
  idPieza: number
  pieza: string
  cantidad: number
}

const clave = (p: { idProducto: number; idTalla: number; idPieza: number }) =>
  `${p.idProducto}:${p.idTalla}:${p.idPieza}`

/**
 * Qué se repuso: producto + talla + PIEZA + cantidad ("de la talla L del
 * producto X, 3 mangas").
 *
 * Se elige UN producto y UNA pieza y se teclea la cantidad de cada talla que se
 * repuso, todas de una vez; para otra pieza se vuelve a agregar. "PRENDA
 * COMPLETA" es una pieza más del catálogo. Solo se ofrece lo que la orden tiene
 * en sus ítems: el servidor valida lo mismo, esto no es solo cosmética.
 *
 * Las yardas de papel y tela son de la reposición entera y NO se reparten entre
 * prendas ni piezas: aquí solo se dice qué y cuántas.
 */
export function SeccionPrendas({
  disponibles,
  piezas,
  tieneItems,
  prendas,
  onChange,
  onAdministrarPiezas,
  disabled,
}: {
  disponibles: PrendaDisponible[]
  piezas: Pieza[]
  tieneItems: boolean
  prendas: LineaPrenda[]
  onChange: (prendas: LineaPrenda[]) => void
  /** Si viene, se ofrece abrir el mantenimiento del catálogo de piezas. */
  onAdministrarPiezas?: () => void
  disabled?: boolean
}) {
  const [idProducto, setIdProducto] = useState('')
  const [idPieza, setIdPieza] = useState('')
  // Cantidades tecleadas por talla del producto elegido (texto: vacío ≠ 0).
  const [cantidades, setCantidades] = useState<Record<number, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)

  if (!tieneItems) {
    return (
      <p className="text-ink-faint rounded-md border border-dashed border-border p-3 text-xs">
        Esta orden no tiene ítems cargados (es de las migradas del legacy), así que la reposición se
        registra sin indicar prendas.
      </p>
    )
  }

  const producto = disponibles.find((d) => String(d.idProducto) === idProducto)
  const pieza = piezas.find((p) => String(p.idPieza) === idPieza)

  function agregar() {
    if (!producto) {
      setAviso('Elegí un producto de la orden.')
      return
    }
    if (!pieza) {
      setAviso('Elegí la pieza repuesta (si fue toda la prenda, "PRENDA COMPLETA").')
      return
    }
    const nuevas: LineaPrenda[] = []
    for (const t of producto.tallas) {
      const texto = (cantidades[t.idTalla] ?? '').trim()
      if (!texto) continue
      const n = Number(texto)
      if (!Number.isInteger(n) || n < 1) {
        setAviso(`La cantidad de ${t.nombre} tiene que ser un número entero de 1 o más.`)
        return
      }
      nuevas.push({
        idProducto: producto.idProducto,
        codigo: producto.codigo,
        idTalla: t.idTalla,
        talla: t.nombre,
        idPieza: pieza.idPieza,
        pieza: pieza.nombre,
        cantidad: n,
      })
    }
    if (nuevas.length === 0) {
      setAviso('Anotá la cantidad de al menos una talla.')
      return
    }
    // Mismo producto + talla + pieza ya agregado: se suman, porque el servidor
    // rechaza la combinación repetida y el operario no tiene por qué saberlo.
    const resultado = [...prendas]
    for (const n of nuevas) {
      const i = resultado.findIndex((x) => clave(x) === clave(n))
      if (i >= 0) resultado[i] = { ...resultado[i], cantidad: resultado[i].cantidad + n.cantidad }
      else resultado.push(n)
    }
    onChange(resultado)
    // Se conserva el producto (lo normal es reponer varias piezas del mismo) y se
    // limpia lo demás para que no se agregue dos veces sin querer.
    setCantidades({})
    setIdPieza('')
    setAviso(null)
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="mb-1 block text-xs">Producto</Label>
          <Select
            value={idProducto}
            onValueChange={(v) => {
              setIdProducto(v)
              setCantidades({})
              setAviso(null)
            }}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elegir el producto repuesto…" />
            </SelectTrigger>
            <SelectContent>
              {disponibles.map((d) => (
                <SelectItem key={d.idProducto} value={String(d.idProducto)}>
                  {d.codigo}
                  {d.estilo ? ` · ${d.estilo}` : ''}
                  {d.descripcion ? ` · ${d.descripcion}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <Label className="text-xs">Pieza</Label>
            {onAdministrarPiezas && (
              <button
                type="button"
                className="text-ink-faint text-xs underline underline-offset-2 hover:text-ink"
                onClick={onAdministrarPiezas}
              >
                Administrar piezas
              </button>
            )}
          </div>
          <Select
            value={idPieza}
            onValueChange={(v) => {
              setIdPieza(v)
              setAviso(null)
            }}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elegir la pieza…" />
            </SelectTrigger>
            <SelectContent>
              {piezas.map((p) => (
                <SelectItem key={p.idPieza} value={String(p.idPieza)}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {producto && (
        <div>
          <Label className="mb-1 block text-xs">Cantidad repuesta por talla</Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {producto.tallas.map((t) => (
              <div key={t.idTalla} className="rounded border border-border p-1.5">
                <div className="flex items-baseline justify-between gap-1 text-xs">
                  <span className="font-medium text-ink">{t.nombre}</span>
                  <span className="text-ink-faint" title="Prendas pedidas en la orden">
                    de {t.cantidadPedida}
                  </span>
                </div>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={`Cantidad de ${t.nombre}`}
                  value={cantidades[t.idTalla] ?? ''}
                  onChange={(e) => {
                    setCantidades((prev) => ({ ...prev, [t.idTalla]: e.target.value }))
                    setAviso(null)
                  }}
                  disabled={disabled}
                  className="mt-1 h-8"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={agregar} disabled={disabled}>
          Agregar
        </Button>
      </div>

      {aviso && <p className="text-destructive text-xs">{aviso}</p>}

      {prendas.length === 0 ? (
        <p className="text-ink-faint text-xs">
          Todavía no agregaste nada. Esta orden tiene ítems, así que hace falta al menos una prenda
          con su pieza.
        </p>
      ) : (
        <ul className="space-y-1">
          {prendas.map((p) => (
            <li
              key={clave(p)}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-border px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs">{p.codigo}</span> · talla {p.talla} ·{' '}
                <span className="font-medium">{p.pieza}</span>
              </span>
              <span className="tabular-nums">× {p.cantidad}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(prendas.filter((x) => clave(x) !== clave(p)))}
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
