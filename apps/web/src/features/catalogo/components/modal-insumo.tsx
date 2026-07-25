import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { catalogoApi } from '../api'
import type { InsumoCatalogo } from '../types'

interface ModalInsumoProps {
  insumo: InsumoCatalogo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardado: () => void
}

export function ModalInsumo({ insumo, open, onOpenChange, onGuardado }: ModalInsumoProps) {
  const esEdicion = !!insumo

  const { data: categorias } = useQuery({
    queryKey: ['catalogo', 'categorias-insumo'],
    queryFn: () => catalogoApi.categoriasInsumo(),
  })
  const { data: unidades } = useQuery({
    queryKey: ['catalogo', 'unidades-medida'],
    queryFn: () => catalogoApi.unidadesMedida(),
  })

  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [idCategoria, setIdCategoria] = useState('')
  const [idUnidad, setIdUnidad] = useState('')
  const [costoPromedio, setCostoPromedio] = useState('0')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCodigo(insumo?.codigo ?? '')
      setDescripcion(insumo?.descripcion ?? '')
      setIdCategoria(insumo ? String(insumo.idCategoria) : '')
      setIdUnidad(insumo ? String(insumo.idUnidad) : '')
      setCostoPromedio(insumo ? String(insumo.costoPromedio) : '0')
      setError(null)
    }
  }, [open, insumo])

  async function guardar() {
    if (!descripcion.trim() || !idCategoria || !idUnidad || (!esEdicion && !codigo.trim())) {
      setError('Completa todos los campos requeridos')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      if (esEdicion) {
        await catalogoApi.editarInsumo(insumo!.idInsumo, {
          descripcion: descripcion.trim(),
          idCategoria: Number(idCategoria),
          idUnidad: Number(idUnidad),
        })
      } else {
        await catalogoApi.crearInsumo({
          codigo: codigo.trim(),
          descripcion: descripcion.trim(),
          idCategoria: Number(idCategoria),
          idUnidad: Number(idUnidad),
          costoPromedio: Number(costoPromedio) || 0,
        })
      }
      onGuardado()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar el insumo')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar insumo' : 'Nuevo insumo'}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Código</Label>
            <Input value={codigo} disabled={esEdicion} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Categoría</Label>
            <Select value={idCategoria} onValueChange={setIdCategoria}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona una categoría" />
              </SelectTrigger>
              <SelectContent>
                {categorias?.map((c) => (
                  <SelectItem key={c.idCategoria} value={String(c.idCategoria)}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Unidad de medida</Label>
            <Select value={idUnidad} onValueChange={setIdUnidad}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona una unidad" />
              </SelectTrigger>
              <SelectContent>
                {unidades?.map((u) => (
                  <SelectItem key={u.idUnidad} value={String(u.idUnidad)}>
                    {u.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!esEdicion && (
            <div>
              <Label className="mb-1 block text-xs">Costo promedio inicial (Q)</Label>
              <Input type="number" step="0.000001" min={0} value={costoPromedio} onChange={(e) => setCostoPromedio(e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
