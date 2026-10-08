import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { rolesApi } from './api'
import type { PermisoCatalogo, Rol } from './types'

/** Se administra desde el seed, que lo reconcilia siempre — ver el servicio. */
const ROL_NO_EDITABLE = 'ADMIN'

const NOMBRE_DOMINIO: Record<string, string> = {
  plataforma: 'Plataforma',
  recetas: 'Recetas',
  costeo: 'Costeo',
}

/**
 * Agrupa los permisos por dominio y recurso a partir del propio código
 * (`costeo.consumo.fecha_manual` → Costeo / consumo). Con 45 permisos una lista
 * plana es ilegible, y el código ya trae la jerarquía.
 */
function agrupar(permisos: PermisoCatalogo[]) {
  const porDominio = new Map<string, Map<string, PermisoCatalogo[]>>()
  for (const p of permisos) {
    const [dominio, recurso = ''] = p.codigo.split('.')
    if (!porDominio.has(dominio)) porDominio.set(dominio, new Map())
    const recursos = porDominio.get(dominio)!
    if (!recursos.has(recurso)) recursos.set(recurso, [])
    recursos.get(recurso)!.push(p)
  }
  return porDominio
}

export function RolesPage() {
  const queryClient = useQueryClient()
  const [idSeleccionado, setIdSeleccionado] = useState<number | null>(null)
  const [marcados, setMarcados] = useState<Set<string> | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState({ codigo: '', nombre: '' })
  // null = no se tocó, así que se muestra lo que diga el rol. Texto y no número
  // porque vacío ("el rol no opina") es distinto de 0 ("nunca cerrar").
  const [minutos, setMinutos] = useState<string | null>(null)

  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.listar() })
  const { data: permisos } = useQuery({ queryKey: ['permisos'], queryFn: () => rolesApi.permisos() })

  const rol = roles?.find((r) => r.idRol === idSeleccionado) ?? null
  const editable = rol !== null && rol.codigo !== ROL_NO_EDITABLE

  // Los marcados arrancan desde el rol y solo se separan cuando el usuario toca
  // algo: así el estado local no pisa un refetch mientras no haya cambios.
  const actuales = useMemo(
    () => new Set((rol?.permisos ?? []).map((rp) => rp.permiso.codigo)),
    [rol],
  )
  const seleccion = marcados ?? actuales
  const sucio =
    marcados !== null &&
    (marcados.size !== actuales.size || [...marcados].some((c) => !actuales.has(c)))

  function elegirRol(r: Rol) {
    setIdSeleccionado(r.idRol)
    setMarcados(null)
    setMinutos(null)
    setMensaje(null)
  }

  function alternar(codigo: string, valor: boolean) {
    const copia = new Set(seleccion)
    if (valor) copia.add(codigo)
    else copia.delete(codigo)
    setMarcados(copia)
  }

  function alternarGrupo(codigos: string[], valor: boolean) {
    const copia = new Set(seleccion)
    for (const c of codigos) {
      if (valor) copia.add(c)
      else copia.delete(c)
    }
    setMarcados(copia)
  }

  const guardar = useMutation({
    mutationFn: () => rolesApi.actualizarPermisos(rol!.idRol, [...seleccion]),
    onSuccess: async (actualizado) => {
      setMarcados(null)
      setMensaje({ tipo: 'ok', texto: `Permisos de "${actualizado.nombre}" guardados.` })
      await queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (e) =>
      setMensaje({
        tipo: 'error',
        texto: e instanceof ApiError ? e.message : 'No se pudieron guardar los permisos',
      }),
  })

  const minutosDelRol = rol?.minutosInactividad == null ? '' : String(rol.minutosInactividad)
  const minutosTexto = minutos ?? minutosDelRol
  const minutosValidos =
    minutosTexto.trim() === '' ||
    (/^\d+$/.test(minutosTexto.trim()) && Number(minutosTexto) <= 1440)
  const minutosSucio = minutos !== null && minutosTexto !== minutosDelRol

  const guardarInactividad = useMutation({
    mutationFn: () =>
      rolesApi.actualizarInactividad(
        rol!.idRol,
        minutosTexto.trim() === '' ? null : Number(minutosTexto),
      ),
    onSuccess: async (actualizado) => {
      setMinutos(null)
      setMensaje({
        tipo: 'ok',
        texto:
          actualizado.minutosInactividad == null
            ? `"${actualizado.nombre}" ya no define un tiempo de inactividad propio.`
            : `Cierre por inactividad de "${actualizado.nombre}": ${actualizado.minutosInactividad} min.`,
      })
      await queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (e) =>
      setMensaje({
        tipo: 'error',
        texto: e instanceof ApiError ? e.message : 'No se pudo guardar el tiempo de inactividad',
      }),
  })

  const crear = useMutation({
    mutationFn: () => rolesApi.crear({ codigo: nuevo.codigo.trim(), nombre: nuevo.nombre.trim() }),
    onSuccess: async (creado) => {
      setCreando(false)
      setNuevo({ codigo: '', nombre: '' })
      await queryClient.invalidateQueries({ queryKey: ['roles'] })
      setIdSeleccionado(creado.idRol)
      setMarcados(null)
      setMensaje({ tipo: 'ok', texto: `Rol "${creado.nombre}" creado. Marcá sus permisos y guardá.` })
    },
    onError: (e) =>
      setMensaje({
        tipo: 'error',
        texto: e instanceof ApiError ? e.message : 'No se pudo crear el rol',
      }),
  })

  const texto = busqueda.trim().toLowerCase()
  const visibles = (permisos ?? []).filter(
    (p) =>
      !texto ||
      p.codigo.toLowerCase().includes(texto) ||
      (p.descripcion ?? '').toLowerCase().includes(texto),
  )
  const grupos = agrupar(visibles)


  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Roles y permisos</h1>
          <p className="text-muted-foreground text-sm">
            Qué puede hacer cada rol. Los usuarios reciben permisos por el rol que se les asigna en
            Usuarios.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreando((v) => !v)}>
          {creando ? 'Cancelar' : '+ Nuevo rol'}
        </Button>
      </div>

      {creando && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
          <div>
            <Label className="mb-1 block text-xs">Código</Label>
            <Input
              value={nuevo.codigo}
              onChange={(e) => setNuevo((n) => ({ ...n, codigo: e.target.value.toUpperCase() }))}
              placeholder="SUPERVISOR_TURNO"
              className="w-56"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Nombre visible</Label>
            <Input
              value={nuevo.nombre}
              onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))}
              placeholder="Supervisor de turno"
              className="w-64"
            />
          </div>
          <Button
            size="sm"
            disabled={!nuevo.codigo.trim() || !nuevo.nombre.trim() || crear.isPending}
            onClick={() => crear.mutate()}
          >
            Crear
          </Button>
        </div>
      )}

      {mensaje && (
        <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{mensaje.texto}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <ul className="flex flex-col gap-1 self-start">
          {roles?.map((r) => (
            <li key={r.idRol}>
              <button
                type="button"
                onClick={() => elegirRol(r)}
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-left transition-colors',
                  r.idRol === idSeleccionado
                    ? 'border-accent-brand bg-accent-brand-soft'
                    : 'border-border hover:bg-black/[0.03] dark:hover:bg-white/[0.04]',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{r.nombre}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">{r.permisos.length}</span>
                </div>
                <div className="text-muted-foreground truncate font-mono text-[11px]">{r.codigo}</div>
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0">
          {!rol && (
            <p className="text-muted-foreground p-4 text-sm">Elegí un rol de la izquierda.</p>
          )}

          {rol && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{rol.nombre}</h2>
                {rol.personalizado && <Badge variant="secondary">Personalizado</Badge>}
                {!editable && <Badge variant="secondary">No editable</Badge>}
                <span className="text-muted-foreground text-xs">
                  {seleccion.size} de {permisos?.length ?? 0} permisos
                </span>
              </div>

              {!editable && (
                <Alert>
                  <AlertDescription>
                    El rol Administrador no se edita: por definición tiene todos los permisos, y es
                    el camino de recuperación si otro rol queda mal configurado.
                  </AlertDescription>
                </Alert>
              )}

              {editable && rol.personalizado && (
                <p className="text-muted-foreground text-xs">
                  Este rol ya se administra desde acá, así que las actualizaciones automáticas de
                  cada versión no le agregan permisos nuevos. Si aparece uno, hay que marcarlo a
                  mano.
                </p>
              )}

              {/* El tiempo de inactividad SÍ se edita en ADMIN: a diferencia de
                  los permisos, no es algo que el seed garantice. */}
              <div className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label className="mb-1 block text-xs">Cierre por inactividad (minutos)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1440}
                      value={minutosTexto}
                      onChange={(e) => setMinutos(e.target.value)}
                      placeholder="Sin definir"
                      className="w-40"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={!minutosSucio || !minutosValidos || guardarInactividad.isPending}
                    onClick={() => guardarInactividad.mutate()}
                  >
                    Guardar tiempo
                  </Button>
                  {minutosSucio && (
                    <Button size="sm" variant="ghost" onClick={() => setMinutos(null)}>
                      Descartar
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground mt-2 text-[11px]">
                  En blanco, este rol no opina y sus usuarios usan 15 minutos (o lo que diga otro de
                  sus roles). <strong>0</strong> = nunca cerrar por inactividad. Con varios roles
                  gana el tiempo <strong>más corto</strong>, y lo que se fije en el usuario manda
                  sobre cualquier rol.
                  {!minutosValidos && (
                    <span className="text-destructive block">
                      Tiene que ser un número entero de 0 a 1440.
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar permiso (ej. fecha, rollo, cotizaciones…)"
                  className="max-w-sm"
                />
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={!editable || !sucio || guardar.isPending}
                  onClick={() => guardar.mutate()}
                >
                  Guardar cambios
                </Button>
                {sucio && (
                  <Button size="sm" variant="ghost" onClick={() => setMarcados(null)}>
                    Descartar
                  </Button>
                )}
              </div>

              {[...grupos.entries()].map(([dominio, recursos]) => (
                <div key={dominio} className="rounded-md border border-border">
                  <div className="border-b border-border bg-black/[0.02] px-3 py-1.5 text-[11px] font-bold tracking-[0.06em] uppercase dark:bg-white/[0.03]">
                    {NOMBRE_DOMINIO[dominio] ?? dominio}
                  </div>
                  {[...recursos.entries()].map(([recurso, lista]) => {
                    const codigos = lista.map((p) => p.codigo)
                    const todos = codigos.every((c) => seleccion.has(c))
                    return (
                      <div key={recurso} className="border-b border-border/60 p-3 last:border-b-0">
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="text-xs font-semibold text-ink-muted">{recurso}</span>
                          {editable && codigos.length > 1 && (
                            <button
                              type="button"
                              onClick={() => alternarGrupo(codigos, !todos)}
                              className="text-accent-brand text-[11px] underline-offset-2 hover:underline"
                            >
                              {todos ? 'quitar todos' : 'marcar todos'}
                            </button>
                          )}
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {lista.map((p) => (
                            <label
                              key={p.codigo}
                              className={cn(
                                'flex items-start gap-2 rounded px-1 py-1',
                                editable ? 'cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.04]' : 'opacity-70',
                              )}
                            >
                              <Checkbox
                                className="mt-0.5"
                                disabled={!editable}
                                checked={seleccion.has(p.codigo)}
                                onCheckedChange={(v) => alternar(p.codigo, v === true)}
                              />
                              <span className="min-w-0">
                                <span className="block text-[13px] leading-tight">
                                  {p.descripcion ?? p.codigo}
                                </span>
                                <span className="text-muted-foreground block font-mono text-[10.5px] break-all">
                                  {p.codigo}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
