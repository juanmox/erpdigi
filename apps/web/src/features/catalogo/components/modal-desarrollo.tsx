import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ContenidoSelectTallas } from '@/components/shared/select-tallas'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { catalogoApi } from '../api'
import type { Desarrollo } from '../types'

const SIN_VALOR = '__ninguno__'

interface Props {
  desarrollo: Desarrollo | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModalDesarrollo({ desarrollo, open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const esEdicion = !!desarrollo

  const { data: clientes } = useQuery({
    queryKey: ['catalogo', 'clientes'],
    queryFn: () => catalogoApi.clientes(),
    enabled: open,
  })
  const { data: tallas } = useQuery({
    queryKey: ['catalogo', 'tallas'],
    queryFn: () => catalogoApi.tallas(),
    enabled: open,
  })

  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [idCliente, setIdCliente] = useState('')
  const [idTallaBase, setIdTallaBase] = useState('')
  const [minutosMo, setMinutosMo] = useState('0')
  const [costoMoMinuto, setCostoMoMinuto] = useState('0.33')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setCodigo(desarrollo?.codigo ?? '')
    setDescripcion(desarrollo?.descripcion ?? '')
    setIdCliente(desarrollo?.idCliente ? String(desarrollo.idCliente) : '')
    setIdTallaBase(desarrollo?.idTallaBase ? String(desarrollo.idTallaBase) : '')
    setMinutosMo(String(desarrollo?.minutosMo ?? 0))
    setCostoMoMinuto(String(desarrollo?.costoMoMinuto ?? 0.33))
    setNotas(desarrollo?.notas ?? '')
  }, [open, desarrollo])

  async function guardar() {
    if (!codigo.trim() || !descripcion.trim()) {
      setError('Completá código y descripción')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const body = {
        descripcion: descripcion.trim(),
        idCliente: idCliente ? Number(idCliente) : null,
        idTallaBase: idTallaBase ? Number(idTallaBase) : null,
        minutosMo: Number(minutosMo) || 0,
        costoMoMinuto: Number(costoMoMinuto) || 0,
        notas: notas.trim() || null,
      }
      if (esEdicion) {
        await catalogoApi.editarDesarrollo(desarrollo!.idDesarrollo, body)
      } else {
        // El código solo se define al crear: es lo que referencia
        // productos.desarrollo, y como no hay FK que haga CASCADE, renombrarlo
        // dejaría al producto colgando.
        await catalogoApi.crearDesarrollo({ ...body, codigo: codigo.trim() })
      }
      queryClient.invalidateQueries({ queryKey: ['catalogo', 'desarrollos'] })
      queryClient.invalidateQueries({ queryKey: ['catalogo', 'desarrollo'] })
      queryClient.invalidateQueries({ queryKey: ['catalogo', 'productos'] })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar el desarrollo')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{esEdicion ? `Editar desarrollo — ${desarrollo!.codigo}` : 'Nuevo desarrollo'}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block text-xs">Código</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={esEdicion} placeholder="Ej: 2300002907" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Cliente</Label>
            <Select value={idCliente || SIN_VALOR} onValueChange={(v) => setIdCliente(v === SIN_VALOR ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VALOR}>Sin cliente</SelectItem>
                {clientes?.map((c) => (
                  <SelectItem key={c.idCliente} value={String(c.idCliente)}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block text-xs">Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Talla base</Label>
            <Select value={idTallaBase || SIN_VALOR} onValueChange={(v) => setIdTallaBase(v === SIN_VALOR ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin talla" />
              </SelectTrigger>
              <ContenidoSelectTallas tallas={tallas} opcionVacia={{ value: SIN_VALOR, label: 'Sin talla' }} />
            </Select>
            <p className="text-muted-foreground mt-1 text-xs">Talla con la que se calculó el consumo.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Minutos MO</Label>
              <Input type="number" step="0.01" min={0} value={minutosMo} onChange={(e) => setMinutosMo(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Costo MO/min (Q)</Label>
              <Input type="number" step="0.0001" min={0} value={costoMoMinuto} onChange={(e) => setCostoMoMinuto(e.target.value)} />
            </div>
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block text-xs">Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
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
