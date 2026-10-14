const API_BASE = '/erp/api'

let accessToken: string | null = null
let refreshHandler: (() => Promise<boolean>) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function registerRefreshHandler(fn: () => Promise<boolean>) {
  refreshHandler = fn
}

export class ApiError extends Error {
  status: number
  /**
   * `motivo` del cuerpo de error, cuando el servidor manda uno.
   *
   * Sirve para que la pantalla distinga CASOS sin comparar el texto del
   * mensaje, que se rompe en cuanto alguien lo reescribe. Mismo patron que ya
   * usaba `SIN_ROLLO_MONTADO`, que hasta ahora solo viajaba dentro de
   * respuestas 2xx (el resumen de `capturarLote`) y no en excepciones.
   */
  motivo?: string
  constructor(status: number, message: string, motivo?: string) {
    super(message)
    this.status = status
    this.motivo = motivo
  }
}

async function rawFetch(path: string, options: RequestInit) {
  const headers = new Headers(options.headers)
  // Los imports Excel mandan un File crudo como body (ver subirArchivo() en
  // los distintos api.ts de features) — forzar aquí application/json
  // etiquetaba mal ese binario, y el navegador nunca llegaba a poner el
  // content-type real del archivo (que sí distingue el parser raw del lado
  // del servidor). Bug real: "Unexpected token 'P' ... is not valid JSON"
  // ("PK" son los bytes mágicos de un .xlsx, que es un ZIP).
  if (!(options.body instanceof FormData) && !(options.body instanceof Blob)) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
}

const RUTAS_SIN_REINTENTO = new Set(['/auth/login', '/auth/refresh'])

/** Refresh en curso, para que varios 401 simultáneos esperen al MISMO. */
let refrescoEnVuelo: Promise<boolean> | null = null

/**
 * Renueva la sesión una sola vez aunque la pidan N llamadas a la vez.
 *
 * ⚠️ Sin esto, el refresh token se reutilizaba y el servidor cerraba la sesión.
 * El backend ROTA el refresh en cada uso y trata la reutilización de uno ya
 * rotado como robo de token, revocando todas las sesiones del usuario. Una
 * pantalla que dispara varias consultas en paralelo (Reposiciones hace 6)
 * recibe, cuando vence el access token, varios 401 a la vez: cada uno pedía su
 * propio refresh con la MISMA cookie, el primero la rotaba y los demás llegaban
 * con la vieja y disparaban la detección de robo.
 *
 * El síntoma desconcertaba porque aterrizaba en Inicio sin pedir la contraseña,
 * y la secuencia explica por qué: el refresh perdedor falla, `intentarRefrescar`
 * deja el estado vacío, `RutaProtegida` navega a `/login` — y un instante
 * después el refresh ganador aplica su sesión, con lo cual `RutaPublica` ve al
 * usuario autenticado y lo rebota de `/login` a `/`. Resultado: la pantalla de
 * login nunca se llega a ver y lo que estuviera llenando se pierde.
 *
 * Reportado el 2026-10-14 sobre el formulario de Reposiciones. Reproducido
 * contra la API con 6 refresh en paralelo (2 pasaban y 4 devolvían "Sesión
 * inválida, inicie sesión nuevamente"), y en el navegador: 8 endpoints con 401
 * simultáneo disparaban 8 refresh antes de esto y 1 por tanda después.
 */
function refrescarSesion(): Promise<boolean> {
  if (!refreshHandler) return Promise.resolve(false)
  refrescoEnVuelo ??= refreshHandler().finally(() => {
    refrescoEnVuelo = null
  })
  return refrescoEnVuelo
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, options)

  if (res.status === 401 && !RUTAS_SIN_REINTENTO.has(path) && refreshHandler) {
    const seRefresco = await refrescarSesion()
    if (seRefresco) {
      res = await rawFetch(path, options)
    }
  }

  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}) as Record<string, unknown>)
    const mensaje = typeof cuerpo.message === 'string' ? cuerpo.message : `Error ${res.status}`
    throw new ApiError(
      res.status,
      mensaje,
      typeof cuerpo.motivo === 'string' ? cuerpo.motivo : undefined,
    )
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Para descargas protegidas (export/plantillas Excel) — un <a href> normal no manda el Bearer token. */
export async function descargarArchivo(path: string, nombreArchivo: string): Promise<void> {
  const res = await rawFetch(path, { method: 'GET' })
  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}) as Record<string, unknown>)
    const mensaje = typeof cuerpo.message === 'string' ? cuerpo.message : `Error ${res.status}`
    throw new ApiError(
      res.status,
      mensaje,
      typeof cuerpo.motivo === 'string' ? cuerpo.motivo : undefined,
    )
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
