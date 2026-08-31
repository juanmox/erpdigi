import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ImportPreviewDialog } from '@/components/shared/import-preview-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { formatGTQ, formatUSD } from '@digitexsa-erp/shared-utils'
import { catalogoApi } from '../api'
import type { Desarrollo, FilaPreviewAltaProducto, ProductoCatalogo } from '../types'
import { ModalProducto } from './modal-producto'
import { ModalRecetaDesarrollo } from './modal-receta-desarrollo'

type Estado = 'activos' | 'inactivos' | 'todos'

const TODOS = '__todos__'

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
  const todosLosProductos = useMemo(() => data?.productos ?? [], [data])

  const [busqueda, setBusqueda] = useState('')
  const [cliente, setCliente] = useState(TODOS)
  const [deporte, setDeporte] = useState(TODOS)
  const [talla, setTalla] = useState(TODOS)

  // Las opciones salen de los productos ya cargados, no de un endpoint nuevo:
  // así solo se ofrecen valores que de verdad filtran algo (mismo criterio que
  // los filtros de Insumos y Precios).
  const opciones = useMemo(() => {
    const uniq = (vals: (string | null | undefined)[]) =>
      [...new Set(vals.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'es'))
    return {
      clientes: uniq(todosLosProductos.map((p) => p.clienteNombre)),
      deportes: uniq(todosLosProductos.map((p) => p.deporte)),
      tallas: uniq(todosLosProductos.map((p) => p.tamano)),
    }
  }, [todosLosProductos])

  const productos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return todosLosProductos.filter((p) => {
      if (texto && !p.codigo.toLowerCase().includes(texto) && !p.descripcion.toLowerCase().includes(texto))
        return false
      if (cliente !== TODOS && p.clienteNombre !== cliente) return false
      if (deporte !== TODOS && p.deporte !== deporte) return false
      if (talla !== TODOS && p.tamano !== talla) return false
      return true
    })
  }, [todosLosProductos, busqueda, cliente, deporte, talla])

  const hayFiltros = busqueda.trim() !== '' || cliente !== TODOS || deporte !== TODOS || talla !== TODOS

  const [modalProductoAbierto, setModalProductoAbierto] = useState(false)
  const [productoEditando, setProductoEditando] = useState<ProductoCatalogo | null>(null)
  const [importAltasAbierto, setImportAltasAbierto] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [recetaAbierta, setRecetaAbierta] = useState(false)
  const [recetaDe, setRecetaDe] = useState<Desarrollo | null>(null)

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'productos'] })
    // Asignar un desarrollo a un producto lo saca de la lista de "aprobados y
    // libres" que usa el selector del alta. Sin invalidar esto, el selector
    // seguía ofreciéndolo y el servidor rechazaba el siguiente producto.
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'desarrollos'] })
  }

  function abrirCrear() {
    setProductoEditando(null)
    setModalProductoAbierto(true)
  }

  function abrirEditar(p: ProductoCatalogo) {
    setProductoEditando(p)
    setModalProductoAbierto(true)
  }

  // El producto solo guarda el código del desarrollo (no hay FK, ver el schema),
  // así que hay que resolverlo antes de poder abrir su receta.
  async function abrirRecetaDelProducto(p: ProductoCatalogo) {
    if (!p.desarrollo) return
    setMensaje(null)
    try {
      const { desarrollos } = await catalogoApi.listarDesarrollos({
        q: p.desarrollo,
        estado: 'todos',
        incluirInactivos: true,
        limit: 50,
      })
      const d = desarrollos.find((x) => x.codigo === p.desarrollo)
      if (!d) {
        setMensaje({ tipo: 'error', texto: `El desarrollo "${p.desarrollo}" ya no existe en el catálogo` })
        return
      }
      setRecetaDe(d)
      setRecetaAbierta(true)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al abrir la receta' })
    }
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
          <p className="text-muted-foreground text-sm">
            {productos.length} de {todosLosProductos.length} productos
          </p>
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
            </>
          )}
          {puedeCrear && (
            <Button size="sm" onClick={abrirCrear}>
              Nuevo producto
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código o descripción…"
          className="h-8 max-w-xs"
        />
        <Select value={cliente} onValueChange={setCliente}>
          <SelectTrigger size="sm" className="w-52">
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los clientes</SelectItem>
            {opciones.clientes.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deporte} onValueChange={setDeporte}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Deporte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los deportes</SelectItem>
            {opciones.deportes.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={talla} onValueChange={setTalla}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Talla" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas las tallas</SelectItem>
            {opciones.tallas.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hayFiltros && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setBusqueda('')
              setCliente(TODOS)
              setDeporte(TODOS)
              setTalla(TODOS)
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {mensaje && (
        <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{mensaje.texto}</AlertDescription>
        </Alert>
      )}

      {/* Anchos en PORCENTAJE, no en rem: con rem fijos la tabla medía ~1,424px
          (más que una ventana normal con el sidebar abierto) y las columnas de
          la derecha quedaban fuera de vista. Con table-fixed + %, la tabla
          siempre entra en el ancho disponible y el texto crece hacia abajo.
          min-w evita que a anchos muy chicos quede ilegible: ahí sí scrollea. */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full table-fixed min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[8%]">Código</TableHead>
              <TableHead className="w-[20%]">Descripción</TableHead>
              <TableHead className="w-[10%]">Desarrollo</TableHead>
              <TableHead className="w-[13%]">Cliente</TableHead>
              <TableHead className="w-[4%]">Talla</TableHead>
              <TableHead className="w-[7%]">Deporte</TableHead>
              <TableHead className="w-[7%] text-right">Costo</TableHead>
              <TableHead className="w-[8%] text-right">Precio</TableHead>
              <TableHead className="w-[7%]">Estado</TableHead>
              <TableHead className="w-[16%] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={10} className="text-muted-foreground text-center">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {productos.map((p) => (
              <TableRow key={p.idProducto}>
                <TableCell className="font-medium break-words">{p.codigo}</TableCell>
                <TableCell className="break-words whitespace-normal">{p.descripcion}</TableCell>
                <TableCell className="break-words whitespace-normal">
                  {/* La receta vive en el desarrollo: desde acá se abre en
                      solo lectura, sin devolverle la edición al producto.
                      Sigue resolviéndose por código y no por id porque el
                      listado devuelve el código; la FK (2026-08-31) garantiza
                      que siempre exista, así que el caso "no encontrado" ya
                      solo puede darse por una carrera, no por datos sucios. */}
                  {p.desarrollo ? (
                    <button
                      type="button"
                      className="text-accent-brand hover:underline"
                      onClick={() => abrirRecetaDelProducto(p)}
                    >
                      {p.desarrollo}
                    </button>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="break-words whitespace-normal">{p.clienteNombre ?? '—'}</TableCell>
                <TableCell>{p.tamano ?? '—'}</TableCell>
                <TableCell className="whitespace-normal">{p.deporte ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{formatGTQ(p.costoUnitario)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUSD(p.precioVenta)}</TableCell>
                <TableCell>
                  <Badge variant={p.activo ? 'default' : 'secondary'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-x-2 gap-y-1">
                    {puedeEditar && (
                      <Button variant="ghost" size="sm" className="px-1.5" onClick={() => abrirEditar(p)}>
                        Editar
                      </Button>
                    )}
                    {puedeDesactivar && (
                      <Button variant="ghost" size="sm" className="px-1.5" onClick={() => alternarActivo(p)}>
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
          { key: 'descripcion', header: 'Descripción', className: 'max-w-xs whitespace-normal', render: (f) => f.descripcion },
          { key: 'desarrollo', header: 'Desarrollo', render: (f) => f.desarrollo ?? '—' },
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
            })),
          )
          return `${resultado.creados} producto(s) creado(s)`
        }}
        textoBotonAplicar="Crear productos"
      />

      <ModalRecetaDesarrollo desarrollo={recetaDe} open={recetaAbierta} onOpenChange={setRecetaAbierta} soloLectura />
    </div>
  )
}
