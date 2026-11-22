import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { avisarError } from '@/lib/avisos'
import { cn } from '@/lib/utils'
import { costeoReposicionesApi, type FiltrosSeguimiento } from '../api'
import type { FilaSeguimiento } from '../types'
import { TablaSeguimiento } from './tabla-seguimiento'

const TODOS = '__todos__'

const ESTADOS: [string, string][] = [
  ['en_curso', 'En curso (todo lo pendiente)'],
  ['en_validacion', 'En validación'],
  ['devueltas', 'Devueltas'],
  ['por_imprimir', 'Por imprimir'],
  ['por_despachar', 'Por despachar'],
  ['despachadas', 'Despachadas'],
  ['historicas', 'Históricas (antes del flujo)'],
  ['anuladas', 'Anuladas'],
  ['todas', 'Todas'],
]

interface Borrador {
  estado: string
  paso: string
  codigoOp: string
  idCreador: string
  idDefecto: string
  idDepartamento: string
  tipo: string
  producto: string
  texto: string
  campoFecha: 'reposicion' | 'creacion'
  desde: string
  hasta: string
  soloMias: boolean
}

export function TabReposiciones({
  onVer,
  acciones,
  estadoInicial,
}: {
  onVer: (f: FilaSeguimiento) => void
  acciones: (f: FilaSeguimiento) => React.ReactNode
  estadoInicial?: string
}) {
  const { tienePermiso } = useAuth()
  const creaReposiciones = tienePermiso('costeo.reposicion.crear')
  const inicial = (): Borrador => ({
    estado: estadoInicial ?? 'en_curso',
    paso: '',
    codigoOp: '',
    idCreador: '',
    idDefecto: '',
    idDepartamento: '',
    tipo: '',
    producto: '',
    texto: '',
    campoFecha: 'reposicion',
    desde: '',
    hasta: '',
    // Quien carga reposiciones abre viendo las suyas (decisión del usuario); puede
    // quitar el filtro y ver las del equipo.
    soloMias: creaReposiciones,
  })
  const [b, setB] = useState<Borrador>(inicial)
  const [aplicados, setAplicados] = useState<Borrador>(b)
  const [pagina, setPagina] = useState(1)

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((p) => ({ ...p, [k]: v }))

  const filtros: FiltrosSeguimiento = {
    estado: aplicados.estado,
    paso: aplicados.paso ? Number(aplicados.paso) : undefined,
    codigoOp: aplicados.codigoOp || undefined,
    idCreador: aplicados.idCreador ? Number(aplicados.idCreador) : undefined,
    idDefecto: aplicados.idDefecto ? Number(aplicados.idDefecto) : undefined,
    idDepartamento: aplicados.idDepartamento ? Number(aplicados.idDepartamento) : undefined,
    tipo: aplicados.tipo || undefined,
    producto: aplicados.producto || undefined,
    texto: aplicados.texto || undefined,
    campoFecha: aplicados.campoFecha,
    desde: aplicados.desde || undefined,
    hasta: aplicados.hasta || undefined,
    soloMias: aplicados.soloMias,
    pagina,
    porPagina: 50,
  }

  const { data, isFetching, error } = useQuery({
    queryKey: ['costeo-reposiciones', 'seguimiento', filtros],
    queryFn: () => costeoReposicionesApi.seguimiento(filtros),
    placeholderData: keepPreviousData,
  })
  const { data: defectos } = useQuery({ queryKey: ['costeo-reposiciones', 'defectos'], queryFn: () => costeoReposicionesApi.defectos() })
  const { data: departamentos } = useQuery({
    queryKey: ['costeo-reposiciones', 'departamentos'],
    queryFn: () => costeoReposicionesApi.departamentos(),
  })

  function ver() {
    setAplicados(b)
    setPagina(1)
  }
  function limpiar() {
    const x = { ...inicial(), soloMias: false }
    setB(x)
    setAplicados(x)
    setPagina(1)
  }
  /** Un chip del resumen aplica ese estado/paso de inmediato. */
  function filtrarRapido(estado: string, paso = '') {
    const x = { ...b, estado, paso }
    setB(x)
    setAplicados(x)
    setPagina(1)
  }

  const r = data?.resumen
  const chips: { texto: string; n: number; estado: string; paso?: string; activo: boolean }[] = r
    ? [
        ...r.porPaso.map((p) => ({
          texto: `${p.paso}. ${p.nombre}`,
          n: p.cantidad,
          estado: 'en_validacion',
          paso: String(p.paso),
          activo: aplicados.estado === 'en_validacion' && aplicados.paso === String(p.paso),
        })),
        { texto: 'Devueltas', n: r.devueltas, estado: 'devueltas', activo: aplicados.estado === 'devueltas' },
        { texto: 'Por imprimir', n: r.porImprimir, estado: 'por_imprimir', activo: aplicados.estado === 'por_imprimir' },
        { texto: 'Por despachar', n: r.porDespachar, estado: 'por_despachar', activo: aplicados.estado === 'por_despachar' },
      ]
    : []

  async function exportar() {
    try {
      await costeoReposicionesApi.exportarSeguimiento(filtros)
    } catch (e) {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo exportar')
    }
  }

  return (
    <div className="space-y-3">
      {r && r.devueltasMias > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Tenés <b>{r.devueltasMias}</b> reposición(es) devuelta(s) esperando tu corrección.
            </span>
            <Button size="sm" variant="outline" onClick={() => filtrarRapido('devueltas')}>
              Ver mis devueltas
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.texto}
            type="button"
            onClick={() => filtrarRapido(c.estado, c.paso)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              c.activo ? 'border-accent-brand bg-accent-brand-soft text-accent-brand-strong' : 'border-border text-ink-muted hover:bg-muted',
            )}
          >
            {c.texto} <span className="font-semibold tabular-nums">{c.n}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-md border p-3 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <Label className="mb-1 block text-xs">Estado</Label>
          <Select value={b.estado} onValueChange={(v) => setB((p) => ({ ...p, estado: v, paso: '' }))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS.map(([v, t]) => (
                <SelectItem key={v} value={v}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">OP</Label>
          <Input value={b.codigoOp} onChange={(e) => set('codigoOp', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ver()} placeholder="26OP031488" className="font-mono" />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Producto</Label>
          <Input value={b.producto} onChange={(e) => set('producto', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ver()} placeholder="Código" />
        </div>
        <div className="col-span-2 lg:col-span-1">
          <Label className="mb-1 block text-xs">Texto (comentario, cliente, Nº RQ o talonario)</Label>
          <Input value={b.texto} onChange={(e) => set('texto', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ver()} />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Creada por</Label>
          <Select value={b.idCreador || TODOS} onValueChange={(v) => set('idCreador', v === TODOS ? '' : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Cualquiera</SelectItem>
              {r?.creadores.map((c) => (
                <SelectItem key={c.idUsuario} value={String(c.idUsuario)}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Defecto</Label>
          <Select value={b.idDefecto || TODOS} onValueChange={(v) => set('idDefecto', v === TODOS ? '' : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Cualquiera</SelectItem>
              {defectos?.map((d) => (
                <SelectItem key={d.idDefecto} value={String(d.idDefecto)}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Departamento</Label>
          <Select value={b.idDepartamento || TODOS} onValueChange={(v) => set('idDepartamento', v === TODOS ? '' : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Cualquiera</SelectItem>
              {departamentos?.map((d) => (
                <SelectItem key={d.idDepartamento} value={String(d.idDepartamento)}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Tipo</Label>
          <Select value={b.tipo || TODOS} onValueChange={(v) => set('tipo', v === TODOS ? '' : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Cualquiera</SelectItem>
              <SelectItem value="REIMPRESION">Reimpresión</SelectItem>
              <SelectItem value="MATERIALES">Materiales</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Fechas por</Label>
          <Select value={b.campoFecha} onValueChange={(v) => set('campoFecha', v as Borrador['campoFecha'])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reposicion">Fecha de la reposición</SelectItem>
              <SelectItem value="creacion">Fecha de registro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Desde</Label>
          <Input type="date" value={b.desde} onChange={(e) => set('desde', e.target.value)} />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Hasta</Label>
          <Input type="date" value={b.hasta} onChange={(e) => set('hasta', e.target.value)} />
        </div>
        <div className="col-span-2 flex flex-wrap items-end justify-between gap-2 lg:col-span-4">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={b.soloMias} onCheckedChange={(v) => set('soloMias', v === true)} />
            Solo las que registré yo
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={limpiar}>
              Limpiar
            </Button>
            <Button onClick={ver}>Buscar</Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error instanceof ApiError ? error.message : 'Error al cargar'}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
        <span>
          {data ? `${data.total.toLocaleString('es-GT')} reposición(es)` : '—'}
          {isFetching && ' · actualizando…'}
        </span>
        <div className="flex items-center gap-2">
          {creaReposiciones && (
            <Button asChild size="sm" variant="outline">
              <Link to="/costeo/reposiciones">+ Nueva reposición</Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportar} disabled={!data || data.total === 0}>
            Exportar a Excel
          </Button>
        </div>
      </div>

      {data && data.filas.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-ink-faint">Ninguna reposición coincide con los filtros.</p>
      ) : (
        <TablaSeguimiento filas={data?.filas ?? []} onVer={onVer} acciones={acciones} />
      )}

      {data && data.paginas > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-ink-faint">
            Página {data.pagina} de {data.paginas}
          </span>
          <Button variant="outline" size="sm" disabled={pagina >= data.paginas} onClick={() => setPagina((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  )
}
