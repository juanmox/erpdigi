import { useQuery } from '@tanstack/react-query'
import { XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { usuariosApi } from '../api'
import type { EmpresaRolUsuario, UsuarioAdmin } from '../types'

interface ModalRolesProps {
  usuario: UsuarioAdmin | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardado: () => void
}

export function ModalRoles({ usuario, open, onOpenChange, onGuardado }: ModalRolesProps) {
  const [detalle, setDetalle] = useState<UsuarioAdmin | null>(usuario)
  const [idEmpresaNueva, setIdEmpresaNueva] = useState('')
  const [idRolNueva, setIdRolNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: roles } = useQuery({ queryKey: ['usuarios', 'roles-disponibles'], queryFn: () => usuariosApi.listarRoles() })
  const { data: empresas } = useQuery({ queryKey: ['usuarios', 'empresas-disponibles'], queryFn: () => usuariosApi.listarEmpresas() })

  useEffect(() => {
    if (open) {
      setDetalle(usuario)
      setIdEmpresaNueva('')
      setIdRolNueva('')
      setError(null)
    }
  }, [open, usuario])

  async function asignar() {
    if (!idEmpresaNueva || !idRolNueva) {
      setError('Elegí una empresa y un rol')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const actualizado = await usuariosApi.asignarRol(detalle!.idUsuario, {
        idEmpresa: Number(idEmpresaNueva),
        idRol: Number(idRolNueva),
      })
      setDetalle(actualizado)
      onGuardado()
      setIdEmpresaNueva('')
      setIdRolNueva('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al asignar el rol')
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(er: EmpresaRolUsuario) {
    setError(null)
    try {
      const actualizado = await usuariosApi.quitarRol(detalle!.idUsuario, er.idEmpresa, er.idRol)
      setDetalle(actualizado)
      onGuardado()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al quitar el rol')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Roles — {detalle?.nombreCompleto}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block text-xs">Roles asignados</Label>
            <div className="flex flex-wrap gap-1.5">
              {detalle?.empresaRoles.length === 0 && <span className="text-xs text-ink-faint">Sin rol asignado</span>}
              {detalle?.empresaRoles.map((er) => (
                <Badge key={er.idUsuarioEmpresaRol} variant="secondary" className="gap-1 py-0 pr-1">
                  {er.rol.nombre} · {er.empresa.nombreComercial ?? er.empresa.codigo}
                  <button
                    type="button"
                    onClick={() => quitar(er)}
                    className="rounded-full p-0.5 hover:bg-black/10"
                    aria-label={`Quitar rol ${er.rol.nombre}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="mb-1 block text-xs">Empresa</Label>
              <Select value={idEmpresaNueva} onValueChange={setIdEmpresaNueva}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas?.map((e) => (
                    <SelectItem key={e.idEmpresa} value={String(e.idEmpresa)}>
                      {e.nombreComercial ?? e.codigo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="mb-1 block text-xs">Rol</Label>
              <Select value={idRolNueva} onValueChange={setIdRolNueva}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles?.map((r) => (
                    <SelectItem key={r.idRol} value={String(r.idRol)}>
                      {r.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" disabled={guardando} onClick={asignar}>
              Agregar
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
