import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { apiFetch } from '@/lib/api'
import type { ListadoTablerosBi } from './types'

export const biApi = {
  tableros: () => apiFetch<ListadoTablerosBi>('/bi/tableros'),
  /** Acceso de corta vida a UN tablero, con la empresa de la sesión fijada por el servidor. */
  token: (clave: string) =>
    apiFetch<{ token: string }>(`/bi/token/${encodeURIComponent(clave)}`, { method: 'POST' }),
}

/**
 * Tableros que el usuario puede ver en la empresa actual.
 *
 * Se calcula en el servidor (permiso por tablero + si Superset está
 * configurado), no en el navegador: el sidebar y la página tienen que coincidir
 * con lo que el servidor de verdad entregaría.
 *
 * La empresa va en la clave de la consulta: el listado puede cambiar al cambiar
 * de empresa y no debe reutilizarse el de la anterior.
 */
export function useTablerosBi() {
  const { idEmpresa, tienePermiso } = useAuth()
  const puedeAlguno = tienePermiso('costeo.dashboard.ver') || tienePermiso('costeo.dashboard.ver_financiero')
  return useQuery({
    queryKey: ['bi', 'tableros', idEmpresa],
    queryFn: biApi.tableros,
    enabled: puedeAlguno && idEmpresa != null,
    staleTime: 5 * 60 * 1000,
  })
}
