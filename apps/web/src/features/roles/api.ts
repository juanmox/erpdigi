import { apiFetch } from '@/lib/api'
import type { PermisoCatalogo, Rol } from './types'

export const rolesApi = {
  listar: () => apiFetch<Rol[]>('/roles'),
  permisos: () => apiFetch<PermisoCatalogo[]>('/permisos'),
  crear: (body: { codigo: string; nombre: string; descripcion?: string }) =>
    apiFetch<Rol>('/roles', { method: 'POST', body: JSON.stringify(body) }),
  /**
   * Va aparte de los permisos a propósito: editar permisos marca el rol como
   * `personalizado` y el tiempo de sesión no debe arrastrar ese efecto.
   */
  actualizarInactividad: (idRol: number, minutosInactividad: number | null) =>
    apiFetch<Rol>(`/roles/${idRol}/inactividad`, {
      method: 'PATCH',
      body: JSON.stringify({ minutosInactividad }),
    }),
  /** Reemplaza el conjunto completo de permisos, no manda un delta. */
  actualizarPermisos: (idRol: number, codigosPermisos: string[]) =>
    apiFetch<Rol>(`/roles/${idRol}/permisos`, {
      method: 'PATCH',
      body: JSON.stringify({ codigosPermisos }),
    }),
}
