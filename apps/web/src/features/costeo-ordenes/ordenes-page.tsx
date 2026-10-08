import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ImportPreviewDialog } from '@/components/shared/import-preview-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { normalizarCodigoCosteo } from '@/lib/codigos-costeo'
import { costeoOrdenesApi } from './api'
import { ModalLineasProducto } from './components/modal-lineas-producto'
import { TablaOrdenes } from './components/tabla-ordenes'
import type { FilaPreviewLinea, OrdenProduccionDetalle } from './types'

export function OrdenesPage() {
  const [importAbierto, setImportAbierto] = useState(false)
  const [lineasAbierto, setLineasAbierto] = useState(false)
  const [codigoBuscar, setCodigoBuscar] = useState('')
  const [orden, setOrden] = useState<OrdenProduccionDetalle | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  async function buscar(codigo?: string) {
    const texto = (codigo ?? codigoBuscar).trim()
    if (!texto) return
    if (codigo) setCodigoBuscar(codigo)
    setBuscando(true)
    setError(null)
    setOrden(null)
    try {
      const resultado = await costeoOrdenesApi.buscarPorCodigo(normalizarCodigoCosteo(texto, 'OP'))
      setOrden(resultado)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al buscar la orden')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      {/* flex-wrap: sin esto los dos botones no bajan de renglón y empujan el
          ancho de toda la página en teléfono (mismo defecto ya corregido en
          Gestión de datos). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink">Órdenes de Producción</h1>
        <div className="flex flex-wrap gap-2">
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
            {/* Envuelto: `buscar` ahora recibe un codigo opcional, y pasarlo
                directo le entregaría el MouseEvent como si fuera ese código. */}
            <Button variant="outline" disabled={buscando} onClick={() => void buscar()}>
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
                {/* El papel en blanco NO se muestra acá desde 2026-10-07: se
                    gestiona solo desde Impresión de OPs, que es donde el
                    operario decide la cantidad (2-10 yd) al momento de
                    imprimir. Tenerlo en dos pantallas invitaba a cambiarlo
                    desde la que no ve el rollo. */}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Desarrollo</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Tallas</TableHead>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <TablaOrdenes onAbrirOrden={(codigo) => void buscar(codigo)} />

      <ImportPreviewDialog<FilaPreviewLinea>
        open={importAbierto}
        onOpenChange={setImportAbierto}
        titulo="Importar Órdenes de Producción + ítems"
        getError={(f) => f.error}
        getKey={(f) => f.fila}
        onDescargarPlantilla={() => costeoOrdenesApi.plantillaImportar()}
        columnas={[
          { key: 'op', header: 'OP', render: (f) => f.opTexto },
          // El Item lo asigna el servidor, así que acá se ve el que va a
          // quedar. Las filas con error no reciben uno: no se importan.
          { key: 'linea', header: 'Item', render: (f) => f.codigoLine ?? '—' },
          { key: 'producto', header: 'Producto', render: (f) => f.productoCodigo ?? '—' },
          { key: 'cliente', header: 'Cliente', render: (f) => f.clienteCodigo ?? '—' },
          { key: 'lineaProducto', header: 'Línea de producto', render: (f) => f.lineaProductoNombre ?? '—' },
          { key: 'total', header: 'Piezas', className: 'text-right', render: (f) => f.totalPiezas },
          { key: 'estado', header: 'Estado', className: 'whitespace-normal', render: (f) => f.error ?? 'OK' },
        ]}
        onArchivoElegido={async (archivo) => (await costeoOrdenesApi.previewImportar(archivo)).filas}
        onAplicar={async (filas) => {
          const r = await costeoOrdenesApi.aplicarImportar(filas)
          // Sin esto la tabla de pendientes seguiría mostrando lo de antes del
          // import, que es justo lo que se acaba de cargar para verlo.
          await queryClient.invalidateQueries({ queryKey: ['costeo-ordenes', 'listado'] })
          return `${r.ordenesCreadas} OP nuevas, ${r.lineasCreadas} líneas creadas.`
        }}
      />

      <ModalLineasProducto open={lineasAbierto} onOpenChange={setLineasAbierto} />
    </div>
  )
}
