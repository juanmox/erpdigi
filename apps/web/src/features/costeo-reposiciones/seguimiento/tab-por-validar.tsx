import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DialogoMotivo } from '@/components/shared/dialogo-motivo'
import { useMarcaEmpresa } from '@/app/marca-empresa'
import { useAuth } from '@/features/auth/auth-context'
import { costeoRollosApi } from '@/features/costeo-rollos/api'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { cn } from '@/lib/utils'
import { costeoReposicionesApi, type FiltrosSeguimiento } from '../api'
import { NOMBRE_PASO, PASOS_VALIDACION, PERMISO_PASO } from '../flujo'
import { imprimirRequisiciones } from '../imprimir'
import type { FallaLote, FilaSeguimiento, ResultadoLote } from '../types'
import { TablaSeguimiento } from './tabla-seguimiento'

type Cola = { clave: string; texto: string; paso?: number; estado: string }

/** Agrupa las fallas de un lote por motivo: se repiten mucho. */
function ResumenFallas({ fallidas, onReintentar }: { fallidas: FallaLote[]; onReintentar?: (ids: number[], idImpresora: number) => void }) {
  const [idImpresora, setIdImpresora] = useState('')
  const { tienePermiso } = useAuth()
  const sinRollo = fallidas.filter((f) => f.sinRollo)
  // El panel de rollos pide `costeo.rollo.ver`: solo se consulta cuando hace
  // falta ofrecer otra impresora, y solo si el usuario puede verlo.
  const { data: panel } = useQuery({
    queryKey: ['costeo-rollos', 'panel'],
    queryFn: () => costeoRollosApi.panel(),
    enabled: !!onReintentar && sinRollo.length > 0 && tienePermiso('costeo.rollo.ver'),
  })
  if (fallidas.length === 0) return null
  const grupos = new Map<string, FallaLote[]>()
  for (const f of fallidas) grupos.set(f.motivo, [...(grupos.get(f.motivo) ?? []), f])
  const conRollo = (panel ?? []).filter((p) => p.montaje)
  return (
    <Alert variant="destructive">
      <AlertDescription className="space-y-2">
        <div className="font-medium">{fallidas.length} no se pudieron procesar:</div>
        <ul className="space-y-1 text-xs">
          {[...grupos].map(([motivo, fs]) => (
            <li key={motivo}>
              <b>{fs.length}×</b> {motivo}{' '}
              <span className="text-ink-faint">({fs.map((f) => f.codigo ?? f.idReposicion).join(', ')})</span>
            </li>
          ))}
        </ul>
        {sinRollo.length > 0 && onReintentar && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-background/60 p-2 text-ink">
            <span className="text-xs">Autorizar las {sinRollo.length} sin rollo con otra impresora:</span>
            <Select value={idImpresora} onValueChange={setIdImpresora}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue placeholder="Impresora con rollo" />
              </SelectTrigger>
              <SelectContent>
                {conRollo.map((p) => (
                  <SelectItem key={p.impresora.idImpresora} value={String(p.impresora.idImpresora)}>
                    {p.impresora.codigo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!idImpresora} onClick={() => onReintentar(sinRollo.map((f) => f.idReposicion), Number(idImpresora))}>
              Autorizar con esta impresora
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function TabPorValidar({ onVer }: { onVer: (f: FilaSeguimiento) => void }) {
  const qc = useQueryClient()
  const marca = useMarcaEmpresa()
  const { tienePermiso, usuario } = useAuth()

  const colas: Cola[] = useMemo(
    () => [
      ...PASOS_VALIDACION.filter((p) => tienePermiso(PERMISO_PASO[p])).map((p) => ({
        clave: `p${p}`,
        texto: `${p}. ${NOMBRE_PASO[p]}`,
        paso: p,
        estado: 'en_validacion',
      })),
      ...(tienePermiso('costeo.reposicion.imprimir_requisicion') ? [{ clave: 'imp', texto: '7. Por imprimir', estado: 'por_imprimir' }] : []),
      ...(tienePermiso('costeo.reposicion.despachar')
        ? [
            { clave: 'desp', texto: '8. En bodega', estado: 'por_despachar' },
            { clave: 'rec', texto: '9. Por recoger', estado: 'por_recoger' },
          ]
        : []),
    ],
    [tienePermiso],
  )
  const [clave, setClave] = useState(colas[0]?.clave ?? '')
  const cola = colas.find((c) => c.clave === clave) ?? colas[0]
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [fallidas, setFallidas] = useState<FallaLote[]>([])
  const [pendiente, setPendiente] = useState(false)
  const [devolviendo, setDevolviendo] = useState(false)
  const [entregando, setEntregando] = useState(false)
  const [talonarios, setTalonarios] = useState<Record<number, string>>({})
  const [recibidos, setRecibidos] = useState<Record<number, string>>({})

  useEffect(() => {
    setSeleccion(new Set())
    setFallidas([])
  }, [clave])

  const filtros: FiltrosSeguimiento = { porValidar: true, estado: cola?.estado, paso: cola?.paso, porPagina: 200, pagina: 1 }
  const { data, isFetching } = useQuery({
    queryKey: ['costeo-reposiciones', 'seguimiento', filtros],
    queryFn: () => costeoReposicionesApi.seguimiento(filtros),
    enabled: !!cola,
    refetchInterval: 60_000,
  })
  const filas = data?.filas ?? []
  // Solo lo que de verdad puede mover: las que creó él (o que ya validó en otro
  // paso) aparecen en la cola pero no se pueden marcar.
  const habilitada = (f: FilaSeguimiento) =>
    cola?.estado === 'por_imprimir'
      ? f.acciones.imprimir
      : cola?.estado === 'por_despachar'
        ? f.acciones.preparar
        : cola?.estado === 'por_recoger'
          ? f.acciones.entregar
          : f.acciones.validar
  const elegibles = filas.filter(habilitada)
  const bloqueadas = filas.filter((f) => !habilitada(f))
  const motivoBloqueo = (f: FilaSeguimiento) =>
    habilitada(f) ? null : (f.acciones.motivoNoValidar ?? 'No la podés mover desde esta cola.')

  const conteo = (c: Cola) => {
    const r = data?.resumen
    if (!r) return null
    if (c.paso) return r.porPaso.find((p) => p.paso === c.paso)?.cantidad ?? 0
    return c.estado === 'por_imprimir' ? r.porImprimir : c.estado === 'por_despachar' ? r.porDespachar : r.porRecoger
  }

  function alternar(ids: number[], marcar: boolean) {
    setSeleccion((prev) => {
      const s = new Set(prev)
      for (const id of ids) if (!marcar) s.delete(id)
      else if (elegibles.some((f) => f.idReposicion === id)) s.add(id)
      return s
    })
  }

  function terminar(res: ResultadoLote, verbo: string) {
    setFallidas(res.fallidas)
    if (res.hechas > 0) avisarExito(`${res.hechas} reposición(es) ${verbo}.`)
    setSeleccion(new Set())
    qc.invalidateQueries({ queryKey: ['costeo-reposiciones'] })
    qc.invalidateQueries({ queryKey: ['costeo-rollos'] })
  }

  async function validar(ids = [...seleccion], idImpresora?: number) {
    if (!cola?.paso) return
    setPendiente(true)
    try {
      terminar(await costeoReposicionesApi.validar(ids, cola.paso, idImpresora), cola.paso === 6 ? 'autorizada(s)' : 'validada(s)')
    } catch (e) {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo validar')
    } finally {
      setPendiente(false)
    }
  }

  async function devolver(motivo: string) {
    if (!cola?.paso) return
    setPendiente(true)
    try {
      terminar(await costeoReposicionesApi.devolver([...seleccion], cola.paso, motivo), 'devuelta(s) a quien la(s) creó')
      setDevolviendo(false)
    } catch (e) {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo devolver')
    } finally {
      setPendiente(false)
    }
  }

  async function imprimir() {
    setPendiente(true)
    try {
      const res = await costeoReposicionesApi.imprimirRequisiciones([...seleccion])
      setFallidas(res.fallidas)
      if (res.reposiciones.length > 0) {
        imprimirRequisiciones(res.reposiciones, usuario?.nombreCompleto ?? '', marca)
        avisarExito(`${res.reposiciones.length} requisición(es) enviadas a imprimir.`)
      }
      setSeleccion(new Set())
      qc.invalidateQueries({ queryKey: ['costeo-reposiciones'] })
    } catch (e) {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo imprimir')
    } finally {
      setPendiente(false)
    }
  }

  // Bodega deja listas las requisiciones: avisa a quien las pidió y a su encargado de área.
  async function preparar() {
    setPendiente(true)
    try {
      terminar(await costeoReposicionesApi.preparar([...seleccion]), 'lista(s) para recoger (ya se avisó a quien las pidió)')
    } catch (e) {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo dejar lista')
    } finally {
      setPendiente(false)
    }
  }

  async function entregar() {
    setPendiente(true)
    try {
      const items = [...seleccion].map((id) => ({
        idReposicion: id,
        numeroTalonario: talonarios[id]?.trim() || undefined,
        recibidoPor: recibidos[id]?.trim() || undefined,
      }))
      terminar(await costeoReposicionesApi.entregar(items), 'entregada(s) al solicitante')
      setEntregando(false)
      setTalonarios({})
      setRecibidos({})
    } catch (e) {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo marcar la entrega')
    } finally {
      setPendiente(false)
    }
  }

  if (colas.length === 0)
    return <p className="rounded-md border p-6 text-center text-sm text-ink-faint">No tenés asignado ningún paso del flujo.</p>

  const sel = seleccion.size
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-md border p-0.5">
        {colas.map((c) => (
          <Button key={c.clave} size="sm" variant={c.clave === cola?.clave ? 'secondary' : 'ghost'} onClick={() => setClave(c.clave)}>
            {c.texto}
            {c.clave === cola?.clave && conteo(c) != null && <span className="ml-1 font-semibold tabular-nums">({conteo(c)})</span>}
          </Button>
        ))}
      </div>

      <p className="text-xs text-ink-faint">
        {cola?.paso === 6
          ? 'Al autorizar se descuenta el papel del rollo montado AHORA en la impresora de cada reposición, y se escribe en los Google Sheets.'
          : cola?.estado === 'por_imprimir'
            ? 'La primera impresión le asigna su número de requisición (RQ) y la deja en bodega. Volver a imprimirla sale como COPIA.'
            : cola?.estado === 'por_despachar'
              ? 'Cuando la requisición esté lista, marcala y se le avisa a quien la pidió y a su encargado de área: desde ahí el tiempo corre a cargo de ellos. Si la persona ya está en bodega, entregala directo.'
              : cola?.estado === 'por_recoger'
                ? 'Ya se avisó. Marcá la entrega cuando el solicitante llegue a recoger; el tiempo que tardó queda a su nombre.'
                : 'Ordenado por corte y, dentro de cada uno, lo más antiguo primero. Validá lo que corresponde o devolvelo a quien lo creó con el motivo.'}
        {bloqueadas.length > 0 && ` · ${bloqueadas.length} no las podés mover vos: aparecen deshabilitadas con el motivo (por ejemplo, las creaste vos).`}
        {isFetching && ' · actualizando…'}
      </p>

      <ResumenFallas fallidas={fallidas} onReintentar={cola?.paso === 6 ? (ids, imp) => validar(ids, imp) : undefined} />

      <div
        className={cn(
          'sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border bg-background p-2',
          sel === 0 && 'text-ink-faint',
        )}
      >
        <span className="text-sm">{sel} seleccionada(s)</span>
        {cola?.paso && (
          <>
            <Button size="sm" disabled={sel === 0 || pendiente} onClick={() => validar()}>
              {pendiente ? 'Aplicando…' : cola.paso === 6 ? `Autorizar (${sel})` : `Validar (${sel})`}
            </Button>
            <Button size="sm" variant="outline" disabled={sel === 0 || pendiente} onClick={() => setDevolviendo(true)}>
              Devolver ({sel})
            </Button>
          </>
        )}
        {cola?.estado === 'por_imprimir' && (
          <Button size="sm" disabled={sel === 0 || pendiente} onClick={imprimir}>
            Imprimir requisiciones ({sel})
          </Button>
        )}
        {cola?.estado === 'por_despachar' && (
          <>
            <Button size="sm" disabled={sel === 0 || pendiente} onClick={preparar}>
              {pendiente ? 'Aplicando…' : `Dejar listas y avisar (${sel})`}
            </Button>
            <Button size="sm" variant="outline" disabled={sel === 0 || pendiente} onClick={() => setEntregando(true)}>
              Entregar directo ({sel})
            </Button>
          </>
        )}
        {cola?.estado === 'por_recoger' && (
          <Button size="sm" disabled={sel === 0 || pendiente} onClick={() => setEntregando(true)}>
            Marcar entregadas ({sel})
          </Button>
        )}
        {sel > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setSeleccion(new Set())}>
            Limpiar selección
          </Button>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-ink-faint">No hay nada pendiente en esta cola.</p>
      ) : (
        <TablaSeguimiento filas={filas} seleccion={seleccion} onAlternar={alternar} onVer={onVer} bloqueo={motivoBloqueo} />
      )}
      {data && data.total > filas.length && (
        <p className="text-xs text-ink-faint">Se muestran las {filas.length} más antiguas de {data.total}.</p>
      )}

      <DialogoMotivo
        abierto={devolviendo}
        titulo={`Devolver ${sel} reposición(es)`}
        descripcion="Vuelven a quien las creó para que las corrija. Al reenviarlas, el flujo empieza otra vez desde el paso 2."
        textoConfirmar="Devolver"
        placeholder="Ej.: las yardas de papel no corresponden a la pieza indicada…"
        pendiente={pendiente}
        onCerrar={() => setDevolviendo(false)}
        onConfirmar={devolver}
      />

      <Dialog open={entregando} onOpenChange={(v) => !v && !pendiente && setEntregando(false)}>
        <DialogContent className="max-h-[85svh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Marcar {sel} como entregada(s)</DialogTitle>
            <DialogDescription>
              Quién recogió y el número del talonario físico, si lo usan (los dos son opcionales).
              {cola?.estado === 'por_despachar' && ' Se dejan listas y entregadas en el mismo momento.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {filas
              .filter((f) => seleccion.has(f.idReposicion))
              .map((f) => (
                <div key={f.idReposicion} className="grid grid-cols-[7.5rem_1fr_7rem] items-center gap-2">
                  <span className="truncate font-mono text-xs" title={f.codigo}>
                    {f.requisicion ? `RQ-${String(f.requisicion.numero).padStart(6, '0')}` : f.codigo}
                  </span>
                  <Input
                    value={recibidos[f.idReposicion] ?? ''}
                    onChange={(e) => setRecibidos((t) => ({ ...t, [f.idReposicion]: e.target.value }))}
                    placeholder="Recibió"
                    maxLength={80}
                    aria-label={`Quién recibió ${f.codigo}`}
                  />
                  <Input
                    value={talonarios[f.idReposicion] ?? ''}
                    onChange={(e) => setTalonarios((t) => ({ ...t, [f.idReposicion]: e.target.value }))}
                    placeholder="Nº talonario"
                    maxLength={30}
                    aria-label={`Talonario de ${f.codigo}`}
                  />
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntregando(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button onClick={entregar} disabled={pendiente}>
              {pendiente ? 'Aplicando…' : 'Confirmar entrega'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
