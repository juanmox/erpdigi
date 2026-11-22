import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/auth-context'
import { costeoReposicionesApi } from './api'
import { PERMISO_PASO } from './flujo'

/** Quien tiene alguna cola propia: un paso de validación, imprimir o despachar. */
const PERMISOS_COLA = [
  ...Object.values(PERMISO_PASO),
  'costeo.reposicion.imprimir_requisicion',
  'costeo.reposicion.despachar',
]

/** Lo comparten el aviso del Shell y los contadores del menú (una sola consulta). */
export function useAvisosReposiciones() {
  const { usuario, idEmpresa, tienePermiso } = useAuth()
  const activo =
    !!usuario &&
    idEmpresa != null &&
    tienePermiso('costeo.reposicion.ver') &&
    (PERMISOS_COLA.some(tienePermiso) || tienePermiso('costeo.reposicion.crear'))
  return useQuery({
    // Bajo 'costeo-reposiciones': validar, devolver o corregir ya invalidan ese
    // prefijo, así que el contador se actualiza al instante y no al minuto.
    queryKey: ['costeo-reposiciones', 'avisos', idEmpresa],
    queryFn: () => costeoReposicionesApi.avisos(),
    enabled: activo,
    refetchInterval: 60_000,
    // Sin esto, con la pestaña en segundo plano no consultaría, que es justo
    // cuando la notificación de Windows hace falta.
    refetchIntervalInBackground: true,
    staleTime: 30_000,
  })
}
