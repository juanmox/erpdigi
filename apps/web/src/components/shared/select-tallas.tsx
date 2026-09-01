import { useMemo } from 'react'
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
} from '@/components/ui/select'

export interface TallaOpcion {
  idTalla: number
  nombre: string
  orden: number
  grupo?: string | null
  frecuente?: boolean
}

/** Etiquetas legibles; el valor crudo se guarda en `recetas.tallas.grupo`. */
const ETIQUETA: Record<string, string> = {
  YOUTH: 'Youth',
  ADULT: 'Adulto',
  MEN: 'Hombre',
  WOMEN: 'Mujer',
  LADIES_FIT: 'Ladies Fit',
  NUMERICA: 'Numérica',
  PANT: 'Pantalón',
  COMBINADA: 'Combinada',
}

/** Clave interna del bloque que va primero; no existe como grupo en la base. */
const FRECUENTES = '__frecuentes__'

/**
 * Contenido de un `<Select>` de tallas, agrupado por línea de prenda.
 *
 * Existe porque el catálogo pasó de 13 a 155 tallas al preparar F4 (Consumo de
 * Papel): las 142 que faltaban bloqueaban 583 filas del catálogo real de consumo
 * estándar. Una lista plana de 155 opciones es inusable, y `recetas.tallas.grupo`
 * ya estaba en el modelo justo para esto.
 *
 * Solo se renderiza el encabezado de grupo cuando hay más de uno, así que si
 * alguna pantalla recibe un subconjunto chico se ve igual que antes.
 */
export function ContenidoSelectTallas({
  tallas,
  opcionVacia,
  valorPor = 'id',
}: {
  tallas: TallaOpcion[] | undefined
  /** Ítem que va primero, ej. `{ value: '__ninguna__', label: 'Sin talla' }`. */
  opcionVacia?: { value: string; label: string }
  /**
   * Qué guarda el Select. `recetas.productos.tamano` es texto libre y no un FK,
   * así que esa pantalla guarda el nombre; las demás guardan el id.
   */
  valorPor?: 'id' | 'nombre'
}) {
  const grupos = useMemo(() => {
    const m = new Map<string, TallaOpcion[]>()
    for (const t of tallas ?? []) {
      // Las frecuentes van SOLO en su bloque, no repetidas en su línea de
      // prenda: un mismo value dos veces rompería el Select.
      const g = t.frecuente ? FRECUENTES : t.grupo || 'ADULT'
      const lista = m.get(g)
      if (lista) lista.push(t)
      else m.set(g, [t])
    }
    // Entre grupos manda el `orden` de sus tallas (el seed lo asignó en
    // bloques), salvo el de frecuentes, que siempre va primero.
    return [...m.entries()].sort((a, b) => {
      if (a[0] === FRECUENTES) return -1
      if (b[0] === FRECUENTES) return 1
      return Math.min(...a[1].map((t) => t.orden)) - Math.min(...b[1].map((t) => t.orden))
    })
  }, [tallas])

  const variosGrupos = grupos.length > 1

  return (
    <SelectContent className="max-h-80">
      {opcionVacia && <SelectItem value={opcionVacia.value}>{opcionVacia.label}</SelectItem>}
      {grupos.map(([grupo, lista]) => (
        <SelectGroup key={grupo}>
          {variosGrupos && (
            <SelectLabel>{grupo === FRECUENTES ? 'Más usadas' : (ETIQUETA[grupo] ?? grupo)}</SelectLabel>
          )}
          {lista.map((t) => (
            <SelectItem key={t.idTalla} value={valorPor === 'id' ? String(t.idTalla) : t.nombre}>
              {t.nombre}
            </SelectItem>
          ))}
        </SelectGroup>
      ))}
    </SelectContent>
  )
}
