import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { AutocompleteBuscador } from '@/components/shared/autocomplete-buscador'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ContenidoSelectTallas } from '@/components/shared/select-tallas'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { formatGTQ } from '@digitexsa-erp/shared-utils'
import { catalogoApi } from '../api'
import type { Desarrollo, ProductoCatalogo } from '../types'
import { SelectCatalogoProducto } from './select-catalogo-producto'

const SIN_VALOR = '__ninguno__'

interface ModalProductoProps {
  producto: ProductoCatalogo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onGuardado: () => void
}

export function ModalProducto({ producto, open, onOpenChange, onGuardado }: ModalProductoProps) {
  const esEdicion = !!producto
  const { tienePermiso } = useAuth()
  const puedeAgregarAtributos = tienePermiso('recetas.productos.editar')

  const { data: clientes } = useQuery({ queryKey: ['catalogo', 'clientes'], queryFn: () => catalogoApi.clientes() })
  const { data: subclientes } = useQuery({ queryKey: ['catalogo', 'subclientes'], queryFn: () => catalogoApi.subclientes() })
  const { data: tallas } = useQuery({ queryKey: ['catalogo', 'tallas'], queryFn: () => catalogoApi.tallas() })
  const { data: deportes } = useQuery({ queryKey: ['catalogo', 'deportes'], queryFn: () => catalogoApi.deportes() })

  // Solo desarrollos aprobados y todavía libres: son los únicos asignables
  // (el backend lo vuelve a validar, esto es la comodidad de la UI).
  const { data: desarrollosLibres } = useQuery({
    queryKey: ['catalogo', 'desarrollos', 'asignables'],
    queryFn: () => catalogoApi.listarDesarrollos({ estado: 'APROBADO', sinProducto: true, limit: 2000 }),
    enabled: open,
  })

  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [idCliente, setIdCliente] = useState('')
  const [idSubcliente, setIdSubcliente] = useState('')
  const [desarrollo, setDesarrollo] = useState('')
  const [desarrolloElegido, setDesarrolloElegido] = useState<Desarrollo | null>(null)
  const [patron, setPatron] = useState('')
  const [tamano, setTamano] = useState('')
  const [deporte, setDeporte] = useState('')
  const [precioVenta, setPrecioVenta] = useState('0')
  // Atributos para la estadística de producción: id como texto, '' = sin valor.
  const [idEstilo, setIdEstilo] = useState('')
  const [idLinea, setIdLinea] = useState('')
  const [idGenero, setIdGenero] = useState('')
  const [idComposicion, setIdComposicion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCodigo(producto?.codigo ?? '')
      setDescripcion(producto?.descripcion ?? '')
      setIdCliente(producto?.idCliente ? String(producto.idCliente) : '')
      setIdSubcliente(producto?.idSubcliente ? String(producto.idSubcliente) : '')
      setDesarrollo(producto?.desarrollo ?? '')
      setDesarrolloElegido(null)
      setPatron(producto?.patron ?? '')
      setTamano(producto?.tamano ?? '')
      setDeporte(producto?.deporte ?? '')
      setPrecioVenta(producto ? String(producto.precioVenta) : '0')
      setIdEstilo(producto?.idEstilo ? String(producto.idEstilo) : '')
      setIdLinea(producto?.idLinea ? String(producto.idLinea) : '')
      setIdGenero(producto?.idGenero ? String(producto.idGenero) : '')
      setIdComposicion(producto?.idComposicion ? String(producto.idComposicion) : '')
      setError(null)
    }
  }, [open, producto])

  // Un producto puede apuntar a un cliente que después se retiró. El selector
  // solo trae activos, así que hay que reponerlo a mano o el formulario diría
  // "Sin cliente" para un producto que sí lo tiene.
  const clienteRetirado = useMemo(() => {
    if (!producto?.idCliente || !clientes) return null
    if (clientes.some((c) => c.idCliente === producto.idCliente)) return null
    return { id: producto.idCliente, nombre: producto.clienteNombre ?? 'Cliente retirado' }
  }, [producto, clientes])

  // Solo los del cliente elegido: el servidor rechaza un subcliente de otro,
  // y ofrecerlos invitaría a ese error.
  const subclientesDelCliente = useMemo(
    () => (subclientes ?? []).filter((sc) => String(sc.idCliente) === idCliente),
    [subclientes, idCliente],
  )

  const opcionesDesarrollo = useMemo(() => {
    const texto = desarrollo.trim().toLowerCase()
    const todos = desarrollosLibres?.desarrollos ?? []
    if (!texto) return todos.slice(0, 20)
    return todos
      .filter((d) => d.codigo.toLowerCase().includes(texto) || d.descripcion.toLowerCase().includes(texto))
      .slice(0, 20)
  }, [desarrollosLibres, desarrollo])

  // Al editar, el desarrollo actual ya está tomado por este mismo producto, así
  // que no aparece en la lista de libres. Se manda solo si de verdad cambió.
  const desarrolloCambio = desarrollo.trim() !== (producto?.desarrollo ?? '').trim()

  async function guardar() {
    if (!descripcion.trim() || (!esEdicion && !codigo.trim())) {
      setError('Completa código y descripción')
      return
    }
    if (!desarrollo.trim()) {
      setError('Elegí un desarrollo aprobado: la receta y el costo del producto vienen de ahí')
      return
    }
    setGuardando(true)
    setError(null)
    const body = {
      descripcion: descripcion.trim(),
      idCliente: idCliente ? Number(idCliente) : null,
      idSubcliente: idSubcliente ? Number(idSubcliente) : null,
      patron: patron.trim() || null,
      tamano: tamano || null,
      deporte: deporte || null,
      precioVenta: Number(precioVenta) || 0,
      idEstilo: idEstilo ? Number(idEstilo) : null,
      idLinea: idLinea ? Number(idLinea) : null,
      idGenero: idGenero ? Number(idGenero) : null,
      idComposicion: idComposicion ? Number(idComposicion) : null,
    }
    try {
      if (esEdicion) {
        await catalogoApi.editarProducto(producto!.idProducto, {
          ...body,
          ...(desarrolloCambio ? { desarrollo: desarrollo.trim() } : {}),
        })
      } else {
        await catalogoApi.crearProducto({ ...body, codigo: codigo.trim(), desarrollo: desarrollo.trim() })
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
          <div className="col-span-2">
            <Label className="mb-1 block text-xs">Desarrollo (obligatorio)</Label>
            <AutocompleteBuscador
              valor={desarrollo}
              onValorChange={(v) => {
                setDesarrollo(v)
                setDesarrolloElegido(null)
              }}
              items={opcionesDesarrollo}
              getKey={(d) => d.idDesarrollo}
              renderItem={(d) => (
                <div className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-medium">{d.codigo}</span>
                    <span className="text-muted-foreground"> — {d.descripcion}</span>
                  </span>
                  <span className="tabular-nums shrink-0">{formatGTQ(d.costoUnitario)}</span>
                </div>
              )}
              onSeleccionar={(d) => {
                setDesarrollo(d.codigo)
                setDesarrolloElegido(d)
              }}
              placeholder="Buscar desarrollo aprobado por código o descripción…"
              vacioTexto="Sin desarrollos aprobados y libres que coincidan"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              {desarrolloElegido
                ? `Costo unitario del desarrollo: ${formatGTQ(desarrolloElegido.costoUnitario)}`
                : 'Solo se listan desarrollos aprobados que todavía no tienen producto asignado.'}
            </p>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Cliente</Label>
            <Select
              value={idCliente || SIN_VALOR}
              onValueChange={(v) => {
                setIdCliente(v === SIN_VALOR ? '' : v)
                // Un subcliente pertenece a un cliente: al cambiar de cliente
                // el anterior deja de corresponder, y el servidor lo rechaza.
                setIdSubcliente('')
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VALOR}>Sin cliente</SelectItem>
                {/* El cliente actual, aunque esté retirado: /recetas/clientes
                    solo devuelve activos, así que sin esto un producto de un
                    cliente retirado mostraría "Sin cliente" — y guardarlo lo
                    perdería de verdad. */}
                {clienteRetirado && (
                  <SelectItem value={String(clienteRetirado.id)}>
                    {clienteRetirado.nombre} (retirado)
                  </SelectItem>
                )}
                {clientes?.map((c) => (
                  <SelectItem key={c.idCliente} value={String(c.idCliente)}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Subcliente</Label>
            <Select
              value={idSubcliente || SIN_VALOR}
              onValueChange={(v) => setIdSubcliente(v === SIN_VALOR ? '' : v)}
              disabled={!idCliente || subclientesDelCliente.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin subcliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VALOR}>Sin subcliente</SelectItem>
                {subclientesDelCliente.map((sc) => (
                  <SelectItem key={sc.idSubcliente} value={String(sc.idSubcliente)}>
                    {sc.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground mt-1 text-xs">
              {!idCliente
                ? 'Elegí primero un cliente.'
                : subclientesDelCliente.length === 0
                  ? 'Este cliente no tiene subclientes.'
                  : 'Marca o división del cliente. Se factura al cliente, pero permite separar la estadística.'}
            </p>
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
            <Label className="mb-1 block text-xs">Patrón</Label>
            <Input value={patron} onChange={(e) => setPatron(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Talla</Label>
            <Select value={tamano || SIN_VALOR} onValueChange={(v) => setTamano(v === SIN_VALOR ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin talla" />
              </SelectTrigger>
              <ContenidoSelectTallas
                tallas={tallas}
                valorPor="nombre"
                opcionVacia={{ value: SIN_VALOR, label: 'Sin talla' }}
              />
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Precio venta (US$)</Label>
            <Input type="number" step="0.01" min={0} value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} />
          </div>

          <div className="col-span-2 border-t border-border pt-3">
            <p className="text-ink-muted text-xs font-medium">Atributos de producción</p>
            <p className="text-ink-faint text-[11px]">
              Describen la prenda para la estadística. Se eligen de un catálogo; si falta uno, se agrega desde acá.
            </p>
          </div>
          <SelectCatalogoProducto
            tipo="estilos"
            etiqueta="Estilo"
            articulo="el"
            valor={idEstilo}
            onChange={setIdEstilo}
            puedeAgregar={puedeAgregarAtributos}
          />
          <SelectCatalogoProducto
            tipo="lineas"
            etiqueta="Línea"
            articulo="la"
            valor={idLinea}
            onChange={setIdLinea}
            puedeAgregar={puedeAgregarAtributos}
          />
          <SelectCatalogoProducto
            tipo="generos"
            etiqueta="Género"
            articulo="el"
            valor={idGenero}
            onChange={setIdGenero}
            puedeAgregar={puedeAgregarAtributos}
          />
          <SelectCatalogoProducto
            tipo="composiciones"
            etiqueta="Composición"
            articulo="la"
            valor={idComposicion}
            onChange={setIdComposicion}
            puedeAgregar={puedeAgregarAtributos}
          />
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
