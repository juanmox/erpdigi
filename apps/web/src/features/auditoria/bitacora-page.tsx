import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { auditoriaApi } from './api'
import type { ConsultaBitacora } from './types'

const TODOS = '__todos__'

/** Hace N días, en `aaaa-mm-dd` de Guatemala. */
function haceDias(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })
}

/** El instante completo, en hora de Guatemala. */
function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * Lo más cercano a "desde qué computadora": del user agent se saca el sistema
 * y el navegador, que es lo único que de verdad le dice algo a quien lee. La
 * cadena completa queda en el `title` por si hace falta.
 */
function equipo(ua: string | null): string | null {
  if (!ua) return null
  const so = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad/i.test(ua)
        ? 'iOS'
        : /Mac OS/i.test(ua)
          ? 'Mac'
          : /Linux/i.test(ua)
            ? 'Linux'
            : null
  const nav = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua)
      ? 'Chrome'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : null
  return [so, nav].filter(Boolean).join(' · ') || null
}

export function BitacoraPage() {
  // Arranca con los últimos 7 días: es el corte que responde "qué pasó esta
  // semana" sin traer meses de historia que nadie va a leer.
  const [desde, setDesde] = useState(haceDias(7))
  const [hasta, setHasta] = useState(haceDias(0))
  const [usuario, setUsuario] = useState(TODOS)
  const [entidad, setEntidad] = useState(TODOS)
  const [accion, setAccion] = useState(TODOS)
  const [pagina, setPagina] = useState(1)

  const consulta: ConsultaBitacora = {
    desde,
    hasta,
    usuario: usuario === TODOS ? undefined : usuario,
    entidad: entidad === TODOS ? undefined : entidad,
    accion: accion === TODOS ? undefined : accion,
    pagina,
  }

  const { data: filtros } = useQuery({
    queryKey: ['auditoria', 'filtros'],
    queryFn: () => auditoriaApi.filtros(),
  })
  const { data, isFetching, error } = useQuery({
    queryKey: ['auditoria', consulta],
    queryFn: () => auditoriaApi.listar(consulta),
  })

  // Cualquier cambio de filtro vuelve a la primera página: quedarse en la 7 de
  // un resultado que ahora tiene 2 mostraría una lista vacía sin motivo.
  function cambiar(fn: () => void) {
    fn()
    setPagina(1)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-xl font-semibold">Bitácora</h1>
        <p className="text-muted-foreground text-sm">
          Qué hizo cada usuario, cuándo y desde dónde.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
        <div>
          <Label className="mb-1 block text-xs">Desde</Label>
          <Input
            type="date"
            value={desde}
            onChange={(e) => cambiar(() => setDesde(e.target.value))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Hasta</Label>
          <Input
            type="date"
            value={hasta}
            onChange={(e) => cambiar(() => setHasta(e.target.value))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Usuario</Label>
          <Select value={usuario} onValueChange={(v) => cambiar(() => setUsuario(v))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {filtros?.usuarios.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Qué</Label>
          <Select value={entidad} onValueChange={(v) => cambiar(() => setEntidad(v))}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todo</SelectItem>
              {filtros?.entidades.map((e) => (
                <SelectItem key={e.entidad} value={e.entidad}>
                  {e.etiqueta} ({e.n})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Acción</Label>
          <Select value={accion} onValueChange={(v) => cambiar(() => setAccion(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              <SelectItem value="CREATE">Creó</SelectItem>
              <SelectItem value="UPDATE">Modificó</SelectItem>
              <SelectItem value="DELETE">Eliminó</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            cambiar(() => {
              setDesde(haceDias(7))
              setHasta(haceDias(0))
              setUsuario(TODOS)
              setEntidad(TODOS)
              setAccion(TODOS)
            })
          }
        >
          Limpiar
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof ApiError ? error.message : 'No se pudo cargar la bitácora'}
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <p className="text-ink-faint text-xs">
          {data.total.toLocaleString('es-GT')} acción(es){' '}
          {isFetching && <span className="ml-1">· actualizando…</span>}
        </p>
      )}

      <ol className="space-y-1.5">
        {data?.entradas.map((e) => (
          <li
            key={e.idAuditoria}
            className="rounded-md border border-border px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <strong className="text-ink">{e.usuario ?? 'Alguien'}</strong>
              <span>{e.texto}</span>
              {e.usuarioBorrado && (
                <Badge variant="secondary" className="text-[10px]">
                  usuario borrado
                </Badge>
              )}
            </div>
            {e.detalle && (
              <p className="text-ink-muted mt-0.5 text-xs break-words">{e.detalle}</p>
            )}
            <p className="text-ink-faint mt-0.5 text-[11px]">
              {fechaHora(e.fecha)}
              {e.ip && <> · desde {e.ip}</>}
              {equipo(e.userAgent) && (
                <span title={e.userAgent ?? undefined}> · {equipo(e.userAgent)}</span>
              )}
            </p>
          </li>
        ))}
        {data?.entradas.length === 0 && (
          <li className="text-muted-foreground rounded-md border border-border p-6 text-center text-sm">
            No hay acciones registradas con esos filtros.
          </li>
        )}
      </ol>

      {data && data.paginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-ink-faint text-xs">
            Página {data.pagina} de {data.paginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= data.paginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  )
}
