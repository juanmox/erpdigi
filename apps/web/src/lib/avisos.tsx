import { toast } from 'sonner'
import type { ReactNode } from 'react'

/**
 * Avisos emergentes (toasts), con tres niveles de gravedad fijos para que
 * cada pantalla no decida colores ni tiempos por su cuenta. Pensado a partir
 * de la pantalla de Reposiciones, donde el error de validación quedaba
 * incrustado arriba del formulario, fuera de vista una vez que se bajaba a
 * llenar los campos — obligaba a volver a subir para saber qué pasó.
 */

export interface CampoFaltante {
  /** La sección del formulario donde está ("Papel", "Tela"...), si aplica. */
  seccion?: string
  /** El nombre del campo, legible ("Yardas de papel"). */
  etiqueta: string
}

/**
 * Una acción se completó. Se va sola a los 4s — tiempo de sobra para leerla,
 * sin quedar estorbando. Puede llevar un botón (ej. "Imprimir").
 */
export function avisarExito(
  mensaje: string,
  accion?: { etiqueta: string; onClick: () => void },
) {
  toast.success(mensaje, {
    duration: 4000,
    action: accion ? { label: accion.etiqueta, onClick: accion.onClick } : undefined,
  })
}

/**
 * Datos obligatorios que faltan antes de poder guardar. Ámbar: no es un
 * error del servidor, es información que falta completar. Se va sola a los
 * 10s — más que de sobra para leerla — porque además los campos quedan
 * marcados en rojo en el formulario (`aria-invalid`), así que la información
 * no se pierde si el toast ya desapareció.
 */
export function avisarFaltan(campos: CampoFaltante[]) {
  const n = campos.length
  toast.warning(`Falta${n === 1 ? '' : 'n'} ${n} dato${n === 1 ? '' : 's'} para registrar`, {
    description: (
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {campos.map((c, i) => (
          <li key={i}>
            {c.seccion ? <span className="font-medium">{c.seccion}: </span> : null}
            {c.etiqueta}
          </li>
        ))}
      </ul>
    ) as ReactNode,
    duration: 10_000,
  })
}

/**
 * Un error real: el servidor rechazó la operación, o la red falló.
 *
 * ⚠️ NO desaparece solo — si se fuera solo, alguien podría no llegar a verlo
 * a tiempo y creer que la operación se guardó cuando en realidad falló.
 */
export function avisarError(mensaje: string) {
  toast.error(mensaje, { duration: Infinity })
}
