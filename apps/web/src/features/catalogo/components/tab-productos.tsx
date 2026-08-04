import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ImportPreviewDialog } from '@/components/shared/import-preview-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { formatGTQ, formatUSD } from '@digitexsa-erp/shared-utils'
import { catalogoApi } from '../api'
import type { FilaPreviewAltaProducto, ProductoCatalogo } from '../types'
import { ModalImportRecetas } from './modal-import-recetas'
import { ModalProducto } from './modal-producto'
import { ModalReceta } from './modal-receta'

type Estado = 'activos' | 'inactivos' | 'todos'

export function TabProductos() {
  const { tienePermiso } = useAuth()
  const puedeCrear = tienePermiso('recetas.productos.crear')
  const puedeEditar = tienePermiso('recetas.productos.editar')
  const puedeDesactivar = tienePermiso('recetas.productos.desactivar')
  const puedeImportar = tienePermiso('recetas.importar')
  const queryClient = useQueryClient()

  const [estado, setEstado] = useState<Estado>('activos')
  const { data, isLoading } = useQuery({
    queryKey: ['catalogo', 'productos', estado],
    queryFn: () => catalogoApi.listarProductos(estado),
  })
  const productos = data?.productos ?? []

  const [modalProductoAbierto, setModalProductoAbierto] = useState(false)
  const [productoEditando, setProductoEditando] = useState<ProductoCatalogo | null>(null)
  const [modalRecetaAbierto, setModalRecetaAbierto] = useState(false)
  const [productoReceta, setProductoReceta] = useState<ProductoCatalogo | null>(null)
  const [importAltasAbierto, setImportAltasAbierto] = useState(false)
  const [importRecetasAbierto, setImportRecetasAbierto] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'productos'] })
  }

  function abrirCrear() {
    setProductoEditando(null)
    setModalProductoAbierto(true)
  }

  function abrirEditar(p: ProductoCatalogo) {
    setProductoEditando(p)
    setModalProductoAbierto(true)
  }

  function abrirReceta(p: ProductoCatalogo) {
    setProductoReceta(p)
    setModalRecetaAbierto(true)
  }

  async function alternarActivo(p: ProductoCatalogo) {
    setMensaje(null)
    try {
      await catalogoApi.cambiarActivoProducto(p.idProducto, !p.activo)
      invalidar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al cambiar el estado' })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={estado} onValueChange={(v) => setEstado(v as Estado)}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activos">Activos</SelectItem>
              <SelectItem value="inactivos">Inactivos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-sm">{productos.length} productos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => catalogoApi.exportarProductos()}>
            Exportar Excel
          </Button>
          {puedeImportar && (
            <>
              <Button variant="outline" size="sm" onClick={() => catalogoApi.plantillaAltaProductos()}>
                Plantilla de altas
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportAltasAbierto(true)}>
                Importar altas
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportRecetasAbierto(true)}>
                Importar recetas
              </Button>
            </>
          )}
          {puedeCrear && (
            <Button size="sm" onClick={abrirCrear}>
              Nuevo producto
            </Button>
          )}
        </div>
      </div>

      {mensaje && (
        <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{mensaje.texto}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead>Deporte</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Precio venta</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground text-center">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {productos.map((p) => (
              <TableRow key={p.idProducto}>
                <TableCell className="font-medium">{p.codigo}</TableCell>
                <TableCell className="whitespace-normal">{p.descripcion}</TableCell>
                <TableCell>{p.clienteNombre ?? '—'}</TableCell>
                <TableCell>{p.tamano ?? '—'}</TableCell>
                <TableCell>{p.deporte ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{formatGTQ(p.costoUnitario)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUSD(p.precioVenta)}</TableCell>
                <TableCell>
                  <Badge variant={p.activo ? 'default' : 'secondary'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => abrirReceta(p)}>
                      Receta
                    </Button>
                    {puedeEditar && (
                      <Button variant="ghost" size="sm" onClick={() => abrirEditar(p)}>
                        Editar
                      </Button>
                    )}
                    {puedeDesactivar && (
                      <Button variant="ghost" size="sm" onClick={() => alternarActivo(p)}>
                        {p.activo ? 'Desactivar' : 'Reactivar'}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ModalProducto producto={productoEditando} open={modalProductoAbierto} onOpenChange={setModalProductoAbierto} onGuardado={invalidar} />
      <ModalReceta producto={productoReceta} open={modalRecetaAbierto} onOpenChange={setModalRecetaAbierto} />

      <ImportPreviewDialog<FilaPreviewAltaProducto>
        open={importAltasAbierto}
        onOpenChange={(v) => {
          setImportAltasAbierto(v)
          if (!v) invalidar()
        }}
        titulo="Importar altas de productos"
        getError={(f) => f.error}
        getKey={(f) => f.fila}
        onDescargarPlantilla={() => catalogoApi.plantillaAltaProductos()}
        columnas={[
          { key: 'codigo', header: 'Código', render: (f) => f.codigo },
          { key: 'descripcion', header: 'Descripción', className: 'whitespace-normal', render: (f) => f.descripcion },
          { key: 'cliente', header: 'Cliente', render: (f) => f.clienteCodigo ?? '—' },
          { key: 'talla', header: 'Talla', render: (f) => f.tamano ?? '—' },
          { key: 'deporte', header: 'Deporte', render: (f) => f.deporte ?? '—' },
          {
            key: 'precio',
            header: 'Precio venta',
            className: 'text-right',
            render: (f) => (f.precioVenta != null ? formatUSD(f.precioVenta) : '—'),
          },
          { key: 'estado', header: 'Estado', render: (f) => f.error ?? 'OK' },
        ]}
        onArchivoElegido={async (archivo) => (await catalogoApi.previewImportarAltasProductos(archivo)).filas}
        onAplicar={async (filas) => {
          const resultado = await catalogoApi.altasProductos(
            filas.map((f) => ({
              codigo: f.codigo,
              descripcion: f.descripcion,
              idCliente: f.idCliente,
              desarrollo: f.desarrollo,
              patron: f.patron,
              tamano: f.tamano,
              deporte: f.deporte,
              precioVenta: f.precioVenta,
              minutosMo: f.minutosMo,
              costoMoMinuto: f.costoMoMinuto,
            })),
          )
          return `${resultado.creados} producto(s) creado(s)`
        }}
        textoBotonAplicar="Crear productos"
      />

      <ModalImportRecetas
        open={importRecetasAbierto}
        onOpenChange={setImportRecetasAbierto}
        onAplicado={() => {
          invalidar()
          setImportRecetasAbierto(false)
        }}
      />
    </div>
  )
}
