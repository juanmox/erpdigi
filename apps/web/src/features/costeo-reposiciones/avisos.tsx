import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAvisosReposiciones } from './use-avisos'

/**
 * Aviso de "tenés reposiciones esperando" (2026-11-19). Con 100-200 reposiciones
 * por día, un validador que no abre la cola no se entera de que tiene trabajo.
 *
 * Tres señales, todas AGRUPADAS (una por reposición se silenciaría en un día):
 *  - un toast que no se va solo hasta que lo cierren, y se actualiza en el lugar;
 *  - un contador en el ítem del menú;
 *  - el número en la pestaña del navegador ("(14) Digitexsa ERP").
 *
 * Y una cuarta que solo existe en un contexto seguro (HTTPS o localhost): la
 * notificación de Windows, para cuando el ERP está detrás de otras ventanas. En
 * `http://192.168.2.13` el navegador no la permite, así que ahí ni se ofrece.
 *
 * Solo funciona mientras el ERP esté abierto: no hay push desde el servidor.
 */

const RUTA = '/costeo/reposiciones/seguimiento'
const TITULO_BASE = 'Digitexsa ERP'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const posterior = (a: string | null, b: string | null) =>
  !!a && (!b || new Date(a).getTime() > new Date(b).getTime())

const puedeNotificarWindows = () =>
  typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext

/** Se oculta solo en cuanto el permiso deja de estar pendiente. */
function BotonActivarWindows() {
  const [permiso, setPermiso] = useState(() => (puedeNotificarWindows() ? Notification.permission : 'denied'))
  if (permiso !== 'default') return null
  return (
    <button
      type="button"
      className="mt-1.5 text-xs font-medium underline underline-offset-2"
      onClick={async () => setPermiso(await Notification.requestPermission())}
    >
      Avisarme también con notificaciones de Windows
    </button>
  )
}

interface Canal {
  id: string
  cantidad: number
  masReciente: string | null
  titulo: string
  cuerpo: ReactNode
  /** El mismo contenido en texto: cuerpo de la notificación de Windows y firma
   *  para saber si cambió (el JSX cambia de identidad en cada render). */
  texto: string
  etiquetaIr: string
  ruta: string
}

/**
 * Un canal = un toast. Se muestra si hay algo y es la primera vez en esta carga,
 * o si llegó algo más nuevo que lo último que se cerró. Mientras está abierto se
 * actualiza en el lugar; si llega a cero, se cierra solo.
 */
function useCanal(c: Canal) {
  const navigate = useNavigate()
  const estado = useRef({ abierto: false, visto: null as string | null, notificado: null as string | null })
  const ultimo = useRef(c.masReciente)
  ultimo.current = c.masReciente
  const actual = useRef(c)
  actual.current = c

  useEffect(() => {
    const e = estado.current
    const c = actual.current
    if (c.cantidad === 0) {
      if (e.abierto) toast.dismiss(c.id)
      e.abierto = false
      e.visto = null
      return
    }
    const nuevo = e.visto == null || posterior(c.masReciente, e.visto)
    if (!e.abierto && !nuevo) return

    const ir = () => {
      e.abierto = false
      e.visto = ultimo.current
      navigate(c.ruta)
    }
    toast.info(c.titulo, {
      id: c.id,
      duration: Infinity,
      description: c.cuerpo,
      action: { label: c.etiquetaIr, onClick: ir },
      onDismiss: () => {
        e.abierto = false
        e.visto = ultimo.current
      },
    })
    e.abierto = true

    // Windows solo si llegó algo nuevo y el ERP no está a la vista: con la
    // pantalla enfrente, el toast alcanza.
    const aLaVista = document.visibilityState === 'visible' && document.hasFocus()
    if (
      puedeNotificarWindows() &&
      Notification.permission === 'granted' &&
      !aLaVista &&
      posterior(c.masReciente, e.notificado)
    ) {
      e.notificado = c.masReciente
      const n = new Notification(c.titulo, {
        body: c.texto,
        // Mismo tag: reemplaza la anterior en vez de apilar una por minuto.
        tag: c.id,
        requireInteraction: true,
      })
      n.onclick = () => {
        window.focus()
        ir()
        toast.dismiss(c.id)
        n.close()
      }
    }
    // Solo cuando cambia lo que se ve, no en cada render del Shell (que se
    // re-renderiza cada segundo durante el aviso de inactividad).
  }, [c.cantidad, c.masReciente, c.texto, navigate])

  // Al cerrar sesión el Shell se desmonta: el toast no puede quedar en el login.
  useEffect(() => () => void toast.dismiss(c.id), [c.id])
}

/** Va montado una sola vez, en el Shell. */
export function AvisosReposiciones() {
  const { data } = useAvisosReposiciones()
  const total = data?.total ?? 0
  const devueltas = data?.devueltas.cantidad ?? 0
  const resumenTexto = (data?.grupos ?? []).map((g) => `${g.etiqueta}: ${g.cantidad}`).join(' · ')

  useCanal({
    id: 'avisos-reposiciones-cola',
    cantidad: total,
    masReciente: data?.masReciente ?? null,
    titulo: `Tenés ${plural(total, 'reposición', 'reposiciones')} esperando tu acción`,
    cuerpo: (
      <div>
        <ul className="mt-0.5 space-y-0.5">
          {(data?.grupos ?? []).map((g) => (
            <li key={g.clave}>
              {g.etiqueta}: <b>{g.cantidad}</b>
            </li>
          ))}
        </ul>
        <BotonActivarWindows />
      </div>
    ),
    texto: resumenTexto,
    etiquetaIr: 'Ir a validar',
    ruta: `${RUTA}?tab=por-validar`,
  })
  useCanal({
    id: 'avisos-reposiciones-devueltas',
    cantidad: devueltas,
    masReciente: data?.devueltas.masReciente ?? null,
    titulo: `Te devolvieron ${plural(devueltas, 'reposición', 'reposiciones')} para corregir`,
    cuerpo: 'Revisá el motivo, corregilas y reenvialas.',
    texto: 'Revisá el motivo, corregilas y reenvialas.',
    etiquetaIr: 'Ver devueltas',
    ruta: `${RUTA}?tab=reposiciones&estado=devueltas`,
  })

  // El número en la pestaña: se ve aunque el ERP esté detrás de otras pestañas.
  const pendientes = total + devueltas
  useEffect(() => {
    document.title = pendientes > 0 ? `(${pendientes}) ${TITULO_BASE}` : TITULO_BASE
    return () => {
      document.title = TITULO_BASE
    }
  }, [pendientes])

  return null
}
