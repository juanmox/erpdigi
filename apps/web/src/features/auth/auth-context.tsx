import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, apiFetch, registerRefreshHandler, setAccessToken } from '@/lib/api'
import { decodeJwt } from '@/lib/jwt'

export interface EmpresaDisponible {
  idEmpresa: number
  codigo: string
  nombreComercial: string | null
  rol: string
}

export interface Usuario {
  idUsuario: number
  username: string
  email: string | null
  nombreCompleto: string
}

interface SesionRespuesta {
  accessToken: string
  usuario: Usuario
  idEmpresa: number | null
  empresasDisponibles: EmpresaDisponible[]
}

interface AuthState {
  usuario: Usuario | null
  idEmpresa: number | null
  empresasDisponibles: EmpresaDisponible[]
  roles: string[]
  permisos: string[]
}

interface AuthContextValue extends AuthState {
  cargando: boolean
  autenticado: boolean
  requiereSeleccionEmpresa: boolean
  login: (username: string, password: string) => Promise<void>
  seleccionarEmpresa: (idEmpresa: number) => Promise<void>
  logout: () => Promise<void>
  tienePermiso: (permiso: string) => boolean
}

const ESTADO_VACIO: AuthState = {
  usuario: null,
  idEmpresa: null,
  empresasDisponibles: [],
  roles: [],
  permisos: [],
}

const AuthContext = createContext<AuthContextValue | null>(null)

function estadoDesdeSesion(sesion: SesionRespuesta): AuthState {
  const claims = decodeJwt(sesion.accessToken)
  return {
    usuario: sesion.usuario,
    idEmpresa: sesion.idEmpresa,
    empresasDisponibles: sesion.empresasDisponibles,
    roles: claims?.roles ?? [],
    permisos: claims?.permisos ?? [],
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<AuthState>(ESTADO_VACIO)
  const [cargando, setCargando] = useState(true)

  const aplicarSesion = useCallback((sesion: SesionRespuesta) => {
    setAccessToken(sesion.accessToken)
    setEstado(estadoDesdeSesion(sesion))
  }, [])

  const intentarRefrescar = useCallback(async (): Promise<boolean> => {
    try {
      const sesion = await apiFetch<SesionRespuesta>('/auth/refresh', { method: 'POST' })
      aplicarSesion(sesion)
      return true
    } catch {
      setAccessToken(null)
      setEstado(ESTADO_VACIO)
      return false
    }
  }, [aplicarSesion])

  useEffect(() => {
    registerRefreshHandler(intentarRefrescar)
    intentarRefrescar().finally(() => setCargando(false))
  }, [intentarRefrescar])

  const login = useCallback(
    async (username: string, password: string) => {
      const sesion = await apiFetch<SesionRespuesta>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      aplicarSesion(sesion)
    },
    [aplicarSesion],
  )

  const seleccionarEmpresa = useCallback(
    async (idEmpresa: number) => {
      const sesion = await apiFetch<SesionRespuesta>('/auth/seleccionar-empresa', {
        method: 'POST',
        body: JSON.stringify({ idEmpresa }),
      })
      aplicarSesion(sesion)
    },
    [aplicarSesion],
  )

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // si el logout falla igual limpiamos la sesión local
    }
    setAccessToken(null)
    setEstado(ESTADO_VACIO)
  }, [])

  const tienePermiso = useCallback((permiso: string) => estado.permisos.includes(permiso), [estado.permisos])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...estado,
      cargando,
      autenticado: estado.usuario !== null,
      requiereSeleccionEmpresa:
        estado.usuario !== null && estado.idEmpresa === null && estado.empresasDisponibles.length > 1,
      login,
      seleccionarEmpresa,
      logout,
      tienePermiso,
    }),
    [estado, cargando, login, seleccionarEmpresa, logout, tienePermiso],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}

export { ApiError }
