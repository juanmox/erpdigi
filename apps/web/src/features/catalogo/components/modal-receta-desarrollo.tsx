import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState } from 'react'
import { AutocompleteBuscador } from '@/components/shared/autocomplete-buscador'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { formatGTQ } from '@digitexsa-erp/shared-utils'
import { catalogoApi } from '../api'
import type { Desarrollo, InsumoCatalogo, LineaReceta } from '../types'

const SIN_AREA = '__sin_area__'
const TODAS = '__todas__'

interface Props {
  desarrollo: Desarrollo | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Solo lectura — se usa al abrir la receta desde la pestaña Productos. */
  soloLectura?: boolean
}

export function ModalRecetaDesarrollo({ desarrollo, open, onOpenChange, soloLectura }: Props) {
  const { tienePermiso } = useAuth()
  const puedeEditar = !soloLectura && tienePermiso('recetas.recetas.editar')
  const queryClient = useQueryClient()

  // Se pide el detalle completo (no solo las líneas) porque el costo lo calcula
  // el servidor — nunca se suma en el cliente (convención #1).
  const { data: detalle } = useQuery({
    queryKey: ['catalogo', 'desarrollo', desarrollo?.idDesarrollo],
    queryFn: () => catalogoApi.obtenerDesarrollo(desarrollo!.idDesarrollo),
    enabled: open && !!desarrollo,
  })
  const { data: insumos } = useQuery({
    queryKey: ['catalogo', 'insumos', 'activos'],
    queryFn: () => catalogoApi.listarInsumos('activos'),
    enabled: open,
  })
  const { data: areas } = useQuery({
    queryKey: ['catalogo', 'areas-uso'],
    queryFn: () => catalogoApi.areasUso(),
    enabled: open,
  })

  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const [textoInsumo, setTextoInsumo] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState(TODAS)
  const [insumoElegido, setInsumoElegido] = useState<InsumoCatalogo | null>(null)
  const [consumoNuevo, setConsumoNuevo] = useState('')
  const [areaNueva, setAreaNueva] = useState('')

  const [idEditando, setIdEditando] = useState<number | null>(null)
  const [consumoEdit, setConsumoEdit] = useState('')
  const [areaEdit, setAreaEdit] = useState('')

  // Antes devolvía [] con el texto vacío, así que al enfocar el campo no se
  // veía más que el placeholder: había que adivinar un código. Ahora lista el
  // catálogo desde el foco y el filtro de categoría lo acota.
  const opcionesInsumo = useMemo(() => {
    const texto = textoInsumo.trim().toLowerCase()
    // Al elegir un insumo el texto pasa a "COD — descripción"; ese texto no
    // debe re-filtrar la lista, o al reabrirla se vería un solo resultado.
    const buscando = insumoElegido ? '' : texto
    return (insumos ?? [])
      .filter((i) => categoriaFiltro === TODAS || String(i.idCategoria) === categoriaFiltro)
      .filter(
        (i) =>
          !buscando ||
          i.codigo.toLowerCase().includes(buscando) ||
          i.descripcion.toLowerCase().includes(buscando),
      )
      .slice(0, 50)
  }, [insumos, textoInsumo, insumoElegido, categoriaFiltro])

  const categoriasDisponibles = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of insumos ?? []) m.set(String(i.idCategoria), i.categoria)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [insumos])

  const lineas = detalle?.insumos
  const grupos = useMemo(() => {
    const g: Record<string, LineaReceta[]> = {}
    for (const l of lineas ?? []) (g[l.categoria] ??= []).push(l)
    return g
  }, [lineas])

  // Editar la receta cambia el costo del desarrollo Y el del producto que lo
  // use, así que hay que invalidar ambas listas. Antes solo se invalidaba la
  // receta y la columna "Costo" del catálogo quedaba con el valor viejo.
  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'desarrollo', desarrollo?.idDesarrollo] })
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'desarrollos'] })
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'productos'] })
    // La página de Cotización usa su propio prefijo de caché.
    queryClient.invalidateQueries({ queryKey: ['recetas'] })
  }

  async function agregarLinea() {
    if (!desarrollo || !insumoElegido || !(Number(consumoNuevo) > 0)) return
    setMensaje(null)
    try {
      await catalogoApi.agregarLineaReceta(desarrollo.idDesarrollo, {
        idInsumo: insumoElegido.idInsumo,
        consumo: Number(consumoNuevo),
        idArea: areaNueva ? Number(areaNueva) : null,
      })
      setTextoInsumo('')
      setInsumoElegido(null)
      setConsumoNuevo('')
      setAreaNueva('')
      invalidar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al agregar la línea' })
    }
  }

  function iniciarEdicion(l: LineaReceta) {
    setIdEditando(l.idDesarrolloInsumo)
    setConsumoEdit(String(l.consumo))
    setAreaEdit(l.idArea ? String(l.idArea) : '')
  }

  async function guardarEdicion() {
    if (!desarrollo || idEditando === null || !(Number(consumoEdit) > 0)) return
    setMensaje(null)
    try {
      await catalogoApi.editarLineaReceta(desarrollo.idDesarrollo, idEditando, {
        consumo: Number(consumoEdit),
        idArea: areaEdit ? Number(areaEdit) : null,
      })
      setIdEditando(null)
      invalidar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al editar la línea' })
    }
  }

  async function eliminarLinea(l: LineaReceta) {
    if (!desarrollo) return
    setMensaje(null)
    try {
      await catalogoApi.eliminarLineaReceta(desarrollo.idDesarrollo, l.idDesarrolloInsumo)
      invalidar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al eliminar la línea' })
    }
  }

  if (!desarrollo) return null
  const nCols = puedeEditar ? 6 : 5

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Receta del desarrollo — {desarrollo.codigo} · {desarrollo.descripcion}
          </DialogTitle>
        </DialogHeader>

        {detalle?.estado === 'APROBADO' && detalle.productoCodigo && puedeEditar && (
          <Alert>
            <AlertDescription>
              Este desarrollo está aprobado y asignado al producto <strong>{detalle.productoCodigo}</strong>. Cambiar
              su receta cambia el costo de ese producto y el de las cotizaciones futuras (las ya guardadas no se tocan).
            </AlertDescription>
          </Alert>
        )}

        {mensaje && (
          <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{mensaje.texto}</AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead>Consumo</TableHead>
                <TableHead>Área</TableHead>
                <TableHead className="text-right">C. Prom.</TableHead>
                <TableHead className="text-right">C. Total</TableHead>
                {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(grupos).map(([categoria, filas]) => {
                const subtotal = filas.reduce((acc, f) => acc + f.costoTotal, 0)
                return (
                  <Fragment key={categoria}>
                    <TableRow className="bg-muted">
                      <TableCell colSpan={nCols - 1} className="text-xs font-bold tracking-wide uppercase">
                        {categoria}
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold tabular-nums">{formatGTQ(subtotal)}</TableCell>
                    </TableRow>
                    {filas.map((l) => {
                      const editando = idEditando === l.idDesarrolloInsumo
                      return (
                        <TableRow key={l.idDesarrolloInsumo}>
                          <TableCell className="max-w-xs whitespace-normal">
                            <span className="font-medium">{l.codigo}</span> {l.descripcion}
                          </TableCell>
                          <TableCell>
                            {editando ? (
                              <Input
                                type="number"
                                step="0.000001"
                                min={0}
                                className="h-8 w-24"
                                value={consumoEdit}
                                onChange={(e) => setConsumoEdit(e.target.value)}
                              />
                            ) : (
                              `${l.consumo} ${l.unidad}`
                            )}
                          </TableCell>
                          <TableCell>
                            {editando ? (
                              <Select value={areaEdit || SIN_AREA} onValueChange={(v) => setAreaEdit(v === SIN_AREA ? '' : v)}>
                                <SelectTrigger size="sm" className="w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={SIN_AREA}>Sin área</SelectItem>
                                  {areas?.map((a) => (
                                    <SelectItem key={a.idArea} value={String(a.idArea)}>
                                      {a.nombre}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              (l.area ?? '—')
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatGTQ(l.costoPromedio)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatGTQ(l.costoTotal)}</TableCell>
                          {puedeEditar && (
                            <TableCell className="text-right">
                              {editando ? (
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" onClick={guardarEdicion}>
                                    Guardar
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setIdEditando(null)}>
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex justify-end gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => iniciarEdicion(l)}>
                                    Editar
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => eliminarLinea(l)}>
                                    Eliminar
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </Fragment>
                )
              })}

              {detalle?.manoObra && (
                <Fragment>
                  <TableRow className="bg-muted">
                    <TableCell colSpan={nCols - 1} className="text-xs font-bold tracking-wide uppercase">
                      Mano de obra
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold tabular-nums">
                      {formatGTQ(detalle.manoObra.costoTotal)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Mano de obra</TableCell>
                    <TableCell>{detalle.manoObra.consumo} Minutos</TableCell>
                    <TableCell>{detalle.manoObra.area ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatGTQ(detalle.manoObra.costoPromedio)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatGTQ(detalle.manoObra.costoTotal)}</TableCell>
                    {puedeEditar && <TableCell />}
                  </TableRow>
                </Fragment>
              )}

              {(lineas ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={nCols} className="text-muted-foreground text-center">
                    Esta receta no tiene líneas todavía
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end gap-6 border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            Insumos: <span className="text-ink tabular-nums">{formatGTQ(detalle?.costoInsumos ?? 0)}</span>
          </span>
          <span className="text-muted-foreground">
            Mano de obra: <span className="text-ink tabular-nums">{formatGTQ(detalle?.costoManoObra ?? 0)}</span>
          </span>
          <span className="font-semibold">
            Costo unitario: <span className="tabular-nums">{formatGTQ(detalle?.costoUnitario ?? 0)}</span>
          </span>
        </div>

        {puedeEditar && (
          <div className="flex items-end gap-2 border-t pt-3">
            <div className="w-40">
              <Label className="mb-1 block text-xs">Categoría</Label>
              <Select
                value={categoriaFiltro}
                onValueChange={(v) => {
                  setCategoriaFiltro(v)
                  setTextoInsumo('')
                  setInsumoElegido(null)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todas</SelectItem>
                  {categoriasDisponibles.map(([id, nombre]) => (
                    <SelectItem key={id} value={id}>
                      {nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="mb-1 block text-xs">Insumo</Label>
              <AutocompleteBuscador
                valor={textoInsumo}
                onValorChange={(v) => {
                  setTextoInsumo(v)
                  setInsumoElegido(null)
                }}
                items={opcionesInsumo}
                getKey={(i) => i.idInsumo}
                onSeleccionar={(i) => {
                  setInsumoElegido(i)
                  setTextoInsumo(`${i.codigo} — ${i.descripcion}`)
                }}
                placeholder="Buscar insumo por código o descripción…"
                vacioTexto="Sin insumos activos en esta categoría"
                renderItem={(i) => (
                  <div className="flex items-baseline justify-between gap-3">
                    <span>
                      <span className="text-primary font-semibold">{i.codigo}</span> — {i.descripcion}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatGTQ(i.costoPromedio)} / {i.unidad}
                    </span>
                  </div>
                )}
              />
            </div>
            <div className="w-24">
              <Label className="mb-1 block text-xs">Consumo</Label>
              <Input type="number" step="0.000001" min={0} value={consumoNuevo} onChange={(e) => setConsumoNuevo(e.target.value)} />
            </div>
            <div className="w-36">
              <Label className="mb-1 block text-xs">Área</Label>
              <Select value={areaNueva || SIN_AREA} onValueChange={(v) => setAreaNueva(v === SIN_AREA ? '' : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_AREA}>Sin área</SelectItem>
                  {areas?.map((a) => (
                    <SelectItem key={a.idArea} value={String(a.idArea)}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!insumoElegido || !(Number(consumoNuevo) > 0)} onClick={agregarLinea}>
              Agregar
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
