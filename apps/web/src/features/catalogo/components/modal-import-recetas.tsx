import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { catalogoApi } from '../api'
import type { FilaPreviewLineaReceta, FilaPreviewProductoReceta } from '../types'

interface ModalImportRecetasProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAplicado: () => void
}

export function ModalImportRecetas({ open, onOpenChange, onAplicado }: ModalImportRecetasProps) {
  const [productos, setProductos] = useState<FilaPreviewProductoReceta[] | null>(null)
  const [receta, setReceta] = useState<FilaPreviewLineaReceta[] | null>(null)
  const [seleccionProductos, setSeleccionProductos] = useState<Set<number>>(new Set())
  const [seleccionReceta, setSeleccionReceta] = useState<Set<number>>(new Set())
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  function reiniciar() {
    setProductos(null)
    setReceta(null)
    setSeleccionProductos(new Set())
    setSeleccionReceta(new Set())
    setMensaje(null)
  }

  function cerrar(v: boolean) {
    if (!v) reiniciar()
    onOpenChange(v)
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setCargando(true)
    setMensaje(null)
    try {
      const resultado = await catalogoApi.previewImportarRecetas(archivo)
      setProductos(resultado.productos)
      setReceta(resultado.receta)
      setSeleccionProductos(new Set(resultado.productos.filter((p) => !p.error && !p.yaExiste).map((p) => p.fila)))
      setSeleccionReceta(new Set(resultado.receta.filter((r) => !r.error).map((r) => r.fila)))
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al leer el archivo' })
    } finally {
      setCargando(false)
    }
  }

  async function aplicar() {
    if (!productos || !receta) return
    const productosAEnviar = productos.filter((p) => !p.error && !p.yaExiste && seleccionProductos.has(p.fila))
    const recetaAEnviar = receta.filter((r) => !r.error && seleccionReceta.has(r.fila))
    if (productosAEnviar.length === 0 && recetaAEnviar.length === 0) return
    setAplicando(true)
    setMensaje(null)
    try {
      const resultado = await catalogoApi.aplicarImportarRecetas(
        productosAEnviar.map((p) => ({
          codigo: p.codigo,
          descripcion: p.descripcion,
          idCliente: p.idCliente,
          desarrollo: p.desarrollo,
          patron: p.patron,
          tamano: p.tamano,
          deporte: p.deporte,
          precioVenta: p.precioVenta,
          minutosMo: p.minutosMo,
          costoMoMinuto: p.costoMoMinuto,
        })),
        recetaAEnviar.map((r) => ({
          productoCodigo: r.productoCodigo,
          insumoCodigo: r.insumoCodigo,
          consumo: r.consumo as number,
          area: r.area,
        })),
      )
      setMensaje({
        tipo: 'ok',
        texto: `${resultado.productosCreados} producto(s) creado(s), ${resultado.lineasAplicadas} línea(s) de receta aplicada(s)`,
      })
      reiniciar()
      onAplicado()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al aplicar la importación' })
    } finally {
      setAplicando(false)
    }
  }

  function alternarProducto(fila: number) {
    setSeleccionProductos((prev) => {
      const next = new Set(prev)
      if (next.has(fila)) next.delete(fila)
      else next.add(fila)
      return next
    })
  }

  function alternarReceta(fila: number) {
    setSeleccionReceta((prev) => {
      const next = new Set(prev)
      if (next.has(fila)) next.delete(fila)
      else next.add(fila)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden">
        <div className="flex max-h-[80vh] flex-col">
          <DialogHeader>
            <DialogTitle>Importar recetas multi-producto</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3 py-2">
            <input type="file" accept=".xlsx" onChange={onFileChange} className="text-sm" />
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => catalogoApi.plantillaRecetas()}>
              Descargar plantilla
            </Button>
            {cargando && <span className="text-muted-foreground text-xs">Leyendo…</span>}
          </div>

          {mensaje && (
            <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'} className="mb-2">
              <AlertDescription>{mensaje.texto}</AlertDescription>
            </Alert>
          )}

          {productos && receta && (
            <div className="flex-1 space-y-4 overflow-y-auto">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                  Productos nuevos ({seleccionProductos.size} seleccionados)
                </p>
                <div className="max-h-52 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Código</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productos.map((p) => (
                        <TableRow key={p.fila} className={p.error ? 'bg-destructive/10' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={seleccionProductos.has(p.fila)}
                              disabled={!!p.error || p.yaExiste}
                              onCheckedChange={() => alternarProducto(p.fila)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{p.codigo}</TableCell>
                          <TableCell>{p.descripcion}</TableCell>
                          <TableCell>{p.error ?? (p.yaExiste ? 'Ya existe (no se crea)' : 'Nuevo')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                  Líneas de receta ({seleccionReceta.size} seleccionadas)
                </p>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Producto</TableHead>
                        <TableHead>Insumo</TableHead>
                        <TableHead>Consumo</TableHead>
                        <TableHead>Área</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receta.map((r) => (
                        <TableRow key={r.fila} className={r.error ? 'bg-destructive/10' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={seleccionReceta.has(r.fila)}
                              disabled={!!r.error}
                              onCheckedChange={() => alternarReceta(r.fila)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {r.productoCodigo} {r.productoNuevo && <span className="text-muted-foreground">(nuevo)</span>}
                          </TableCell>
                          <TableCell>{r.insumoCodigo}</TableCell>
                          <TableCell>{r.consumo ?? '—'}</TableCell>
                          <TableCell>{r.area ?? '—'}</TableCell>
                          <TableCell>{r.error ?? 'OK'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => cerrar(false)}>
              Cerrar
            </Button>
            <Button
              disabled={!productos || (seleccionProductos.size === 0 && seleccionReceta.size === 0) || aplicando}
              onClick={aplicar}
            >
              {aplicando ? 'Aplicando…' : 'Aplicar importación'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
