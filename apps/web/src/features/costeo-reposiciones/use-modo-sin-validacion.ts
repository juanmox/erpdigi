import { useQuery } from '@tanstack/react-query'
import { costeoReposicionesApi } from './api'

export const CLAVE_CONFIGURACION = ['costeo-reposiciones', 'configuracion']

/**
 * ¿La empresa tiene prendido el modo transitorio sin validaciones? Mientras se
 * capacita a quienes validan, las reposiciones se autorizan al registrarse, como
 * antes del flujo. El servidor es quien decide; esto solo cambia lo que se muestra.
 */
export function useModoSinValidacion() {
  const { data } = useQuery({
    queryKey: CLAVE_CONFIGURACION,
    queryFn: () => costeoReposicionesApi.configuracion(),
    staleTime: 30_000,
  })
  return data?.sinValidacion ?? false
}
