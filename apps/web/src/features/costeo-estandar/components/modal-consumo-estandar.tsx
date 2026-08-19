import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { AutocompleteBuscador } from '@/components/shared/autocomplete-buscador'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { catalogoApi } from '@/features/catalogo/api'
import { recetasApi } from '@/features/recetas/api'
import type { ProductoListado } from '@/features/recetas/types'
import { costeoEstandarApi } from '../api'

interface ModalConsumoEstandarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModalConsumoEstandar({ open, onOpenChange }: ModalConsumoEstandarProps) {
  const queryClient = useQueryClient()
  const [textoBusqueda, setTextoBusqueda] = useState('')
  const [q, setQ] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [producto, setProducto] = useState<ProductoListado | null>(null)
  const [idTalla, setIdTalla] = useState('')
  const [pulgadasPapel, setPulgadasPapel] = useState('')
  const [vigenteDesde, setVigenteDesde] = useState('')
  const [vigenteHasta, setVigenteHasta] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onTextoBusquedaChange(v: string) {
    setTextoBusqueda(v)
    setProducto(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim() === '') setQ('')
    else debounceRef.current = setTimeout(() => setQ(v), 250)
  }

  const { data: listadoProductos } = useQuery({
    queryKey: ['recetas', 'productos', { q }],
    queryFn: () => recetasApi.productos({ q: q || undefined }),
    enabled: open && q !== '',
  })
  const { data: tallas } = useQuery({
    queryKey: ['catalogo', 'tallas'],
    queryFn: () => catalogoApi.tallas(),
    enabled: open,
  })

  function limpiar() {
    setTextoBusqueda('')
    setQ('')
    setProducto(null)
    setIdTalla('')
    setPulgadasPapel('')
    setVigenteDesde('')
    setVigenteHasta('')
    setError(null)
  }

  async function guardar() {
    if (!producto || !idTalla || !pulgadasPapel) {
      setError('Elegí un producto, una talla, y escribí las pulgadas de papel')
      return
    }
    const pulgadas = Number(pulgadasPapel)
    if (!Number.isFinite(pulgadas) || pulgadas <= 0) {
      setError('Pulgadas de papel inválidas')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await costeoEstandarApi.crear({
        idProducto: producto.idProducto,
        idTalla: Number(idTalla),
        pulgadasPapel: pulgadas,
        vigenteDesde: vigenteDesde || undefined,
        vigenteHasta: vigenteHasta || undefined,
      })
      queryClient.invalidateQueries({ queryKey: ['costeo', 'estandar'] })
      limpiar()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear el consumo estándar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) limpiar()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-lg overflow-visible">
        <DialogHeader>
          <DialogTitle>Nuevo consumo estándar</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Producto</Label>
            {producto ? (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>
                  <span className="text-primary font-semibold">{producto.codigo}</span> — {producto.descripcion}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setProducto(null)}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <AutocompleteBuscador
                valor={textoBusqueda}
                onValorChange={onTextoBusquedaChange}
                items={listadoProductos?.productos ?? []}
                getKey={(p) => p.idProducto}
                onSeleccionar={(p) => {
                  setProducto(p)
                  setTextoBusqueda(p.codigo)
                }}
                placeholder="Buscar por código o descripción…"
                vacioTexto={q ? 'Sin productos que coincidan' : 'Escribí para buscar…'}
                renderItem={(p) => (
                  <div>
                    <span className="text-primary font-semibold">{p.codigo}</span> — {p.descripcion}
                  </div>
                )}
              />
            )}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="mb-1 block text-xs">Talla</Label>
              <Select value={idTalla} onValueChange={setIdTalla}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {tallas?.map((t) => (
                    <SelectItem key={t.idTalla} value={String(t.idTalla)}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="mb-1 block text-xs">Pulgadas de papel</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={pulgadasPapel}
                onChange={(e) => setPulgadasPapel(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="mb-1 block text-xs">Vigente desde (opcional, hoy si se deja vacío)</Label>
              <Input type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} />
            </div>
            <div className="flex-1">
              <Label className="mb-1 block text-xs">Vigente hasta (opcional)</Label>
              <Input type="date" value={vigenteHasta} onChange={(e) => setVigenteHasta(e.target.value)} />
            </div>
          </div>

          <Button className="w-full" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
