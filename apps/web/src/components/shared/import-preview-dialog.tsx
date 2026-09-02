import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'

export interface ColumnaPreview<F> {
  key: string
  header: string
  render: (fila: F) => ReactNode
  className?: string
}

interface ImportPreviewDialogProps<F> {
  open: boolean
  onOpenChange: (open: boolean) => void
  titulo: string
  columnas: ColumnaPreview<F>[]
  getError: (fila: F) => string | null
  getKey: (fila: F) => string | number
  onArchivoElegido: (archivo: File) => Promise<F[]>
  onAplicar: (filasValidas: F[]) => Promise<string>
  textoBotonAplicar?: string
  onDescargarPlantilla?: () => Promise<void>
}

/**
 * Diálogo genérico "elegir archivo → preview con checkboxes → aplicar", reusado por
 * los 4 flujos de import Excel de recetas (precios, altas insumos, altas productos,
 * receta multi-producto). El padre solo aporta las columnas y las 2 llamadas a la API.
 */
export function ImportPreviewDialog<F>({
  open,
  onOpenChange,
  titulo,
  columnas,
  getError,
  getKey,
  onArchivoElegido,
  onAplicar,
  textoBotonAplicar = 'Aplicar',
  onDescargarPlantilla,
}: ImportPreviewDialogProps<F>) {
  const [filas, setFilas] = useState<F[] | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string | number>>(new Set())
  const [cargando, setCargando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function reiniciar() {
    setFilas(null)
    setSeleccion(new Set())
    setMensaje(null)
    if (inputRef.current) inputRef.current.value = ''
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
      const resultado = await onArchivoElegido(archivo)
      setFilas(resultado)
      setSeleccion(new Set(resultado.filter((f) => !getError(f)).map((f) => getKey(f))))
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al leer el archivo' })
    } finally {
      setCargando(false)
    }
  }

  function alternar(key: string | number) {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function confirmar() {
    if (!filas) return
    const filasValidas = filas.filter((f) => !getError(f) && seleccion.has(getKey(f)))
    if (filasValidas.length === 0) return
    setAplicando(true)
    setMensaje(null)
    try {
      const texto = await onAplicar(filasValidas)
      setMensaje({ tipo: 'ok', texto })
      setFilas(null)
      setSeleccion(new Set())
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al aplicar los cambios' })
    } finally {
      setAplicando(false)
    }
  }

  const totalErrores = filas?.filter((f) => getError(f)).length ?? 0

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
        {/* min-w-0: sin esto un hijo flex no baja de su ancho de contenido
            (min-width:auto por defecto), así que la tabla de preview empujaba
            el diálogo más ancho que la ventana en pantallas angostas en vez
            de scrollear adentro de su propio contenedor. */}
        <div className="flex max-h-[80vh] min-w-0 flex-col">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3 py-2">
            <input ref={inputRef} type="file" accept=".xlsx" onChange={onFileChange} className="text-sm" />
            {onDescargarPlantilla && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => onDescargarPlantilla()}>
                Descargar plantilla
              </Button>
            )}
            {cargando && <span className="text-muted-foreground text-xs">Leyendo…</span>}
          </div>

          {mensaje && (
            <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'} className="mb-2">
              <AlertDescription>{mensaje.texto}</AlertDescription>
            </Alert>
          )}

          {filas && (
            <>
              <p className="text-muted-foreground mb-2 text-xs">
                {filas.length} filas · {seleccion.size} seleccionadas
                {totalErrores > 0 && <span className="text-destructive"> · {totalErrores} con error (no se pueden aplicar)</span>}
              </p>
              <div className="min-w-0 flex-1 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      {columnas.map((c) => (
                        <TableHead key={c.key} className={c.className}>
                          {c.header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((fila) => {
                      const error = getError(fila)
                      const key = getKey(fila)
                      return (
                        <TableRow key={key} className={cn(error && 'bg-destructive/10')}>
                          <TableCell>
                            <Checkbox
                              checked={seleccion.has(key)}
                              disabled={!!error}
                              onCheckedChange={() => alternar(key)}
                            />
                          </TableCell>
                          {columnas.map((c) => (
                            <TableCell key={c.key} className={c.className}>
                              {c.render(fila)}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => cerrar(false)}>
              Cerrar
            </Button>
            <Button disabled={!filas || seleccion.size === 0 || aplicando} onClick={confirmar}>
              {aplicando ? 'Aplicando…' : `${textoBotonAplicar} (${seleccion.size})`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
