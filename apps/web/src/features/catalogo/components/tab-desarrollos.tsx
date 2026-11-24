import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ContenidoSelectTallas } from '@/components/shared/select-tallas'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { formatGTQ } from '@digitexsa-erp/shared-utils'
import { catalogoApi, type FiltrosDesarrollos, type OperadorComparacion } from '../api'
import type { Desarrollo } from '../types'
import { ModalDesarrollo } from './modal-desarrollo'
import { ModalImportDesarrollos } from './modal-import-desarrollos'
import { ModalRecetaDesarrollo } from './modal-receta-desarrollo'

type FiltroEstado = 'BORRADOR' | 'APROBADO' | 'todos'

const TODOS = '__todos__'
const CUALQUIERA = '__cualquiera__'

const OPERADORES: { valor: OperadorComparacion; etiqueta: string }[] = [
  { valor: 'eq', etiqueta: '= igual a' },
  { valor: 'ne', etiqueta: '≠ distinto de' },
  { valor: 'gte', etiqueta: '≥ al menos' },
  { valor: 'lte', etiqueta: '≤ a lo sumo' },
]

/** Texto → número, o undefined si está vacío o no es un número válido. */
function aNumero(t: string): number | undefined {
  if (t.trim() === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Operador + valor para filtrar por una cantidad (≥, ≤, =, ≠). */
function FiltroNumerico({
  etiqueta,
  operador,
  valor,
  paso,
  onOperador,
  onValor,
}: {
  etiqueta: string
  operador: OperadorComparacion | typeof CUALQUIERA
  valor: string
  paso: string
  onOperador: (o: OperadorComparacion | typeof CUALQUIERA) => void
  onValor: (v: string) => void
}) {
  const activo = operador !== CUALQUIERA
  return (
    <div className="flex items-center gap-1.5">
      <Select value={operador} onValueChange={(v) => onOperador(v as OperadorComparacion | typeof CUALQUIERA)}>
        <SelectTrigger size="sm" className="w-64" aria-label={etiqueta}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CUALQUIERA}>{etiqueta}: cualquiera</SelectItem>
          {OPERADORES.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {etiqueta} {o.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {activo && (
        <Input
          type="number"
          min={0}
          step={paso}
          value={valor}
          onChange={(e) => onValor(e.target.value)}
          aria-label={`Valor de ${etiqueta}`}
          className="h-8 w-24"
        />
      )}
    </div>
  )
}

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
  const [talla, setTalla] = useState(TODOS)
  const [producto, setProducto] = useState<'todos' | 'con' | 'sin'>('todos')
  const [insumosOp, setInsumosOp] = useState<OperadorComparacion | typeof CUALQUIERA>(CUALQUIERA)
  const [insumosN, setInsumosN] = useState('')
  const [costoOp, setCostoOp] = useState<OperadorComparacion | typeof CUALQUIERA>(CUALQUIERA)
  const [costoN, setCostoN] = useState('')
  const [exportando, setExportando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const { data: clientes } = useQuery({ queryKey: ['catalogo', 'clientes'], queryFn: () => catalogoApi.clientes() })
  const { data: tallas } = useQuery({ queryKey: ['catalogo', 'tallas'], queryFn: () => catalogoApi.tallas() })

  // Todos los filtros viajan al servidor, que arma el WHERE una sola vez: el
  // Excel se exporta con exactamente los mismos, así que lo que se ve es lo que
  // se descarga. Los campos de texto y de número se retrasan un instante para
  // no consultar en cada tecla.
  const filtrosVivos = useMemo<FiltrosDesarrollos>(
    () => ({
      estado,
      q: busqueda.trim() || undefined,
      idCliente: cliente !== TODOS ? Number(cliente) : undefined,
      idTallaBase: talla !== TODOS ? Number(talla) : undefined,
      sinProducto: sinProducto || undefined,
      producto: producto !== 'todos' ? producto : undefined,
      insumosOp: insumosOp !== CUALQUIERA ? insumosOp : undefined,
      insumosN: insumosOp !== CUALQUIERA ? aNumero(insumosN) : undefined,
      costoOp: costoOp !== CUALQUIERA ? costoOp : undefined,
      costoN: costoOp !== CUALQUIERA ? aNumero(costoN) : undefined,
    }),
    [estado, busqueda, cliente, talla, sinProducto, producto, insumosOp, insumosN, costoOp, costoN],
  )
  const [filtros, setFiltros] = useState(filtrosVivos)
  useEffect(() => {
    const t = setTimeout(() => setFiltros(filtrosVivos), 300)
    return () => clearTimeout(t)
  }, [filtrosVivos])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['catalogo', 'desarrollos', filtros],
    queryFn: () => catalogoApi.listarDesarrollos({ ...filtros, limit: 2000 }),
    placeholderData: keepPreviousData,
  })
  const desarrollos = useMemo(() => data?.desarrollos ?? [], [data])

  const hayFiltros =
    cliente !== TODOS ||
    talla !== TODOS ||
    producto !== 'todos' ||
    insumosOp !== CUALQUIERA ||
    costoOp !== CUALQUIERA ||
    busqueda !== '' ||
    estado !== 'todos' ||
    sinProducto

  function limpiarFiltros() {
    setEstado('todos')
    setSinProducto(false)
    setBusqueda('')
    setCliente(TODOS)
    setTalla(TODOS)
    setProducto('todos')
    setInsumosOp(CUALQUIERA)
    setInsumosN('')
    setCostoOp(CUALQUIERA)
    setCostoN('')
  }

  async function exportar() {
    setMensaje(null)
    setExportando(true)
    try {
      // Con lo que está escrito ahora mismo, sin esperar al retraso de la consulta.
      await catalogoApi.exportarDesarrollos(filtrosVivos)
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'No se pudo exportar' })
    } finally {
      setExportando(false)
    }
  }

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
      <div className="flex flex-wrap items-center justify-between gap-2">
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
            {isFetching ? 'Buscando…' : `${data?.total ?? 0} desarrollos${hayFiltros ? ' con estos filtros' : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={exportando} onClick={exportar}>
            {exportando ? 'Exportando…' : 'Exportar a Excel'}
          </Button>
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
          <SelectContent className="max-h-80">
            <SelectItem value={TODOS}>Todos los clientes</SelectItem>
            {(clientes ?? []).map((c) => (
              <SelectItem key={c.idCliente} value={String(c.idCliente)}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={talla} onValueChange={setTalla}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Talla base" />
          </SelectTrigger>
          <ContenidoSelectTallas tallas={tallas} opcionVacia={{ value: TODOS, label: 'Todas las tallas' }} />
        </Select>
        <Select value={producto} onValueChange={(v) => setProducto(v as 'todos' | 'con' | 'sin')}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Con o sin producto</SelectItem>
            <SelectItem value="con">Con producto asignado</SelectItem>
            <SelectItem value="sin">Sin producto asignado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FiltroNumerico
          etiqueta="Nº de insumos"
          operador={insumosOp}
          valor={insumosN}
          paso="1"
          onOperador={(o) => {
            setInsumosOp(o)
            // Al elegir un operador sin valor, arranca en 0: "≠ 0" = "tiene insumos".
            if (o !== CUALQUIERA && insumosN.trim() === '') setInsumosN('0')
          }}
          onValor={setInsumosN}
        />
        <FiltroNumerico
          etiqueta="Costo unitario (Q)"
          operador={costoOp}
          valor={costoN}
          paso="0.01"
          onOperador={(o) => {
            setCostoOp(o)
            if (o !== CUALQUIERA && costoN.trim() === '') setCostoN('0')
          }}
          onValor={setCostoN}
        />
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
            Limpiar filtros
          </Button>
        )}
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
