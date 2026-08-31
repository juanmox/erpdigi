import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { formatGTQ } from '@digitexsa-erp/shared-utils'
import { catalogoApi } from '../api'
import type { Desarrollo } from '../types'
import { ModalDesarrollo } from './modal-desarrollo'
import { ModalImportDesarrollos } from './modal-import-desarrollos'
import { ModalRecetaDesarrollo } from './modal-receta-desarrollo'

type FiltroEstado = 'BORRADOR' | 'APROBADO' | 'todos'

const TODOS = '__todos__'

export function TabDesarrollos() {
  const { tienePermiso } = useAuth()
  const puedeCrear = tienePermiso('recetas.desarrollos.crear')
  const puedeEditar = tienePermiso('recetas.desarrollos.editar')
  const puedeAprobar = tienePermiso('recetas.desarrollos.aprobar')
  const puedeImportar = tienePermiso('recetas.importar')
  const queryClient = useQueryClient()

  const [estado, setEstado] = useState<FiltroEstado>('todos')
  const [sinProducto, setSinProducto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [cliente, setCliente] = useState(TODOS)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['catalogo', 'desarrollos', estado, sinProducto],
    queryFn: () => catalogoApi.listarDesarrollos({ estado, sinProducto: sinProducto || undefined, limit: 2000 }),
  })
  const todos = useMemo(() => data?.desarrollos ?? [], [data])

  // Filtrado por texto en cliente: con ~1,300 filas ya cargadas alcanza y evita
  // un ida y vuelta por cada tecla (mismo criterio que las otras pestañas).
  const clientesDisponibles = useMemo(
    () =>
      [...new Set(todos.map((d) => d.clienteNombre).filter((c): c is string => !!c))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    [todos],
  )

  const desarrollos = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    return todos.filter((d) => {
      if (t && !d.codigo.toLowerCase().includes(t) && !d.descripcion.toLowerCase().includes(t)) return false
      if (cliente !== TODOS && d.clienteNombre !== cliente) return false
      return true
    })
  }, [todos, busqueda, cliente])

  const [modalAbierto, setModalAbierto] = useState(false)
  const [editando, setEditando] = useState<Desarrollo | null>(null)
  const [recetaAbierta, setRecetaAbierta] = useState(false)
  const [recetaDe, setRecetaDe] = useState<Desarrollo | null>(null)
  const [importAbierto, setImportAbierto] = useState(false)

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'desarrollos'] })
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'productos'] })
  }

  async function cambiarEstado(d: Desarrollo) {
    setMensaje(null)
    try {
      if (d.estado === 'BORRADOR') await catalogoApi.aprobarDesarrollo(d.idDesarrollo)
      else await catalogoApi.reabrirDesarrollo(d.idDesarrollo)
      invalidar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al cambiar el estado' })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={estado} onValueChange={(v) => setEstado(v as FiltroEstado)}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="BORRADOR">Borrador</SelectItem>
              <SelectItem value="APROBADO">Aprobado</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-sm">
            {desarrollos.length} de {todos.length} desarrollos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeImportar && (
            <>
              <Button variant="outline" size="sm" onClick={() => catalogoApi.plantillaDesarrollos()}>
                Plantilla
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportAbierto(true)}>
                Importar desarrollos
              </Button>
            </>
          )}
          {puedeCrear && (
            <Button
              size="sm"
              onClick={() => {
                setEditando(null)
                setModalAbierto(true)
              }}
            >
              Nuevo desarrollo
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
            {clientesDisponibles.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox id="sin-producto" checked={sinProducto} onCheckedChange={(c) => setSinProducto(c === true)} />
          <Label htmlFor="sin-producto" className="text-sm font-normal">
            Solo sin producto asignado
          </Label>
        </div>
      </div>

      {mensaje && (
        <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{mensaje.texto}</AlertDescription>
        </Alert>
      )}

      {/* Anchos en % (no rem) para que la tabla siempre entre en el ancho
          disponible y el texto crezca hacia abajo — ver nota en tab-productos. */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full table-fixed min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[10%]">Código</TableHead>
              <TableHead className="w-[21%]">Descripción</TableHead>
              <TableHead className="w-[14%]">Cliente</TableHead>
              <TableHead className="w-[4%]">Talla</TableHead>
              <TableHead className="w-[9%]">Estado</TableHead>
              <TableHead className="w-[5%] text-right">Ins.</TableHead>
              <TableHead className="w-[9%] text-right">Costo</TableHead>
              <TableHead className="w-[11%]">Producto</TableHead>
              <TableHead className="w-[18%] text-right">Acciones</TableHead>
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
            {desarrollos.map((d) => (
              <TableRow key={d.idDesarrollo}>
                <TableCell className="truncate font-medium">{d.codigo}</TableCell>
                <TableCell className="break-words whitespace-normal">{d.descripcion}</TableCell>
                <TableCell className="break-words whitespace-normal">{d.clienteNombre ?? '—'}</TableCell>
                <TableCell>{d.tallaBase ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={d.estado === 'APROBADO' ? 'default' : 'secondary'}>
                    {d.estado === 'APROBADO' ? 'Aprobado' : 'Borrador'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{d.lineas}</TableCell>
                <TableCell className="text-right tabular-nums">{formatGTQ(d.costoUnitario)}</TableCell>
                <TableCell className="truncate">{d.productoCodigo ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap justify-end gap-x-1 gap-y-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-1.5"
                      onClick={() => {
                        setRecetaDe(d)
                        setRecetaAbierta(true)
                      }}
                    >
                      Receta
                    </Button>
                    {puedeEditar && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditando(d)
                          setModalAbierto(true)
                        }}
                      >
                        Editar
                      </Button>
                    )}
                    {puedeAprobar && (
                      <Button variant="ghost" size="sm" className="px-1.5" onClick={() => cambiarEstado(d)}>
                        {d.estado === 'BORRADOR' ? 'Aprobar' : 'Reabrir'}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && desarrollos.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground text-center">
                  No hay desarrollos que coincidan
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ModalDesarrollo desarrollo={editando} open={modalAbierto} onOpenChange={setModalAbierto} />
      <ModalRecetaDesarrollo desarrollo={recetaDe} open={recetaAbierta} onOpenChange={setRecetaAbierta} />
      <ModalImportDesarrollos open={importAbierto} onOpenChange={setImportAbierto} onAplicado={invalidar} />
    </div>
  )
}
