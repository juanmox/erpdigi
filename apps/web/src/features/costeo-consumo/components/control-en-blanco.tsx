import { useEffect, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'

/**
 * Rango permitido del papel en blanco. Es el mismo que impone el CHECK de la
 * base y el DTO: tenerlo acá es solo para que el `<input>` no deje escribir
 * algo que el servidor va a rechazar igual.
 */
export const EN_BLANCO_MIN = 2
export const EN_BLANCO_MAX = 10

/**
 * El control del papel en blanco: la casilla y su cantidad, siempre juntas.
 *
 * Vive en su propio archivo porque lo usan los DOS puntos de la pantalla de
 * Impresión de OPs: la fila de la orden en la cola de pendientes y la cabecera
 * de una orden buscada por código. Ese segundo lugar no es un lujo — una orden
 * ya impresa por completo desaparece de la cola, y desde que el checkbox salió
 * de Órdenes de Producción (2026-10-07) sería el único lugar donde corregirla.
 *
 * ⚠️ La cantidad se guarda al SALIR del campo (o con Enter), no en cada tecla.
 * Un primer diseño guardaba en cada `change`, y al probarlo se vio el costo
 * real: elegir 7 con las flechas disparó diez PATCH seguidos (4·2·6·7·8·9·10…).
 * Sobre una orden sin imprimir eso solo ensucia la auditoría, pero sobre una ya
 * impresa cada paso ANULA Y RECREA la fila de consumo, así que dejaría cinco
 * pares anulado/creado en el histórico para un solo cambio de opinión.
 */
export function ControlEnBlanco({
  codigo,
  consumoEnBlanco,
  enBlancoYd,
  onCambiar,
  habilitado,
}: {
  codigo: string
  consumoEnBlanco: boolean
  enBlancoYd: number
  onCambiar: (marcado: boolean, yardas: number) => void
  habilitado: boolean
}) {
  const [valor, setValor] = useState(String(enBlancoYd))
  // El servidor es la fuente: si la cantidad cambia por fuera (otro refetch, o
  // un rechazo que revierte), el campo tiene que reflejarlo.
  useEffect(() => setValor(String(enBlancoYd)), [enBlancoYd])

  function confirmar() {
    const n = Number(valor)
    const valido = Number.isInteger(n) && n >= EN_BLANCO_MIN && n <= EN_BLANCO_MAX
    // Un valor fuera de rango no se manda: se descarta y vuelve el del
    // servidor, en vez de dejar al operario creyendo que guardó algo.
    if (!valido) return setValor(String(enBlancoYd))
    if (n !== enBlancoYd) onCambiar(true, n)
  }

  return (
    <div className="flex items-center gap-1.5">
      <Checkbox
        checked={consumoEnBlanco}
        disabled={!habilitado}
        aria-label={`Papel en blanco de ${codigo}`}
        onCheckedChange={(c) => onCambiar(c === true, enBlancoYd)}
      />
      {/* La cantidad solo se habilita si está marcada: un número editable con
          la casilla apagada invita a creer que ya se cargó algo. */}
      <input
        type="number"
        min={EN_BLANCO_MIN}
        max={EN_BLANCO_MAX}
        step={1}
        value={valor}
        disabled={!habilitado || !consumoEnBlanco}
        aria-label={`Yardas en blanco de ${codigo}`}
        onChange={(e) => setValor(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        className="border-border bg-background text-ink h-7 w-12 rounded border px-1 text-center text-xs disabled:opacity-40"
      />
      <span className="text-ink-faint text-[11px]">yd</span>
    </div>
  )
}
