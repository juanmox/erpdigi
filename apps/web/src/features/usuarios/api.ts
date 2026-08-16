import { apiFetch } from '@/lib/api'
import type { EmpresaOpcion, RolOpcion, UsuarioAdmin } from './types'

export const usuariosApi = {
  listar: () => apiFetch<UsuarioAdmin[]>('/usuarios'),
  crear: (body: { username: string; email?: string; password: string; nombreCompleto: string }) =>
    apiFetch<UsuarioAdmin>('/usuarios', { method: 'POST', body: JSON.stringify(body) }),
  editar: (id: number, body: { username?: string; email?: string; nombreCompleto?: string }) =>
    apiFetch<UsuarioAdmin>(`/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  establecerPassword: (id: number, password: string) =>
    apiFetch<UsuarioAdmin>(`/usuarios/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
  activar: (id: number) => apiFetch<UsuarioAdmin>(`/usuarios/${id}/activar`, { method: 'PATCH' }),
  desactivar: (id: number) => apiFetch<UsuarioAdmin>(`/usuarios/${id}/desactivar`, { method: 'PATCH' }),
  asignarRol: (id: number, body: { idEmpresa: number; idRol: number }) =>
    apiFetch<UsuarioAdmin>(`/usuarios/${id}/roles`, { method: 'POST', body: JSON.stringify(body) }),
  quitarRol: (id: number, idEmpresa: number, idRol: number) =>
    apiFetch<UsuarioAdmin>(`/usuarios/${id}/roles/${idEmpresa}/${idRol}`, { method: 'DELETE' }),
  listarRoles: () => apiFetch<RolOpcion[]>('/roles'),
  listarEmpresas: () => apiFetch<EmpresaOpcion[]>('/empresas'),
}
