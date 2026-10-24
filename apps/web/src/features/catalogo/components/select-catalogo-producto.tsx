import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { catalogoApi } from '../api'
import type { TipoCatalogoProducto } from '../types'

const SIN_VALOR = '__ninguno__'

/** Clave de caché compartida con el modal de catálogos, para que se refresquen juntos. */
export const claveCatalogoProducto = (tipo: TipoCatalogoProducto) => ['catalogo', 'catalogo-producto', tipo] as const

/**
 * Selector de uno de los cuatro catálogos que describen al producto, con alta
 * en línea ("+ Agregar") para no tener que salir del formulario cuando el
 * valor que hace falta todavía no existe.
 *
 * Ofrece los ACTIVOS más el valor que el producto ya tiene aunque esté
 * retirado: sin eso el formulario mostraría "Sin estilo" para un producto que
 * sí lo tiene, y guardarlo lo perdería de verdad (mismo cuidado que con el
 * cliente retirado en el modal de producto).
 */
export function SelectCatalogoProducto({
  tipo,
  etiqueta,
  articulo,
  valor,
  onChange,
  puedeAgregar,
}: {
  tipo: TipoCatalogoProducto
  etiqueta: string
  /** "el"/"la": concuerda el texto de las opciones ("Sin estilo", "Sin línea"). */
  articulo: 'el' | 'la'
  /** id como texto; '' = sin valor. */
  valor: string
  onChange: (valor: string) => void
  puedeAgregar: boolean
}) {
  const queryClient = useQueryClient()
  const { data: valores } = useQuery({
    queryKey: claveCatalogoProducto(tipo),
    queryFn: () => catalogoApi.catalogoProducto(tipo),
  })

  const [agregando, setAgregando] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const opciones = (valores ?? []).filter((v) => v.activo || String(v.id) === valor)
  const sin = `Sin ${etiqueta.toLowerCase()}`

  async function agregar() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setGuardando(true)
    try {
      const creado = await catalogoApi.crearCatalogoProducto(tipo, nombre)
      await queryClient.invalidateQueries({ queryKey: claveCatalogoProducto(tipo) })
      onChange(String(creado.id))
      setNombreNuevo('')
      setAgregando(false)
      avisarExito(`Agregado: ${creado.nombre}`)
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : `No se pudo agregar ${articulo} ${etiqueta.toLowerCase()}`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="block text-xs">{etiqueta}</Label>
        {puedeAgregar && !agregando && (
          <button
            type="button"
            className="text-accent-brand text-[11px] hover:underline"
            onClick={() => setAgregando(true)}
          >
            + Agregar
          </button>
        )}
      </div>
      <Select value={valor || SIN_VALOR} onValueChange={(v) => onChange(v === SIN_VALOR ? '' : v)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={sin} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={SIN_VALOR}>{sin}</SelectItem>
          {opciones.map((v) => (
            <SelectItem key={v.id} value={String(v.id)}>
              {v.nombre}
              {!v.activo && ' (retirado)'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {agregando && (
        <div className="mt-1 flex gap-1">
          <Input
            autoFocus
            value={nombreNuevo}
            placeholder={`Nuevo valor de ${etiqueta.toLowerCase()}`}
            className="h-8"
            onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void agregar()
              }
              if (e.key === 'Escape') setAgregando(false)
            }}
          />
          <Button type="button" size="sm" disabled={guardando || !nombreNuevo.trim()} onClick={() => void agregar()}>
            {guardando ? '…' : 'Agregar'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAgregando(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  )
}
