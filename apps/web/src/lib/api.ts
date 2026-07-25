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
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function rawFetch(path: string, options: RequestInit) {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
}

const RUTAS_SIN_REINTENTO = new Set(['/auth/login', '/auth/refresh'])

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, options)

  if (res.status === 401 && !RUTAS_SIN_REINTENTO.has(path) && refreshHandler) {
    const seRefresco = await refreshHandler()
    if (seRefresco) {
      res = await rawFetch(path, options)
    }
  }

  if (!res.ok) {
    const cuerpo = await res.json().catch(() => ({}) as Record<string, unknown>)
    const mensaje = typeof cuerpo.message === 'string' ? cuerpo.message : `Error ${res.status}`
    throw new ApiError(res.status, mensaje)
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
    throw new ApiError(res.status, mensaje)
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
