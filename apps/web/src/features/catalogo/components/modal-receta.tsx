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
import { catalogoApi } from '../api'
import type { InsumoCatalogo, LineaReceta, ProductoCatalogo } from '../types'

const SIN_AREA = '__sin_area__'

interface ModalRecetaProps {
  producto: ProductoCatalogo | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModalReceta({ producto, open, onOpenChange }: ModalRecetaProps) {
  const { tienePermiso } = useAuth()
  const puedeEditar = tienePermiso('recetas.recetas.editar')
  const queryClient = useQueryClient()

  const { data: lineas } = useQuery({
    queryKey: ['catalogo', 'receta', producto?.idProducto],
    queryFn: () => catalogoApi.lineasReceta(producto!.idProducto),
    enabled: open && !!producto,
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

  // alta de línea
  const [textoInsumo, setTextoInsumo] = useState('')
  const [insumoElegido, setInsumoElegido] = useState<InsumoCatalogo | null>(null)
  const [consumoNuevo, setConsumoNuevo] = useState('')
  const [areaNueva, setAreaNueva] = useState('')

  // edición de línea existente
  const [idEditando, setIdEditando] = useState<number | null>(null)
  const [consumoEdit, setConsumoEdit] = useState('')
  const [areaEdit, setAreaEdit] = useState('')

  const opcionesInsumo = useMemo(() => {
    const texto = textoInsumo.trim().toLowerCase()
    if (!texto) return []
    return (insumos ?? [])
      .filter((i) => i.codigo.toLowerCase().includes(texto) || i.descripcion.toLowerCase().includes(texto))
      .slice(0, 20)
  }, [insumos, textoInsumo])

  const grupos = useMemo(() => {
    const g: Record<string, LineaReceta[]> = {}
    for (const l of lineas ?? []) (g[l.categoria] ??= []).push(l)
    return g
  }, [lineas])

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'receta', producto?.idProducto] })
  }

  async function agregarLinea() {
    if (!producto || !insumoElegido || !(Number(consumoNuevo) > 0)) return
    setMensaje(null)
    try {
      await catalogoApi.agregarLineaReceta(producto.idProducto, {
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
    setIdEditando(l.idProductoInsumo)
    setConsumoEdit(String(l.consumo))
    setAreaEdit(l.idArea ? String(l.idArea) : '')
  }

  async function guardarEdicion() {
    if (!producto || idEditando === null || !(Number(consumoEdit) > 0)) return
    setMensaje(null)
    try {
      await catalogoApi.editarLineaReceta(producto.idProducto, idEditando, {
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
    if (!producto) return
    setMensaje(null)
    try {
      await catalogoApi.eliminarLineaReceta(producto.idProducto, l.idProductoInsumo)
      invalidar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al eliminar la línea' })
    }
  }

  if (!producto) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Receta — {producto.codigo} · {producto.descripcion}
          </DialogTitle>
        </DialogHeader>

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
                {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(grupos).map(([categoria, filas]) => (
                <Fragment key={categoria}>
                  <TableRow className="bg-muted">
                    <TableCell colSpan={puedeEditar ? 4 : 3} className="text-xs font-bold tracking-wide uppercase">
                      {categoria}
                    </TableCell>
                  </TableRow>
                  {filas.map((l) => {
                    const editando = idEditando === l.idProductoInsumo
                    return (
                      <TableRow key={l.idProductoInsumo}>
                        <TableCell>
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
              ))}
              {(lineas ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={puedeEditar ? 4 : 3} className="text-muted-foreground text-center">
                    Esta receta no tiene líneas todavía
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {puedeEditar && (
          <div className="flex items-end gap-2 border-t pt-3">
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
                renderItem={(i) => (
                  <div>
                    <span className="text-primary font-semibold">{i.codigo}</span> — {i.descripcion}
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
          <Button variant="outline" onClick={() => catalogoApi.exportarPlantillaReceta(producto.idProducto, producto.codigo)}>
            Exportar receta (Excel)
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
