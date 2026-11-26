import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { cn } from '@/lib/utils'
import { costeoReposicionesApi } from '../api'
import type { CorteConfig, SemaforoConfig } from '../types'
import { CLAVE_CONFIGURACION } from '../use-modo-sin-validacion'

const DIAS = [
  { iso: 1, corto: 'Lun', largo: 'lunes' },
  { iso: 2, corto: 'Mar', largo: 'martes' },
  { iso: 3, corto: 'Mié', largo: 'miércoles' },
  { iso: 4, corto: 'Jue', largo: 'jueves' },
  { iso: 5, corto: 'Vie', largo: 'viernes' },
  { iso: 6, corto: 'Sáb', largo: 'sábado' },
  { iso: 7, corto: 'Dom', largo: 'domingo' },
]

/** Mismas reglas que el servidor: el texto es solo para avisar antes de guardar. */
function problemaCortes(cortes: CorteConfig[]): string | null {
  if (cortes.length === 0) return 'Tiene que quedar al menos un corte.'
  const horas = new Set<string>()
  for (const c of cortes) {
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(c.hora)) return 'Falta la hora de algún corte.'
    if (horas.has(c.hora)) return `El corte de las ${c.hora} está repetido.`
    horas.add(c.hora)
    if (c.dias.length === 0) return `El corte de las ${c.hora} tiene que atender al menos un día.`
  }
  return null
}

function problemaSemaforo(s: SemaforoConfig): string | null {
  if (![s.minutosVerde, s.minutosAmarillo, s.minutosRecoger].every(Number.isInteger)) return 'Los minutos tienen que ser números enteros.'
  if (s.minutosVerde < 1) return 'El verde tiene que durar al menos 1 minuto.'
  if (s.minutosVerde >= s.minutosAmarillo) return 'El límite del verde tiene que ser menor que el del amarillo.'
  if (s.minutosAmarillo > 1440) return 'El amarillo no puede pasar de 1,440 minutos (24 h).'
  if (s.minutosRecoger < 1 || s.minutosRecoger > 1440) return 'La tolerancia para recoger va entre 1 y 1,440 minutos.'
  return null
}

const ordenar = (cortes: CorteConfig[]) => [...cortes].sort((a, b) => a.hora.localeCompare(b.hora))

/**
 * Cortes de requisiciones y minutos del semáforo. Solo lo ve quien tiene
 * `costeo.reposicion.configurar`. Los cambios de horarios aplican a las reposiciones
 * que se creen de ahí en adelante (las ya creadas conservan su corte); los minutos del
 * semáforo cambian los colores al instante, también de lo anterior, porque no se guardan.
 */
export function ConfigurarCortes() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const { data } = useQuery({
    queryKey: CLAVE_CONFIGURACION,
    queryFn: () => costeoReposicionesApi.configuracion(),
    staleTime: 30_000,
    enabled: abierto,
  })
  const [cortes, setCortes] = useState<CorteConfig[]>([])
  const [semaforo, setSemaforo] = useState<SemaforoConfig>({ minutosVerde: 45, minutosAmarillo: 60, minutosRecoger: 15 })

  // Al abrir (o al llegar la configuración) se parte de lo guardado.
  useEffect(() => {
    if (abierto && data) {
      setCortes(ordenar(data.cortes))
      setSemaforo(data.semaforo)
    }
  }, [abierto, data])

  const guardarCortes = useMutation({
    mutationFn: () => costeoReposicionesApi.guardarCortes(ordenar(cortes)),
    onSuccess: () => {
      avisarExito('Cortes guardados. Aplican a las reposiciones que se registren de ahora en adelante.')
      qc.invalidateQueries({ queryKey: ['costeo-reposiciones'] })
    },
    onError: (e) => avisarError(e instanceof ApiError ? e.message : 'No se pudieron guardar los cortes'),
  })
  const guardarSemaforo = useMutation({
    mutationFn: () => costeoReposicionesApi.guardarSemaforo(semaforo),
    onSuccess: () => {
      avisarExito('Semáforo guardado: los colores ya usan estos minutos.')
      qc.invalidateQueries({ queryKey: ['costeo-reposiciones'] })
    },
    onError: (e) => avisarError(e instanceof ApiError ? e.message : 'No se pudo guardar el semáforo'),
  })

  if (!tienePermiso('costeo.reposicion.configurar')) return null

  const errCortes = problemaCortes(cortes)
  const errSemaforo = problemaSemaforo(semaforo)
  const cambiarCorte = (i: number, parte: Partial<CorteConfig>) =>
    setCortes((cs) => cs.map((c, k) => (k === i ? { ...c, ...parte } : c)))
  const alternarDia = (i: number, iso: number) =>
    setCortes((cs) =>
      cs.map((c, k) =>
        k !== i ? c : { ...c, dias: c.dias.includes(iso) ? c.dias.filter((d) => d !== iso) : [...c.dias, iso].sort() },
      ),
    )
  const numero = (v: string) => (v.trim() === '' ? Number.NaN : Number(v))

  return (
    <>
      <Button variant="outline" size="sm" className="mb-4" onClick={() => setAbierto(true)}>
        Configurar cortes y semáforo
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cortes y semáforo de reposiciones</DialogTitle>
            <DialogDescription>
              Las requisiciones se trabajan por cortes. El semáforo mide desde la hora del corte hasta que bodega deja la
              requisición lista.
            </DialogDescription>
          </DialogHeader>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">Horarios de corte</h3>
              <p className="text-xs text-ink-faint">
                Hora de Guatemala. Lo que se registre se asigna al primer corte posterior; lo registrado fuera de horario pasa al
                siguiente día que ese corte atienda. Lo ya registrado conserva su corte.
              </p>
            </div>
            <div className="space-y-2">
              {cortes.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                  <Input
                    type="time"
                    value={c.hora}
                    onChange={(e) => cambiarCorte(i, { hora: e.target.value })}
                    className="w-28"
                    aria-label={`Hora del corte ${i + 1}`}
                  />
                  <div className="flex flex-wrap gap-1" role="group" aria-label={`Días del corte de las ${c.hora}`}>
                    {DIAS.map((d) => {
                      const on = c.dias.includes(d.iso)
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          aria-pressed={on}
                          title={d.largo}
                          onClick={() => alternarDia(i, d.iso)}
                          className={cn(
                            'h-8 min-w-10 rounded-md border px-2 text-xs font-medium transition-colors',
                            on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-ink-faint hover:bg-muted',
                          )}
                        >
                          {d.corto}
                        </button>
                      )
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={cortes.length <= 1}
                    onClick={() => setCortes((cs) => cs.filter((_, k) => k !== i))}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCortes((cs) => [...cs, { hora: '', dias: [1, 2, 3, 4, 5] }])}
              >
                + Agregar corte
              </Button>
              <Button type="button" size="sm" disabled={!!errCortes || guardarCortes.isPending} onClick={() => guardarCortes.mutate()}>
                {guardarCortes.isPending ? 'Guardando…' : 'Guardar cortes'}
              </Button>
              {errCortes && <span className="text-xs text-destructive">{errCortes}</span>}
            </div>
          </section>

          <section className="mt-2 space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Semáforo, en minutos desde la hora del corte</h3>
              <p className="text-xs text-ink-faint">
                Cuenta hasta que bodega marca la requisición como lista. Antes del corte no tiene color: esperar el corte es lo
                esperado.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="mb-1 block text-xs">Verde hasta (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={Number.isNaN(semaforo.minutosVerde) ? '' : semaforo.minutosVerde}
                  onChange={(e) => setSemaforo((s) => ({ ...s, minutosVerde: numero(e.target.value) }))}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Amarillo hasta (min)</Label>
                <Input
                  type="number"
                  min={2}
                  max={1440}
                  value={Number.isNaN(semaforo.minutosAmarillo) ? '' : semaforo.minutosAmarillo}
                  onChange={(e) => setSemaforo((s) => ({ ...s, minutosAmarillo: numero(e.target.value) }))}
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Tolerancia para recoger (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={Number.isNaN(semaforo.minutosRecoger) ? '' : semaforo.minutosRecoger}
                  onChange={(e) => setSemaforo((s) => ({ ...s, minutosRecoger: numero(e.target.value) }))}
                />
              </div>
            </div>
            {!errSemaforo && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
                  Verde 0–{semaforo.minutosVerde} min
                </span>
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                  Amarillo {semaforo.minutosVerde}–{semaforo.minutosAmarillo} min
                </span>
                <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-400">
                  Rojo desde {semaforo.minutosAmarillo} min
                </span>
                <span className="text-ink-faint">· el solicitante tiene {semaforo.minutosRecoger} min para recoger</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={!!errSemaforo || guardarSemaforo.isPending} onClick={() => guardarSemaforo.mutate()}>
                {guardarSemaforo.isPending ? 'Guardando…' : 'Guardar semáforo'}
              </Button>
              {errSemaforo && <span className="text-xs text-destructive">{errSemaforo}</span>}
            </div>
          </section>
        </DialogContent>
      </Dialog>
    </>
  )
}
