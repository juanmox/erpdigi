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
import type { ProductoCatalogo } from '../types'

const SIN_VALOR = '__ninguno__'

interface ModalProductoProps {
  producto: ProductoCatalogo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardado: () => void
}

export function ModalProducto({ producto, open, onOpenChange, onGuardado }: ModalProductoProps) {
  const esEdicion = !!producto

  const { data: clientes } = useQuery({ queryKey: ['catalogo', 'clientes'], queryFn: () => catalogoApi.clientes() })
  const { data: tallas } = useQuery({ queryKey: ['catalogo', 'tallas'], queryFn: () => catalogoApi.tallas() })
  const { data: deportes } = useQuery({ queryKey: ['catalogo', 'deportes'], queryFn: () => catalogoApi.deportes() })

  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [idCliente, setIdCliente] = useState('')
  const [desarrollo, setDesarrollo] = useState('')
  const [patron, setPatron] = useState('')
  const [tamano, setTamano] = useState('')
  const [deporte, setDeporte] = useState('')
  const [precioVenta, setPrecioVenta] = useState('0')
  const [minutosMo, setMinutosMo] = useState('0')
  const [costoMoMinuto, setCostoMoMinuto] = useState('0.33')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCodigo(producto?.codigo ?? '')
      setDescripcion(producto?.descripcion ?? '')
      setIdCliente(producto?.idCliente ? String(producto.idCliente) : '')
      setDesarrollo(producto?.desarrollo ?? '')
      setPatron(producto?.patron ?? '')
      setTamano(producto?.tamano ?? '')
      setDeporte(producto?.deporte ?? '')
      setPrecioVenta(producto ? String(producto.precioVenta) : '0')
      setMinutosMo(producto ? String(producto.minutosMo) : '0')
      setCostoMoMinuto(producto ? String(producto.costoMoMinuto) : '0.33')
      setError(null)
    }
  }, [open, producto])

  async function guardar() {
    if (!descripcion.trim() || (!esEdicion && !codigo.trim())) {
      setError('Completa código y descripción')
      return
    }
    setGuardando(true)
    setError(null)
    const body = {
      descripcion: descripcion.trim(),
      idCliente: idCliente ? Number(idCliente) : null,
      desarrollo: desarrollo.trim() || null,
      patron: patron.trim() || null,
      tamano: tamano || null,
      deporte: deporte || null,
      precioVenta: Number(precioVenta) || 0,
      minutosMo: Number(minutosMo) || 0,
      costoMoMinuto: Number(costoMoMinuto) || 0.33,
    }
    try {
      if (esEdicion) {
        await catalogoApi.editarProducto(producto!.idProducto, body)
      } else {
        await catalogoApi.crearProducto({ ...body, codigo: codigo.trim() })
      }
      onGuardado()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar el producto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{esEdicion ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1 block text-xs">Código</Label>
            <Input value={codigo} disabled={esEdicion} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="mb-1 block text-xs">Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
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
          <div>
            <Label className="mb-1 block text-xs">Deporte</Label>
            <Select value={deporte || SIN_VALOR} onValueChange={(v) => setDeporte(v === SIN_VALOR ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin deporte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VALOR}>Sin deporte</SelectItem>
                {deportes?.map((d) => (
                  <SelectItem key={d.idDeporte} value={d.nombre}>
                    {d.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Desarrollo</Label>
            <Input value={desarrollo} onChange={(e) => setDesarrollo(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Patrón</Label>
            <Input value={patron} onChange={(e) => setPatron(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Talla</Label>
            <Select value={tamano || SIN_VALOR} onValueChange={(v) => setTamano(v === SIN_VALOR ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin talla" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VALOR}>Sin talla</SelectItem>
                {tallas?.map((t) => (
                  <SelectItem key={t.idTalla} value={t.nombre}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Precio venta (US$)</Label>
            <Input type="number" step="0.01" min={0} value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Minutos de mano de obra</Label>
            <Input type="number" step="1" min={0} value={minutosMo} onChange={(e) => setMinutosMo(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Costo MO por minuto (Q)</Label>
            <Input type="number" step="0.01" min={0} value={costoMoMinuto} onChange={(e) => setCostoMoMinuto(e.target.value)} />
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
