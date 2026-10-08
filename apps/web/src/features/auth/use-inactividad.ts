import { useEffect, useRef, useState } from 'react'

/**
 * Cuánto antes del cierre aparece el aviso, para no perder trabajo a medio
 * hacer. Es un minuto, salvo que el límite sea tan corto que un minuto se lo
 * coma entero: con un límite de 1 minuto, un aviso de 60s estaría visible el
 * 100% del tiempo y dejaría de ser un aviso para volverse parte del decorado
 * (medido en navegador, no supuesto). Por eso nunca pasa del 20% del límite.
 */
function msDeAviso(limiteMs: number): number {
  return Math.min(60_000, limiteMs * 0.2)
}

/**
 * Clave compartida entre pestañas. Sin esto, una pestaña en segundo plano
 * contaría su propia inactividad y cerraría la sesión de TODAS mientras el
 * usuario trabaja tranquilo en otra — las pestañas comparten la cookie de
 * refresco, así que el cierre de una las tumba a todas.
 */
const CLAVE_ACTIVIDAD = 'digitexsa.ultimaActividad'

/**
 * Eventos que cuentan como "el usuario está ahí".
 *
 * ⚠️ Deliberadamente NO cuentan las peticiones de red. Esa es toda la
 * diferencia con acortar la vida del token: la app hace peticiones sola (el
 * panel de impresoras refresca cada 30s, y react-query recarga al recuperar el
 * foco), así que una máquina olvidada se mantendría "viva" para siempre. Lo
 * único que distingue a una persona presente de una pantalla abandonada es el
 * mouse y el teclado.
 */
const EVENTOS = [
  'mousedown',
  'mousemove',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
] as const

function ahora() {
  return Date.now()
}

function leerUltimaActividad(): number {
  try {
    const v = localStorage.getItem(CLAVE_ACTIVIDAD)
    const n = v ? Number(v) : NaN
    return Number.isFinite(n) ? n : ahora()
  } catch {
    // localStorage puede fallar (modo privado, cookies bloqueadas). Sin él se
    // pierde la coordinación entre pestañas, pero el cierre sigue funcionando
    // dentro de cada una: degradar es mejor que romper la sesión entera.
    return ahora()
  }
}

function escribirUltimaActividad(t: number) {
  try {
    localStorage.setItem(CLAVE_ACTIVIDAD, String(t))
  } catch {
    /* ver leerUltimaActividad */
  }
}

/**
 * Cierra la sesión tras N minutos sin actividad REAL del usuario.
 *
 * Existe porque en planta las máquinas quedan desatendidas y otro operario
 * podría enviar consumo con la sesión de un compañero. El token por sí solo no
 * resuelve eso: se renueva mientras la pestaña esté abierta.
 *
 * `minutos = 0` significa "nunca cerrar" y es un valor legítimo —roles de
 * oficina—, no un vacío.
 *
 * ⚠️ Esto vive en el navegador, así que no es una barrera de seguridad dura:
 * alguien con conocimientos técnicos podría evitarlo. Protege el caso real
 * (pantalla olvidada), no a un atacante decidido. El tope duro de sesión, que
 * sí es del lado del servidor, quedó para una fase aparte.
 */
export function useInactividad(
  minutos: number,
  activo: boolean,
  onCerrar: () => void,
) {
  const [segundosRestantes, setSegundosRestantes] = useState<number | null>(null)
  // En un ref para que el intervalo no se recree en cada render del consumidor;
  // si se recreara, el contador se reiniciaría solo y nunca llegaría a cerrar.
  const onCerrarRef = useRef(onCerrar)
  onCerrarRef.current = onCerrar

  useEffect(() => {
    if (!activo || minutos <= 0) {
      setSegundosRestantes(null)
      return
    }
    const limiteMs = minutos * 60_000

    const marcar = () => {
      const t = ahora()
      escribirUltimaActividad(t)
      setSegundosRestantes(null)
    }
    marcar()

    for (const ev of EVENTOS)
      window.addEventListener(ev, marcar, { passive: true })

    // Un tick por segundo: suficiente para una cuenta regresiva legible y
    // despreciable en costo. No se usa un setTimeout a N minutos porque una
    // laptop suspendida lo retrasa, y al despertar seguiría contando desde
    // donde quedó en vez de notar que pasó el tiempo real.
    const tick = window.setInterval(() => {
      const inactivoMs = ahora() - leerUltimaActividad()
      const restanteMs = limiteMs - inactivoMs

      if (restanteMs <= 0) {
        setSegundosRestantes(null)
        onCerrarRef.current()
        return
      }
      setSegundosRestantes(
        restanteMs <= msDeAviso(limiteMs) ? Math.ceil(restanteMs / 1000) : null,
      )
    }, 1000)

    return () => {
      for (const ev of EVENTOS) window.removeEventListener(ev, marcar)
      window.clearInterval(tick)
    }
  }, [minutos, activo])

  /** Cuenta regresiva visible, o null si todavía falta mucho. */
  return { segundosRestantes, seguirConectado: () => escribirUltimaActividad(ahora()) }
}
