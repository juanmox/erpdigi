import { useState } from 'react'
import { ImportPreviewDialog } from '@/components/shared/import-preview-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { normalizarCodigoCosteo } from '@/lib/codigos-costeo'
import { costeoOrdenesApi } from './api'
import { ModalLineasProducto } from './components/modal-lineas-producto'
import type { FilaPreviewLinea, OrdenProduccionDetalle } from './types'

export function OrdenesPage() {
  const [importAbierto, setImportAbierto] = useState(false)
  const [lineasAbierto, setLineasAbierto] = useState(false)
  const [codigoBuscar, setCodigoBuscar] = useState('')
  const [orden, setOrden] = useState<OrdenProduccionDetalle | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function buscar() {
    if (!codigoBuscar.trim()) return
    setBuscando(true)
    setError(null)
    setOrden(null)
    try {
      const resultado = await costeoOrdenesApi.buscarPorCodigo(normalizarCodigoCosteo(codigoBuscar, 'OP'))
      setOrden(resultado)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al buscar la orden')
    } finally {
      setBuscando(false)
    }
  }

  async function toggleEnBlanco(idLineaProduccion: number, consumoEnBlanco: boolean) {
    if (!orden) return
    setError(null)
    // Optimista: la pantalla no espera a la respuesta para reflejar el click.
    setOrden({
      ...orden,
      lineasProduccion: orden.lineasProduccion.map((l) =>
        l.idLineaProduccion === idLineaProduccion ? { ...l, consumoEnBlanco } : l,
      ),
    })
    try {
      await costeoOrdenesApi.editarLineaProduccion(idLineaProduccion, consumoEnBlanco)
    } catch (err) {
      // Revierte si el servidor rechazó el cambio (ej. sin permiso).
      setOrden((prev) =>
        prev
          ? {
              ...prev,
              lineasProduccion: prev.lineasProduccion.map((l) =>
                l.idLineaProduccion === idLineaProduccion ? { ...l, consumoEnBlanco: !consumoEnBlanco } : l,
              ),
            }
          : prev,
      )
      setError(err instanceof ApiError ? err.message : 'Error al actualizar la línea')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Órdenes de Producción</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLineasAbierto(true)}>
            Líneas de producto
          </Button>
          <Button onClick={() => setImportAbierto(true)}>Importar Órdenes + ítems</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buscar OP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Ej: 159 (o 26OP000159 completo)"
              value={codigoBuscar}
              onChange={(e) => setCodigoBuscar(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              className="max-w-xs font-mono"
            />
            <Button variant="outline" disabled={buscando} onClick={buscar}>
              {buscando ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {orden && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-ink-faint">Cliente</div>
                  <div className="font-medium text-ink">{orden.cliente?.nombre ?? '—'}</div>
                </div>
                <div>
                  <div className="text-ink-faint">Línea de producto</div>
                  <div className="font-medium text-ink">{orden.lineaProducto?.nombre ?? '—'}</div>
                </div>
                <div>
                  <div className="text-ink-faint">Orden de compra</div>
                  <div className="font-medium text-ink">{orden.ordenCompra ?? '—'}</div>
                </div>
                <div>
                  <div className="text-ink-faint">Estatus</div>
                  <Badge variant="secondary">{orden.estatus}</Badge>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Línea</TableHead>
                    <TableHead>Desarrollo</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Tallas</TableHead>
                    <TableHead>En blanco</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orden.lineasProduccion.map((l) => (
                    <TableRow key={l.idLineaProduccion}>
                      <TableCell className="font-mono">{l.codigoLine}</TableCell>
                      <TableCell>{l.producto.desarrollo ?? '—'}</TableCell>
                      <TableCell>{l.producto.codigo}</TableCell>
                      <TableCell>{l.estatus}</TableCell>
                      <TableCell className="whitespace-normal">
                        {l.tallas.map((t) => `${t.talla.nombre}:${t.cantidad}`).join('  ·  ')}
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={l.consumoEnBlanco}
                          onCheckedChange={(checked) => toggleEnBlanco(l.idLineaProduccion, checked === true)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ImportPreviewDialog<FilaPreviewLinea>
        open={importAbierto}
        onOpenChange={setImportAbierto}
        titulo="Importar Órdenes de Producción + ítems"
        getError={(f) => f.error}
        getKey={(f) => f.fila}
        onDescargarPlantilla={() => costeoOrdenesApi.plantillaImportar()}
        columnas={[
          { key: 'op', header: 'OP', render: (f) => f.opTexto },
          { key: 'linea', header: 'Línea', render: (f) => f.codigoLine },
          { key: 'producto', header: 'Producto', render: (f) => f.productoCodigo ?? '—' },
          { key: 'cliente', header: 'Cliente', render: (f) => f.clienteCodigo ?? '—' },
          { key: 'lineaProducto', header: 'Línea de producto', render: (f) => f.lineaProductoNombre ?? '—' },
          { key: 'total', header: 'Piezas', className: 'text-right', render: (f) => f.totalPiezas },
          { key: 'estado', header: 'Estado', className: 'whitespace-normal', render: (f) => f.error ?? 'OK' },
        ]}
        onArchivoElegido={async (archivo) => (await costeoOrdenesApi.previewImportar(archivo)).filas}
        onAplicar={async (filas) => {
          const r = await costeoOrdenesApi.aplicarImportar(filas)
          return `${r.ordenesCreadas} OP nuevas, ${r.lineasCreadas} líneas creadas.`
        }}
      />

      <ModalLineasProducto open={lineasAbierto} onOpenChange={setLineasAbierto} />
    </div>
  )
}
