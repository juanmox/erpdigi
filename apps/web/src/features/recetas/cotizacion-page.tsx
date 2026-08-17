import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AutocompleteBuscador } from '@/components/shared/autocomplete-buscador'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/features/auth/auth-context'
import { formatMonto, type CodigoMoneda } from '@digitexsa-erp/shared-utils'
import { recetasApi } from './api'
import { CardReceta } from './components/card-receta'
import { CarritoAcumulados } from './components/carrito-acumulados'
import { ModalHistorial } from './components/modal-historial'
import { ModalResumen, type ResumenAMostrar } from './components/modal-resumen'
import type { ItemAcumulado, ProductoListado } from './types'

const SIN_FILTRO = '__todos__'

export function CotizacionPage() {
  const { tienePermiso } = useAuth()
  const queryClient = useQueryClient()

  const [moneda, setMoneda] = useState<CodigoMoneda>('USD')
  const [cliente, setCliente] = useState<string>('')
  const [deporte, setDeporte] = useState<string>('')
  const [talla, setTalla] = useState<string>('')
  const [patron, setPatron] = useState<string>('')
  const [desarrollo, setDesarrollo] = useState<string>('')
  const [textoBusqueda, setTextoBusqueda] = useState('')
  const [q, setQ] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function onTextoBusquedaChange(v: string) {
    setTextoBusqueda(v)
    setProdSeleccionado(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim() === '') {
      // Sin esto, al borrar el campo el filtro anterior (q) queda vigente por 250ms más:
      // el buscador se ve vacío pero la lista sigue acotada a la búsqueda ya cerrada.
      setQ('')
    } else {
      debounceRef.current = setTimeout(() => setQ(v), 250)
    }
  }

  const filtrosActivos = useMemo(
    () => ({
      cliente: cliente ? Number(cliente) : undefined,
      deporte: deporte || undefined,
      talla: talla || undefined,
      patron: patron || undefined,
      desarrollo: desarrollo || undefined,
      q: q || undefined,
    }),
    [cliente, deporte, talla, patron, desarrollo, q],
  )

  const { data: tipoCambio } = useQuery({
    queryKey: ['recetas', 'tipo-cambio'],
    queryFn: () => recetasApi.tipoCambio(),
    staleTime: 5 * 60 * 1000,
  })
  const tasa = tipoCambio?.tasa ?? null

  const { data: opcionesFiltro } = useQuery({
    queryKey: ['recetas', 'filtros', filtrosActivos],
    queryFn: () => recetasApi.filtros(filtrosActivos),
  })

  const { data: listadoProductos } = useQuery({
    queryKey: ['recetas', 'productos', filtrosActivos],
    queryFn: () => recetasApi.productos(filtrosActivos),
  })
  const productosActuales = listadoProductos?.productos ?? []

  const [prodSeleccionado, setProdSeleccionado] = useState<ProductoListado | null>(null)
  const [cantidad, setCantidad] = useState(1)

  const { data: receta } = useQuery({
    queryKey: ['recetas', 'receta', prodSeleccionado?.codigo],
    queryFn: () => recetasApi.receta(prodSeleccionado!.codigo),
    enabled: !!prodSeleccionado,
  })

  const [acumulados, setAcumulados] = useState<ItemAcumulado[]>([])
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensajeGuardar, setMensajeGuardar] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false)
  const [resumenAMostrar, setResumenAMostrar] = useState<ResumenAMostrar | null>(null)

  function limpiarFiltros() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setCliente('')
    setDeporte('')
    setTalla('')
    setPatron('')
    setDesarrollo('')
    setTextoBusqueda('')
    setQ('')
    setProdSeleccionado(null)
  }

  function elegirProducto(p: ProductoListado) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setProdSeleccionado(p)
    setTextoBusqueda(`${p.codigo} — ${p.descripcion}`)
    setQ('')
  }

  function agregarProducto() {
    if (!prodSeleccionado || !(cantidad > 0)) return
    setAcumulados((prev) => {
      const existente = prev.find((a) => a.codigo === prodSeleccionado.codigo)
      if (existente) {
        return prev.map((a) => (a.codigo === prodSeleccionado.codigo ? { ...a, cantidad: a.cantidad + cantidad } : a))
      }
      return [
        ...prev,
        {
          codigo: prodSeleccionado.codigo,
          descripcion: prodSeleccionado.descripcion,
          cantidad,
          costoUnitario: prodSeleccionado.costoUnitario,
          precioVenta: prodSeleccionado.precioVenta,
        },
      ]
    })
    setCantidad(1)
  }

  function quitarDelCarrito(codigo: string) {
    setAcumulados((prev) => prev.filter((a) => a.codigo !== codigo))
  }

  async function guardarCotizacion() {
    if (acumulados.length === 0) return
    setGuardando(true)
    setMensajeGuardar(null)
    try {
      const resultado = await recetasApi.crearCotizacion({
        items: acumulados.map((a) => ({ codigo: a.codigo, cantidad: a.cantidad })),
        notas: notas || undefined,
        moneda,
      })
      setAcumulados([])
      setNotas('')
      setMensajeGuardar({
        tipo: 'ok',
        texto: `Cotización ${resultado.folio} guardada — total ${formatMonto(resultado.totalCosto, moneda, resultado.tasaCambio)}`,
      })
      queryClient.invalidateQueries({ queryKey: ['recetas', 'cotizaciones'] })
    } catch (err) {
      setMensajeGuardar({ tipo: 'error', texto: err instanceof Error ? err.message : 'Error al guardar' })
    } finally {
      setGuardando(false)
    }
  }

  async function verResumenDeAcumulados() {
    if (acumulados.length === 0) return
    const resumen = await recetasApi.resumenMaterial(acumulados.map((a) => ({ codigo: a.codigo, cantidad: a.cantidad })))
    setResumenAMostrar({
      data: resumen,
      moneda,
      tasa,
      titulo: 'Productos acumulados',
      productos: acumulados.map((a) => ({ codigo: a.codigo, descripcion: a.descripcion, cantidad: a.cantidad })),
    })
  }

  const puedeVerCotizaciones = tienePermiso('recetas.cotizaciones.ver')
  const puedeCrearCotizaciones = tienePermiso('recetas.cotizaciones.crear')
  // Antes vivía en el sidebar principal, mezclado con módulos de negocio —
  // Gestión de datos es en realidad parte del flujo de Recetas (catálogo de
  // insumos/productos que alimenta la cotización), así que se movió acá.
  const puedeGestionarDatos =
    tienePermiso('recetas.insumos.editar') || tienePermiso('recetas.productos.editar') || tienePermiso('recetas.importar')

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Cotización de recetas</h1>
          {tipoCambio && (
            <p className="text-muted-foreground text-xs">
              Tipo de cambio: Q{tipoCambio.tasa?.toFixed(4)} / US$ ({tipoCambio.fuente})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border">
            <Button
              variant={moneda === 'USD' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none"
              onClick={() => setMoneda('USD')}
            >
              USD
            </Button>
            <Button
              variant={moneda === 'GTQ' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none"
              onClick={() => setMoneda('GTQ')}
            >
              GTQ
            </Button>
          </div>
          {puedeVerCotizaciones && (
            <Button variant="outline" onClick={() => setModalHistorialAbierto(true)}>
              Historial
            </Button>
          )}
          {puedeGestionarDatos && (
            <Button variant="outline" asChild>
              <Link to="/catalogo">Gestión de datos</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="overflow-visible">
            <CardHeader>
              <CardTitle className="text-base">Buscar producto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Select value={cliente || SIN_FILTRO} onValueChange={(v) => setCliente(v === SIN_FILTRO ? '' : v)}>
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_FILTRO}>Todos</SelectItem>
                    {opcionesFiltro?.clientes.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={deporte || SIN_FILTRO} onValueChange={(v) => setDeporte(v === SIN_FILTRO ? '' : v)}>
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Deporte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_FILTRO}>Todos</SelectItem>
                    {opcionesFiltro?.deportes.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={talla || SIN_FILTRO} onValueChange={(v) => setTalla(v === SIN_FILTRO ? '' : v)}>
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Talla" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_FILTRO}>Todas</SelectItem>
                    {opcionesFiltro?.tallas.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={patron || SIN_FILTRO} onValueChange={(v) => setPatron(v === SIN_FILTRO ? '' : v)}>
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Patrón" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_FILTRO}>Todos</SelectItem>
                    {opcionesFiltro?.patrones.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={desarrollo || SIN_FILTRO} onValueChange={(v) => setDesarrollo(v === SIN_FILTRO ? '' : v)}>
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Desarrollo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_FILTRO}>Todos</SelectItem>
                    {opcionesFiltro?.desarrollos.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="mb-1 block text-xs">Producto</Label>
                  <AutocompleteBuscador
                    valor={textoBusqueda}
                    onValorChange={onTextoBusquedaChange}
                    items={productosActuales}
                    getKey={(p) => p.idProducto}
                    onSeleccionar={elegirProducto}
                    placeholder="Buscar por código o descripción…"
                    vacioTexto="Sin productos que coincidan"
                    renderItem={(p) => (
                      <div>
                        <span className="text-primary font-semibold">{p.codigo}</span> — {p.descripcion}
                        <div className="text-muted-foreground text-xs">
                          {p.clienteNombre ?? ''} · {p.deporte ?? ''} · Talla {p.tamano ?? '-'}
                        </div>
                      </div>
                    )}
                  />
                </div>
                <div className="w-24">
                  <Label className="mb-1 block text-xs">Cantidad</Label>
                  <Input
                    type="number"
                    min={1}
                    value={cantidad}
                    onChange={(e) => setCantidad(Number(e.target.value))}
                  />
                </div>
                <Button onClick={agregarProducto} disabled={!prodSeleccionado}>
                  Agregar
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs">
                  Mostrando {productosActuales.length} de {listadoProductos?.total ?? 0} productos
                </p>
                <Button variant="link" size="sm" onClick={limpiarFiltros}>
                  Limpiar filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          {receta && <CardReceta receta={receta} moneda={moneda} tasa={tasa} />}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Productos acumulados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CarritoAcumulados items={acumulados} moneda={moneda} tasa={tasa} onQuitar={quitarDelCarrito} />
              <div>
                <Label className="mb-1 block text-xs">Notas</Label>
                <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas de la cotización (opcional)" />
              </div>
              {mensajeGuardar && (
                <p className={mensajeGuardar.tipo === 'ok' ? 'text-sm text-green-600' : 'text-sm text-destructive'}>
                  {mensajeGuardar.texto}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={acumulados.length === 0 || guardando || !puedeCrearCotizaciones}
                  onClick={guardarCotizacion}
                >
                  {guardando ? 'Guardando…' : 'Guardar cotización'}
                </Button>
                <Button variant="outline" disabled={acumulados.length === 0} onClick={verResumenDeAcumulados}>
                  Resumen de material
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ModalHistorial
        open={modalHistorialAbierto}
        onClose={() => setModalHistorialAbierto(false)}
        onMostrarResumen={setResumenAMostrar}
      />
      <ModalResumen resumen={resumenAMostrar} onClose={() => setResumenAMostrar(null)} />
    </div>
  )
}
