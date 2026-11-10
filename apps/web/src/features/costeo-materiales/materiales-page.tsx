import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { GrupoColapsable } from '@/components/shared/grupo-colapsable'
import { ImportPreviewDialog } from '@/components/shared/import-preview-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { costeoMaterialesApi } from './api'
import { DialogoAccion, type ValoresAccion } from './components/dialogo-accion'
import { ModalEditarMaterial } from './components/modal-editar-material'
import { ModalHistorialItem } from './components/modal-historial-item'
import { TabHistorial } from './components/tab-historial'
import type {
  AccionEntrega,
  CampoFecha,
  EditarMaterial,
  EstadoMaterial,
  FilaPreviewMaterial,
  FiltrosMateriales,
  Material,
} from './types'

/** yyyy-mm-dd -> dd/mm/aaaa, sin pasar por Date (evita el corrimiento de zona). */
const fechaCorta = (dia: string) => {
  const [a, m, d] = dia.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
/** Un instante (ISO) como día de Guatemala. */
const diaDeCarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric' })
/** Hoy en Guatemala, como yyyy-mm-dd. */
const hoyGT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })

const ETIQUETA_ESTADO: Record<EstadoMaterial, string> = {
  todos: 'Todos (sin anulados)',
  pendientes: 'Pendientes de entrega',
  entregados: 'Entregados',
  anulados: 'Anulados',
  sin_costo: 'Sin costo',
  sin_ligar: 'OP sin cargar',
  modificados: 'Con modificaciones',
}
const ETIQUETA_CAMPO: Record<CampoFecha, string> = {
  planificador: 'Fecha del planificador',
  carga: 'Fecha de carga',
  entrega: 'Fecha de entrega',
}

const num = (n: number) => n.toLocaleString('es-GT', { maximumFractionDigits: 4 })
const dinero = (n: number) => 'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function EstadoBadge({ m }: { m: Material }) {
  if (m.anulado) return <Badge variant="destructive">Anulado</Badge>
  return m.entregado ? <Badge variant="secondary">Entregado</Badge> : <Badge variant="outline">Pendiente</Badge>
}

/** Las marcas que no son el estado: la OP aún no existe, o no hay precio. */
function Marcas({ m }: { m: Material }) {
  return (
    <>
      {m.modificaciones > 0 && (
        <Badge variant="outline" className="border-sky-500/60 text-sky-700 dark:text-sky-400" title="Tiene cambios en su historial">
          Modificado{m.modificaciones > 1 ? ` ×${m.modificaciones}` : ''}
        </Badge>
      )}
      {!m.opLigada && (
        <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400" title="La OP todavía no está cargada en el ERP; se liga sola cuando se cargue">
          OP sin cargar
        </Badge>
      )}
      {m.sinCosto && (
        <Badge variant="outline" title="El insumo no tenía precio cuando se cargó">
          Sin costo
        </Badge>
      )}
    </>
  )
}

type Accion =
  | { tipo: 'ENTREGAR' | 'CORREGIR_FECHA' | 'REVERTIR' }
  | { tipo: 'ANULAR' }

export function MaterialesPage() {
  const queryClient = useQueryClient()
  const { tienePermiso } = useAuth()
  const puedeImportar = tienePermiso('costeo.material.importar')
  const puedeEntregar = tienePermiso('costeo.material.entregar')
  const puedeValorizar = tienePermiso('costeo.material.valorizar')
  // Bodega (entrega pero no carga) entra directo a lo que le toca: lo pendiente.
  const estadoInicial: EstadoMaterial = puedeEntregar && !puedeImportar ? 'pendientes' : 'todos'

  const [ordenPlanificacion, setOrdenPlanificacion] = useState('')
  const [op, setOp] = useState('')
  const [insumo, setInsumo] = useState('')
  const [salida, setSalida] = useState('')
  const [estado, setEstado] = useState<EstadoMaterial>(estadoInicial)
  const [campoFecha, setCampoFecha] = useState<CampoFecha>('planificador')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [soloMios, setSoloMios] = useState(false)
  const [aplicados, setAplicados] = useState<FiltrosMateriales>({ estado: estadoInicial })

  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [accion, setAccion] = useState<Accion | null>(null)
  const [editando, setEditando] = useState<Material | null>(null)
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [nombreArchivo, setNombreArchivo] = useState<string | undefined>()
  const [historialId, setHistorialId] = useState<number | null>(null)
  const [exportando, setExportando] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['costeo-materiales', 'listado', aplicados],
    queryFn: () => costeoMaterialesApi.listar(aplicados),
  })

  const refrescar = () => {
    setSeleccion(new Set())
    return queryClient.invalidateQueries({ queryKey: ['costeo-materiales'] })
  }
  const alFallar = (e: unknown) => avisarError(e instanceof ApiError ? e.message : 'No se pudo completar la acción')

  const entrega = useMutation({
    mutationFn: (v: { accion: AccionEntrega; salidaSac?: string; fechaEntrega?: string; motivo?: string }) =>
      costeoMaterialesApi.entrega({ ids: [...seleccion], ...v }),
    onSuccess: (r, v) => {
      setAccion(null)
      const verbo =
        v.accion === 'ENTREGAR' ? 'entregado(s)' : v.accion === 'CORREGIR_FECHA' ? 'con la fecha corregida' : 'devuelto(s) a pendiente'
      avisarExito(`${r.aplicados} ítem(s) ${verbo}` + (r.omitidos ? ` · ${r.omitidos} no aplicaba(n)` : ''))
      void refrescar()
    },
    onError: alFallar,
  })

  const anular = useMutation({
    mutationFn: (motivo: string) => costeoMaterialesApi.anular([...seleccion], motivo),
    onSuccess: (r) => {
      setAccion(null)
      avisarExito(
        `${r.anulados} ítem(s) anulado(s)` + (r.noPermitidos ? ` · ${r.noPermitidos} no se podían anular (son de otra persona o ya se entregaron)` : ''),
      )
      void refrescar()
    },
    onError: alFallar,
  })

  const editar = useMutation({
    mutationFn: (v: { id: number; cambios: EditarMaterial }) => costeoMaterialesApi.editar(v.id, v.cambios),
    onSuccess: (r) => {
      setEditando(null)
      setErrorEdicion(null)
      avisarExito(r.modificado ? 'Ítem modificado. El cambio quedó en su historial.' : 'No había nada que cambiar')
      void refrescar()
    },
    onError: (e) => setErrorEdicion(e instanceof ApiError ? e.message : 'No se pudo guardar'),
  })

  const congelar = useMutation({
    mutationFn: () => costeoMaterialesApi.congelarCostos(),
    onSuccess: (r) => {
      avisarExito(
        r.actualizados > 0
          ? `${r.actualizados} ítem(s) valorizado(s)` + (r.siguenSinCosto ? ` · ${r.siguenSinCosto} siguen sin costo (su insumo aún no tiene precio)` : '')
          : r.siguenSinCosto > 0
            ? `Ningún ítem se pudo valorizar: sus insumos todavía no tienen precio (${r.siguenSinCosto} sin costo)`
            : 'No hay ítems sin costo',
      )
      void refrescar()
    },
    onError: alFallar,
  })

  /** Exporta lo que se ve: los filtros ya aplicados, no los que se están escribiendo. */
  async function exportar() {
    setExportando(true)
    try {
      await costeoMaterialesApi.exportar(aplicados)
    } catch (e) {
      alFallar(e)
    } finally {
      setExportando(false)
    }
  }

  function ver() {
    setSeleccion(new Set())
    setAplicados({
      ordenPlanificacion: ordenPlanificacion.trim() || undefined,
      op: op.trim() || undefined,
      insumo: insumo.trim() || undefined,
      salida: salida.trim() || undefined,
      estado,
      campoFecha: desde || hasta ? campoFecha : undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      soloMios: soloMios || undefined,
    })
  }
  function limpiar() {
    setOrdenPlanificacion('')
    setOp('')
    setInsumo('')
    setSalida('')
    setEstado(estadoInicial)
    setCampoFecha('planificador')
    setDesde('')
    setHasta('')
    setSoloMios(false)
    setSeleccion(new Set())
    setAplicados({ estado: estadoInicial })
  }

  // Agrupado por orden de planificación, respetando el orden del servidor.
  const grupos = useMemo(() => {
    const m = new Map<string, Material[]>()
    for (const it of data?.items ?? []) {
      const lista = m.get(it.ordenPlanificacion)
      if (lista) lista.push(it)
      else m.set(it.ordenPlanificacion, [it])
    }
    return [...m.entries()]
  }, [data])

  const verDinero = data?.items.some((i) => i.costoTotal != null || i.costoUnitario != null) ?? false
  const idsSeleccionables = useMemo(() => (data?.items ?? []).filter((i) => !i.anulado).map((i) => i.idMaterialOp), [data])

  function alternar(ids: number[], marcar: boolean) {
    setSeleccion((prev) => {
      const s = new Set(prev)
      for (const id of ids) {
        if (marcar) s.add(id)
        else s.delete(id)
      }
      return s
    })
  }
  const estadoDe = (ids: number[]): boolean | 'indeterminate' => {
    const n = ids.filter((i) => seleccion.has(i)).length
    return n === 0 ? false : n === ids.length ? true : 'indeterminate'
  }

  const seleccionados = (data?.items ?? []).filter((i) => seleccion.has(i.idMaterialOp))
  const hayPendientesSel = seleccionados.some((i) => !i.entregado)
  const hayEntregadosSel = seleccionados.some((i) => i.entregado)

  function confirmarAccion(v: ValoresAccion) {
    if (!accion) return
    if (accion.tipo === 'ANULAR') anular.mutate(v.motivo)
    else if (accion.tipo === 'ENTREGAR') entrega.mutate({ accion: 'ENTREGAR', salidaSac: v.salida, fechaEntrega: v.fecha })
    else if (accion.tipo === 'REVERTIR') entrega.mutate({ accion: 'REVERTIR', motivo: v.motivo })
    else entrega.mutate({ accion: 'CORREGIR_FECHA', fechaEntrega: v.fecha, motivo: v.motivo })
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Explosión de materiales</h1>
          <p className="text-muted-foreground text-sm">
            Los insumos que el planificador pide a bodega para cada OP, y su entrega.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeValorizar && (
            <Button variant="outline" disabled={congelar.isPending} onClick={() => congelar.mutate()}>
              {congelar.isPending ? 'Valorizando…' : 'Congelar costos pendientes'}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={exportando}
            onClick={() => void exportar()}
            title="Exporta lo que se ve con los filtros aplicados, con resúmenes por planificador, fecha, estado, insumo, OP, salida y usuario. Incluye los anulados, marcados."
          >
            {exportando ? 'Exportando…' : 'Exportar a Excel'}
          </Button>
          {puedeImportar && <Button onClick={() => setImportOpen(true)}>Importar plantilla</Button>}
        </div>
      </div>

      <Tabs defaultValue="items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="items">Ítems</TabsTrigger>
          <TabsTrigger value="historial">Historial de cambios</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div>
                  <Label className="mb-1 block text-xs">Orden de planificación</Label>
                  <Input value={ordenPlanificacion} onChange={(e) => setOrdenPlanificacion(e.target.value)} placeholder="25P0000294" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">OP</Label>
                  <Input value={op} onChange={(e) => setOp(e.target.value)} placeholder="25OP021463 o parte" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Insumo (código o descripción)</Label>
                  <Input value={insumo} onChange={(e) => setInsumo(e.target.value)} placeholder="ZIPPER, 6150116…" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Salida SAC</Label>
                  <Input value={salida} onChange={(e) => setSalida(e.target.value)} placeholder="9723" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Estado</Label>
                  <Select value={estado} onValueChange={(v) => setEstado(v as EstadoMaterial)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ETIQUETA_ESTADO) as EstadoMaterial[]).map((e) => (
                        <SelectItem key={e} value={e}>
                          {ETIQUETA_ESTADO[e]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Rango por</Label>
                  <Select value={campoFecha} onValueChange={(v) => setCampoFecha(v as CampoFecha)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ETIQUETA_CAMPO) as CampoFecha[]).map((c) => (
                        <SelectItem key={c} value={c}>
                          {ETIQUETA_CAMPO[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Desde</Label>
                  <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Hasta</Label>
                  <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={soloMios} onCheckedChange={(v) => setSoloMios(v === true)} />
                  Solo lo que cargué yo
                </label>
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" onClick={limpiar}>
                    Limpiar
                  </Button>
                  <Button onClick={ver}>Ver</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {error && <p className="text-destructive text-sm">{error instanceof ApiError ? error.message : 'No se pudo cargar el listado'}</p>}

          {data && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span>
                <strong>{data.resumen.mostrados}</strong> ítem(s)
                {data.truncado && <span className="text-amber-700 dark:text-amber-400"> de {data.total} (se muestran los primeros: afiná los filtros)</span>}
              </span>
              <span className="text-muted-foreground">{data.resumen.pendientes} pendientes</span>
              <span className="text-muted-foreground">{data.resumen.entregados} entregados</span>
              {data.resumen.sinCosto > 0 && <span className="text-muted-foreground">{data.resumen.sinCosto} sin costo</span>}
              {data.resumen.sinLigar > 0 && <span className="text-muted-foreground">{data.resumen.sinLigar} con OP sin cargar</span>}
              {data.resumen.costoTotal != null && (
                <span className="font-medium">
                  {dinero(data.resumen.costoTotal)}
                  {data.resumen.sinCosto > 0 && (
                    <span className="text-muted-foreground font-normal"> (sin contar los {data.resumen.sinCosto} sin costo)</span>
                  )}
                </span>
              )}
            </div>
          )}

          {seleccion.size > 0 && (
            <div className="bg-card sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border p-2 shadow-sm">
              <span className="px-1 text-sm font-medium">{seleccion.size} seleccionado(s)</span>
              {puedeEntregar && hayPendientesSel && <Button size="sm" onClick={() => setAccion({ tipo: 'ENTREGAR' })}>Entregar…</Button>}
              {puedeEntregar && hayEntregadosSel && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setAccion({ tipo: 'CORREGIR_FECHA' })}>
                    Corregir fecha de entrega…
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAccion({ tipo: 'REVERTIR' })}>
                    Revertir entrega…
                  </Button>
                </>
              )}
              {puedeImportar && (
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => setAccion({ tipo: 'ANULAR' })}>
                  Anular…
                </Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSeleccion(new Set())}>
                Limpiar selección
              </Button>
            </div>
          )}

          {isLoading && <p className="text-muted-foreground text-sm">Cargando…</p>}
          {data && data.items.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm">No hay ítems con esos filtros.</p>
          )}

          {data && data.items.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={estadoDe(idsSeleccionables)}
                onCheckedChange={(v) => alternar(idsSeleccionables, v === true)}
                aria-label="Seleccionar todo lo que se ve"
              />
              Seleccionar todo lo que se ve ({idsSeleccionables.length})
            </label>
          )}

          <div className="space-y-3">
            {grupos.map(([planificador, items]) => {
              const ids = items.filter((i) => !i.anulado).map((i) => i.idMaterialOp)
              const pendientes = items.filter((i) => !i.entregado && !i.anulado).length
              return (
                <Card key={planificador}>
                  <CardContent className="pt-3">
                    {/* items-start: con items-center el checkbox quedaba centrado contra
                        la tabla entera y flotaba lejos del título del grupo. */}
                    <div className="flex items-start gap-2">
                      {ids.length > 0 && (
                        <Checkbox
                          className="mt-2.5"
                          checked={estadoDe(ids)}
                          onCheckedChange={(v) => alternar(ids, v === true)}
                          aria-label={`Seleccionar la orden de planificación ${planificador}`}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <GrupoColapsable
                          titulo={
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 normal-case">
                              <span className="text-foreground font-mono text-sm">{planificador}</span>
                              <span className="font-normal">{fechaCorta(items[0].fechaPlanificador)}</span>
                              <span className="font-normal">{items.length} ítem(s)</span>
                              {pendientes > 0 && <span className="font-normal text-amber-700 dark:text-amber-400">{pendientes} pendiente(s)</span>}
                            </span>
                          }
                        >
                          <TablaItems
                            items={items}
                            verDinero={verDinero}
                            seleccion={seleccion}
                            onAlternar={(id, v) => alternar([id], v)}
                            onEditar={(m) => {
                              setErrorEdicion(null)
                              setEditando(m)
                            }}
                            onHistorial={(m) => setHistorialId(m.idMaterialOp)}
                          />
                        </GrupoColapsable>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="historial">
          <TabHistorial onVerItem={setHistorialId} />
        </TabsContent>
      </Tabs>

      <ModalHistorialItem idMaterialOp={historialId} onCerrar={() => setHistorialId(null)} />

      {accion && (
        <DialogoAccion
          key={accion.tipo}
          abierto
          titulo={
            accion.tipo === 'ENTREGAR'
              ? 'Registrar la entrega'
              : accion.tipo === 'CORREGIR_FECHA'
                ? 'Corregir la fecha de entrega'
                : accion.tipo === 'REVERTIR'
                  ? 'Revertir la entrega'
                  : 'Anular ítems'
          }
          descripcion={
            accion.tipo === 'ENTREGAR'
              ? `Se entregan los ítems pendientes de los ${seleccion.size} seleccionados. Una misma salida puede cubrir varios ítems y varias OP.`
              : accion.tipo === 'CORREGIR_FECHA'
                ? 'Cambia la fecha de entrega de los ítems ya entregados. Queda en el historial de cada ítem.'
                : accion.tipo === 'REVERTIR'
                  ? 'Los ítems ya entregados vuelven a pendiente y pierden su salida y su fecha de entrega. Queda en el historial de cada ítem.'
                  : `Se anulan los ${seleccion.size} seleccionados que puedas tocar. No se borran: quedan con su motivo y quién los anuló.`
          }
          campos={
            accion.tipo === 'ENTREGAR'
              ? ['salida', 'fecha']
              : accion.tipo === 'CORREGIR_FECHA'
                ? ['fecha', 'motivo']
                : ['motivo']
          }
          textoConfirmar={
            accion.tipo === 'ANULAR' ? 'Anular' : accion.tipo === 'ENTREGAR' ? 'Entregar' : accion.tipo === 'REVERTIR' ? 'Revertir' : 'Corregir'
          }
          peligroso={accion.tipo === 'ANULAR' || accion.tipo === 'REVERTIR'}
          fechaInicial={hoyGT()}
          pendiente={entrega.isPending || anular.isPending}
          onCerrar={() => setAccion(null)}
          onConfirmar={confirmarAccion}
        />
      )}

      <ModalEditarMaterial
        material={editando}
        pendiente={editar.isPending}
        error={errorEdicion}
        onCerrar={() => setEditando(null)}
        onGuardar={(cambios) => editando && editar.mutate({ id: editando.idMaterialOp, cambios })}
      />

      <ImportPreviewDialog<FilaPreviewMaterial>
        open={importOpen}
        onOpenChange={setImportOpen}
        titulo="Importar explosión de materiales"
        getKey={(f) => f.fila}
        getError={(f) => f.error}
        onDescargarPlantilla={() => costeoMaterialesApi.plantilla()}
        onArchivoElegido={async (archivo) => {
          setNombreArchivo(archivo.name)
          return (await costeoMaterialesApi.previewImportar(archivo)).filas
        }}
        onAplicar={async (filas) => {
          const r = await costeoMaterialesApi.aplicarImportar(filas, nombreArchivo)
          void refrescar()
          const partes = [`${r.cargados} ítem(s) cargado(s)`]
          if (r.entregados) partes.push(`${r.entregados} ya entregado(s) (traían salida)`)
          if (r.sinLigar) partes.push(`${r.sinLigar} con OP sin cargar`)
          if (r.sinCosto) partes.push(`${r.sinCosto} sin costo`)
          return partes.join(' · ')
        }}
        columnas={[
          { key: 'fila', header: 'Fila', render: (f) => f.fila },
          { key: 'fecha', header: 'Fecha', render: (f) => (f.fecha ? fechaCorta(f.fecha) : f.fechaTexto || '—') },
          { key: 'plan', header: 'Planificador', render: (f) => f.ordenPlanificacion ?? (f.planificadorTexto || '—') },
          {
            key: 'op',
            header: 'OP',
            render: (f) => (
              <span>
                {f.codigoOp ?? f.opTexto}
                {f.codigoOp && !f.opLigada && <span className="text-muted-foreground block text-[10px]">aún no cargada</span>}
              </span>
            ),
          },
          {
            key: 'insumo',
            header: 'Insumo',
            className: 'max-w-xs whitespace-normal break-words',
            render: (f) => (f.insumoCodigo ? `${f.insumoCodigo} · ${f.insumoDescripcion}` : f.codigoTexto || '—'),
          },
          { key: 'cant', header: 'Cantidad', render: (f) => (f.cantidad != null ? `${num(f.cantidad)} ${f.unidad ?? ''}` : f.cantidadTexto || '—') },
          { key: 'salida', header: 'Salida', render: (f) => f.salidaSac ?? '—' },
          {
            key: 'estado',
            header: 'Estado',
            className: 'max-w-xs whitespace-normal break-words',
            render: (f) =>
              f.error ? (
                <span className="text-destructive">{f.error}</span>
              ) : (
                <span>
                  {f.nace === 'ENTREGADO' ? 'Nace entregado' : 'Nace pendiente'}
                  {f.costoUnitario == null && <span className="text-muted-foreground block text-[10px]">sin costo</span>}
                  {f.aviso && <span className="block text-[10px] text-amber-700 dark:text-amber-400">{f.aviso}</span>}
                </span>
              ),
          },
        ]}
      />
    </div>
  )
}

function TablaItems({
  items,
  verDinero,
  seleccion,
  onAlternar,
  onEditar,
  onHistorial,
}: {
  items: Material[]
  verDinero: boolean
  seleccion: Set<number>
  onAlternar: (id: number, marcar: boolean) => void
  onEditar: (m: Material) => void
  onHistorial: (m: Material) => void
}) {
  return (
    <>
      {/* Escritorio: tabla. */}
      <div className="hidden overflow-x-auto xl:block">
        <Table className="min-w-[1100px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>OP</TableHead>
              <TableHead>Insumo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Planificador</TableHead>
              <TableHead>Cargado</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead>Salida</TableHead>
              <TableHead>Estado</TableHead>
              {verDinero && <TableHead className="text-right">Costo</TableHead>}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((m) => (
              <TableRow key={m.idMaterialOp} className={m.anulado ? 'opacity-60' : undefined}>
                <TableCell>
                  {!m.anulado && (
                    <Checkbox
                      checked={seleccion.has(m.idMaterialOp)}
                      onCheckedChange={(v) => onAlternar(m.idMaterialOp, v === true)}
                      aria-label={`Seleccionar ${m.insumoCodigo} de ${m.codigoOp}`}
                    />
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {m.codigoOp}
                  {m.cliente && <div className="text-muted-foreground font-sans text-[10px]">{m.cliente}</div>}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal break-words">
                  <span className="font-mono text-xs">{m.insumoCodigo}</span> {m.insumoDescripcion}
                  {m.comentario && <div className="text-muted-foreground text-[11px]">{m.comentario}</div>}
                  {m.anulado && m.motivoAnulacion && <div className="text-destructive text-[11px]">Anulado: {m.motivoAnulacion}</div>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {num(m.cantidad)} <span className="text-muted-foreground text-xs">{m.unidad}</span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="font-mono">{m.ordenPlanificacion}</span>
                  <div className="text-muted-foreground">{fechaCorta(m.fechaPlanificador)}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {diaDeCarga(m.fechaCarga)}
                  <div className="text-muted-foreground">{m.creadoPor}</div>
                </TableCell>
                <TableCell className="text-xs">{m.fechaEntrega ? fechaCorta(m.fechaEntrega) : '—'}</TableCell>
                <TableCell className="font-mono text-xs">{m.salidaSac ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <EstadoBadge m={m} />
                    <Marcas m={m} />
                  </div>
                </TableCell>
                {verDinero && (
                  <TableCell className="text-right tabular-nums">{m.costoTotal != null ? dinero(m.costoTotal) : '—'}</TableCell>
                )}
                <TableCell className="whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => onHistorial(m)}>
                    Historial
                  </Button>
                  {m.puedeModificar && (
                    <Button size="sm" variant="ghost" onClick={() => onEditar(m)}>
                      Editar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Tablet y teléfono: tarjetas. */}
      <div className="grid gap-2 md:grid-cols-2 xl:hidden">
        {items.map((m) => (
          <div key={m.idMaterialOp} className={'rounded-lg border p-3 ' + (m.anulado ? 'opacity-60' : '')}>
            <div className="flex items-start gap-2">
              {!m.anulado && (
                <Checkbox
                  className="mt-0.5"
                  checked={seleccion.has(m.idMaterialOp)}
                  onCheckedChange={(v) => onAlternar(m.idMaterialOp, v === true)}
                  aria-label={`Seleccionar ${m.insumoCodigo} de ${m.codigoOp}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs">{m.codigoOp}</div>
                <div className="text-sm break-words">
                  <span className="font-mono text-xs">{m.insumoCodigo}</span> {m.insumoDescripcion}
                </div>
              </div>
              <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
                {num(m.cantidad)} <span className="text-muted-foreground text-xs font-normal">{m.unidad}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <EstadoBadge m={m} />
              <Marcas m={m} />
            </div>
            <div className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
              <span>Planificador: {fechaCorta(m.fechaPlanificador)}</span>
              <span>Cargado: {diaDeCarga(m.fechaCarga)}</span>
              <span>Entrega: {m.fechaEntrega ? fechaCorta(m.fechaEntrega) : '—'}</span>
              <span>Salida: {m.salidaSac ?? '—'}</span>
              <span className="col-span-2">Cargó: {m.creadoPor}</span>
              {verDinero && m.costoTotal != null && <span>Costo: {dinero(m.costoTotal)}</span>}
            </div>
            {m.comentario && <p className="text-muted-foreground mt-1 text-[11px] break-words">{m.comentario}</p>}
            {m.anulado && m.motivoAnulacion && <p className="text-destructive mt-1 text-[11px]">Anulado: {m.motivoAnulacion}</p>}
            <div className="mt-2 text-right">
              <Button size="sm" variant="ghost" onClick={() => onHistorial(m)}>
                Historial
              </Button>
              {m.puedeModificar && (
                <Button size="sm" variant="ghost" onClick={() => onEditar(m)}>
                  Editar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
