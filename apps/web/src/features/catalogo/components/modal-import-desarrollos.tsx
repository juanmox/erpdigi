import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { catalogoApi } from '../api'
import type { FilaPreviewDesarrollo, FilaPreviewInsumoDesarrollo } from '../types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAplicado: () => void
}

/**
 * Import masivo de desarrollos + su receta. Reemplaza al "Importar recetas
 * multi-producto" de la pestaña Productos: la receta ya no cuelga del producto.
 * Se mantiene el diálogo a medida (en vez de `ImportPreviewDialog`) porque son
 * dos tablas de preview con selección independiente, que ese genérico no cubre.
 */
export function ModalImportDesarrollos({ open, onOpenChange, onAplicado }: Props) {
  const [desarrollos, setDesarrollos] = useState<FilaPreviewDesarrollo[] | null>(null)
  const [lineas, setLineas] = useState<FilaPreviewInsumoDesarrollo[] | null>(null)
  const [selDesarrollos, setSelDesarrollos] = useState<Set<number>>(new Set())
  const [selLineas, setSelLineas] = useState<Set<number>>(new Set())
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // `limpiarMensaje` es opcional a propósito: tras aplicar hay que limpiar el
  // preview pero CONSERVAR el mensaje de éxito. Antes reiniciar() siempre hacía
  // setMensaje(null), y como React agrupa los dos setState en el mismo lote, la
  // confirmación nunca se veía y era fácil volver a subir el archivo.
  function reiniciar(limpiarMensaje = true) {
    setDesarrollos(null)
    setLineas(null)
    setSelDesarrollos(new Set())
    setSelLineas(new Set())
    if (limpiarMensaje) setMensaje(null)
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
      const r = await catalogoApi.previewImportarDesarrollos(archivo)
      setDesarrollos(r.desarrollos)
      setLineas(r.lineas)
      setSelDesarrollos(new Set(r.desarrollos.filter((d) => !d.error).map((d) => d.fila)))
      setSelLineas(new Set(r.lineas.filter((l) => !l.error).map((l) => l.fila)))
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al leer el archivo' })
    } finally {
      setCargando(false)
    }
  }

  async function aplicar() {
    if (!desarrollos || !lineas) return
    const desAEnviar = desarrollos.filter((d) => !d.error && selDesarrollos.has(d.fila))
    // Una línea cuyo desarrollo se destildó no tiene dónde ir: se descarta acá
    // para que el servidor no la rechace en bloque y se pierda todo el import.
    const codigosNuevos = new Set(desAEnviar.map((d) => d.codigo.toLowerCase()))
    const lineasAEnviar = lineas.filter(
      (l) => !l.error && selLineas.has(l.fila) && (!l.desarrolloNuevo || codigosNuevos.has(l.desarrolloCodigo.toLowerCase())),
    )
    if (desAEnviar.length === 0 && lineasAEnviar.length === 0) return
    setAplicando(true)
    setMensaje(null)
    try {
      const r = await catalogoApi.aplicarImportarDesarrollos(desAEnviar, lineasAEnviar)
      setMensaje({
        tipo: 'ok',
        texto:
          `${r.creados} desarrollo(s) creado(s), ${r.lineasCreadas} línea(s) de receta nueva(s)` +
          (r.lineasActualizadas ? `, ${r.lineasActualizadas} línea(s) actualizada(s)` : ''),
      })
      reiniciar(false)
      onAplicado()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al aplicar la importación' })
    } finally {
      setAplicando(false)
    }
  }

  function alternar(set: Set<number>, aplicar: (s: Set<number>) => void, fila: number) {
    const next = new Set(set)
    if (next.has(fila)) next.delete(fila)
    else next.add(fila)
    aplicar(next)
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden">
        <div className="flex max-h-[80vh] flex-col">
          <DialogHeader>
            <DialogTitle>Importar desarrollos</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3 py-2">
            <input type="file" accept=".xlsx" onChange={onFileChange} className="text-sm" />
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => catalogoApi.plantillaDesarrollos()}
            >
              Descargar plantilla
            </Button>
            {cargando && <span className="text-muted-foreground text-xs">Leyendo…</span>}
          </div>

          <p className="text-muted-foreground pb-2 text-xs">
            Los desarrollos se crean en <strong>Borrador</strong>: hay que aprobarlos antes de poder asignarlos a un
            producto.
          </p>

          {mensaje && (
            <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'} className="mb-2">
              <AlertDescription>{mensaje.texto}</AlertDescription>
            </Alert>
          )}

          {desarrollos && lineas && (
            <div className="flex-1 space-y-4 overflow-y-auto">
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                  Desarrollos nuevos ({selDesarrollos.size} seleccionados de {desarrollos.length})
                </p>
                <div className="max-h-52 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Código</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Talla base</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {desarrollos.map((d) => (
                        <TableRow key={d.fila} className={d.error ? 'bg-destructive/10' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selDesarrollos.has(d.fila)}
                              disabled={!!d.error}
                              onCheckedChange={() => alternar(selDesarrollos, setSelDesarrollos, d.fila)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{d.codigo}</TableCell>
                          <TableCell className="max-w-xs whitespace-normal">{d.descripcion}</TableCell>
                          <TableCell>{d.clienteCodigo ?? '—'}</TableCell>
                          <TableCell>{d.tallaBase ?? '—'}</TableCell>
                          <TableCell className="whitespace-normal">{d.error ?? 'Nuevo'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
                  Líneas de receta ({selLineas.size} seleccionadas de {lineas.length})
                </p>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Desarrollo</TableHead>
                        <TableHead>Insumo</TableHead>
                        <TableHead>Consumo</TableHead>
                        <TableHead>Área</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineas.map((l) => (
                        <TableRow key={l.fila} className={l.error ? 'bg-destructive/10' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selLineas.has(l.fila)}
                              disabled={!!l.error}
                              onCheckedChange={() => alternar(selLineas, setSelLineas, l.fila)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {l.desarrolloCodigo}{' '}
                            {l.desarrolloNuevo && <span className="text-muted-foreground">(nuevo)</span>}
                          </TableCell>
                          <TableCell className="whitespace-normal">{l.insumoCodigo}</TableCell>
                          <TableCell className="tabular-nums">{l.consumo ?? '—'}</TableCell>
                          <TableCell>{l.area ?? '—'}</TableCell>
                          <TableCell className="whitespace-normal">
                            {l.error ?? (l.yaCargada ? 'Actualiza el consumo existente' : 'Nueva')}
                          </TableCell>
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
              disabled={!desarrollos || (selDesarrollos.size === 0 && selLineas.size === 0) || aplicando}
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
