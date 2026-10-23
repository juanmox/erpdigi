import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { AutocompleteBuscador } from '@/components/shared/autocomplete-buscador'
import { ContenidoSelectTallas } from '@/components/shared/select-tallas'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { costeoRollosApi } from '@/features/costeo-rollos/api'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { costeoOrdenesApi } from '../api'
import type { LineaProduccionDetalle } from '../types'

const SIN_IMPRESORA = '__sin_impresora__'

interface TallaEditable {
  idTalla: number
  nombre: string
  cantidad: string
}

/**
 * Edita un ítem (línea) de una OP ya cargada — gateado `costeo.orden.editar`
 * en el padre. Si el ítem ya se envió a impresión, producto y tallas quedan
 * bloqueados (el consumo ya registrado se calculó con esos valores); el
 * servidor lo revalida igual, esto solo evita el viaje.
 */
export function ModalEditarLinea({
  open,
  onOpenChange,
  linea,
  onGuardado,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  linea: LineaProduccionDetalle
  onGuardado: () => void
}) {
  const bloqueado = linea.enviada

  const [textoProducto, setTextoProducto] = useState('')
  const [q, setQ] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [idProducto, setIdProducto] = useState<number | null>(null)
  const [tallas, setTallas] = useState<TallaEditable[]>([])
  const [idTallaNueva, setIdTallaNueva] = useState('')
  const [cantidadNueva, setCantidadNueva] = useState('')
  const [idImpresora, setIdImpresora] = useState(SIN_IMPRESORA)
  const [fechaData, setFechaData] = useState('')
  const [fechaCliente, setFechaCliente] = useState('')
  const [fechaEntregar, setFechaEntregar] = useState('')
  const [estatus, setEstatus] = useState('')
  const [prioridad, setPrioridad] = useState('')
  const [guardando, setGuardando] = useState(false)

  const { data: tallasCatalogo } = useQuery({
    queryKey: ['costeo-ordenes', 'edicion', 'tallas'],
    queryFn: () => costeoOrdenesApi.tallasEdicion(),
    enabled: open,
  })
  const { data: impresoras } = useQuery({
    queryKey: ['costeo-rollos', 'impresoras'],
    queryFn: () => costeoRollosApi.listarImpresoras(),
    enabled: open,
  })
  const { data: productosEncontrados } = useQuery({
    queryKey: ['costeo-ordenes', 'edicion', 'productos', q],
    queryFn: () => costeoOrdenesApi.buscarProductosEdicion(q),
    enabled: open && q !== '',
  })

  function onTextoProductoChange(v: string) {
    setTextoProducto(v)
    setIdProducto(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim() === '') setQ('')
    else debounceRef.current = setTimeout(() => setQ(v), 250)
  }

  const sincronizado = useRef(false)
  useEffect(() => {
    if (!open) {
      sincronizado.current = false
      return
    }
    if (sincronizado.current) return
    sincronizado.current = true
    setTextoProducto(`${linea.producto.codigo} — ${linea.producto.descripcion}`)
    setQ('')
    setIdProducto(linea.producto.idProducto)
    setTallas(linea.tallas.map((t) => ({ idTalla: t.talla.idTalla, nombre: t.talla.nombre, cantidad: String(t.cantidad) })))
    setIdTallaNueva('')
    setCantidadNueva('')
    setIdImpresora(linea.idImpresora ? String(linea.idImpresora) : SIN_IMPRESORA)
    setFechaData(linea.fechaData ? linea.fechaData.slice(0, 10) : '')
    setFechaCliente(linea.fechaCliente ? linea.fechaCliente.slice(0, 10) : '')
    setFechaEntregar(linea.fechaEntregar ? linea.fechaEntregar.slice(0, 10) : '')
    setEstatus(linea.estatus)
    setPrioridad(linea.prioridad ?? '')
  }, [open, linea])

  function agregarTalla() {
    if (!idTallaNueva) {
      avisarError('Elegí una talla.')
      return
    }
    const n = Number(cantidadNueva)
    if (!cantidadNueva.trim() || !Number.isInteger(n) || n <= 0) {
      avisarError('La cantidad tiene que ser un entero mayor que cero.')
      return
    }
    if (tallas.some((t) => t.idTalla === Number(idTallaNueva))) {
      avisarError('Esa talla ya está en la lista — editá la cantidad en vez de agregarla de nuevo.')
      return
    }
    const nombre = tallasCatalogo?.find((t) => t.idTalla === Number(idTallaNueva))?.nombre ?? ''
    setTallas([...tallas, { idTalla: Number(idTallaNueva), nombre, cantidad: String(n) }])
    setIdTallaNueva('')
    setCantidadNueva('')
  }

  async function guardar() {
    if (!bloqueado && tallas.length === 0) {
      avisarError('El ítem necesita al menos una talla.')
      return
    }
    setGuardando(true)
    try {
      const payload: Parameters<typeof costeoOrdenesApi.editarLinea>[1] = {}

      if (!bloqueado) {
        if (idProducto && idProducto !== linea.producto.idProducto) payload.idProducto = idProducto
        const tallasOriginal = [...linea.tallas]
          .map((t) => `${t.talla.idTalla}:${t.cantidad}`)
          .sort()
          .join(',')
        const tallasActual = [...tallas]
          .map((t) => `${t.idTalla}:${Number(t.cantidad)}`)
          .sort()
          .join(',')
        if (tallasActual !== tallasOriginal)
          payload.tallas = tallas.map((t) => ({ idTalla: t.idTalla, cantidad: Number(t.cantidad) }))
      }

      const idImpresoraActual = linea.idImpresora ? String(linea.idImpresora) : SIN_IMPRESORA
      if (idImpresora !== idImpresoraActual)
        payload.idImpresora = idImpresora === SIN_IMPRESORA ? null : Number(idImpresora)

      const fechaDataActual = linea.fechaData ? linea.fechaData.slice(0, 10) : ''
      if (fechaData !== fechaDataActual) payload.fechaData = fechaData || null
      const fechaClienteActual = linea.fechaCliente ? linea.fechaCliente.slice(0, 10) : ''
      if (fechaCliente !== fechaClienteActual) payload.fechaCliente = fechaCliente || null
      const fechaEntregarActual = linea.fechaEntregar ? linea.fechaEntregar.slice(0, 10) : ''
      if (fechaEntregar !== fechaEntregarActual) payload.fechaEntregar = fechaEntregar || null

      if (estatus.trim() && estatus.trim() !== linea.estatus) payload.estatus = estatus.trim()
      const prioridadNueva = prioridad.trim() || null
      if (prioridadNueva !== (linea.prioridad ?? null)) payload.prioridad = prioridadNueva

      if (Object.keys(payload).length === 0) {
        onOpenChange(false)
        return
      }

      await costeoOrdenesApi.editarLinea(linea.idLineaProduccion, payload)
      avisarExito('Ítem actualizado.')
      onOpenChange(false)
      onGuardado()
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'Error al guardar el ítem')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
        <div className="flex max-h-[80vh] flex-col">
          <DialogHeader>
            <DialogTitle>
              Editar ítem <span className="font-mono">{linea.codigoLine}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-1">
            {bloqueado && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                Este ítem ya se envió a impresión: el producto y las tallas quedan bloqueados porque el
                consumo de papel ya se calculó con esos valores. Anulá ese envío desde Consumo de Papel si
                de verdad hace falta cambiarlos.
              </p>
            )}

            <div>
              <Label className="mb-1 block text-xs">Producto</Label>
              <AutocompleteBuscador
                valor={textoProducto}
                onValorChange={onTextoProductoChange}
                items={productosEncontrados ?? []}
                getKey={(p) => p.idProducto}
                renderItem={(p) => (
                  <span>
                    <span className="font-mono text-xs">{p.codigo}</span> — {p.descripcion}
                  </span>
                )}
                onSeleccionar={(p) => {
                  setIdProducto(p.idProducto)
                  setTextoProducto(`${p.codigo} — ${p.descripcion}`)
                }}
                placeholder="Buscar por código o descripción…"
                vacioTexto={q ? 'Sin productos que coincidan' : 'Escribí para buscar…'}
                disabled={bloqueado}
              />
            </div>

            <div>
              <Label className="mb-1 block text-xs">Tallas</Label>
              {tallas.length === 0 ? (
                <p className="text-ink-faint text-xs">Ninguna todavía.</p>
              ) : (
                <ul className="space-y-1">
                  {tallas.map((t) => (
                    <li
                      key={t.idTalla}
                      className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-sm"
                    >
                      <span>{t.nombre}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{t.cantidad}</span>
                        {!bloqueado && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setTallas(tallas.filter((x) => x.idTalla !== t.idTalla))}
                          >
                            Quitar
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {!bloqueado && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="min-w-[160px] flex-1">
                    <Select value={idTallaNueva} onValueChange={setIdTallaNueva}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Talla…" />
                      </SelectTrigger>
                      <ContenidoSelectTallas tallas={tallasCatalogo} />
                    </Select>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Cantidad"
                    value={cantidadNueva}
                    onChange={(e) => setCantidadNueva(e.target.value)}
                    className="w-28"
                  />
                  <Button type="button" variant="outline" onClick={agregarTalla}>
                    Agregar
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label className="mb-1 block text-xs">Impresora</Label>
              <Select value={idImpresora} onValueChange={setIdImpresora}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_IMPRESORA}>Sin asignar</SelectItem>
                  {impresoras?.map((i) => (
                    <SelectItem key={i.idImpresora} value={String(i.idImpresora)}>
                      {i.codigo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="mb-1 block text-xs">Fecha data</Label>
                <Input type="date" value={fechaData} onChange={(e) => setFechaData(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Fecha cliente</Label>
                <Input type="date" value={fechaCliente} onChange={(e) => setFechaCliente(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Fecha entregar</Label>
                <Input type="date" value={fechaEntregar} onChange={(e) => setFechaEntregar(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="mb-1 block text-xs">Estatus</Label>
                <Input value={estatus} onChange={(e) => setEstatus(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Prioridad</Label>
                <Input value={prioridad} onChange={(e) => setPrioridad(e.target.value)} placeholder="Ej: RUSH" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={guardando} onClick={() => void guardar()}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
