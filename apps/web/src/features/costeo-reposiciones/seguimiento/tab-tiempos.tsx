import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { avisarError } from '@/lib/avisos'
import { cn } from '@/lib/utils'
import { costeoReposicionesApi } from '../api'
import { clasePastillaSemaforo, fechaHoraGT, minutosTexto } from '../flujo'
import type { ColorSemaforo } from '../types'

const h = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('es-GT', { maximumFractionDigits: 1 })} h`)
const min = (v: number | null) => (v == null ? '—' : minutosTexto(v))

/** Cuántas reposiciones hay de un color, como pastilla (nada si es 0). */
function Cuenta({ n, color }: { n: number; color: ColorSemaforo }) {
  if (n === 0) return <span className="text-ink-faint">0</span>
  return <span className={`inline-block min-w-6 rounded-full border px-1.5 text-center text-xs font-semibold tabular-nums ${clasePastillaSemaforo(color)}`}>{n}</span>
}
const hoyGT = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - 6 * 3600_000 - n * 86400_000).toISOString().slice(0, 10)

const ACCION: Record<string, string> = {
  VALIDAR: 'Validar',
  DEVOLVER: 'Devolver',
  IMPRIMIR: 'Imprimir',
  PREPARAR: 'Dejar lista',
  DESPACHAR: 'Entrega (espera del solicitante)',
  CORREGIR: 'Corregir',
}

/**
 * Métricas de tiempo del flujo (tiempo corrido, decisión del usuario): cuánto
 * tarda cada paso y cada validador, dónde se devuelve más, y qué está esperando
 * ahora con semáforo.
 */
export function TabTiempos() {
  const [desde, setDesde] = useState(haceDias(30))
  const [hasta, setHasta] = useState(hoyGT())
  const [aplicado, setAplicado] = useState({ desde, hasta })
  const { data: m, isFetching } = useQuery({
    queryKey: ['costeo-reposiciones', 'metricas', aplicado],
    queryFn: () => costeoReposicionesApi.metricas(aplicado.desde || undefined, aplicado.hasta || undefined),
  })

  async function exportar() {
    try {
      await costeoReposicionesApi.exportarMetricas(aplicado.desde || undefined, aplicado.hasta || undefined)
    } catch (e) {
      avisarError(e instanceof ApiError ? e.message : 'No se pudo exportar')
    }
  }

  const actuar = m?.porPaso.filter((p) => p.accion !== 'DEVOLVER') ?? []
  const devoluciones = m?.porPaso.filter((p) => p.accion === 'DEVOLVER') ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <div>
          <Label className="mb-1 block text-xs">Desde</Label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Hasta</Label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <Button onClick={() => setAplicado({ desde, hasta })}>Ver</Button>
        <Button variant="outline" onClick={exportar} disabled={!m}>
          Exportar a Excel
        </Button>
        <span className="text-xs text-ink-faint">
          Los pasos se miden en tiempo corrido; el semáforo cuenta desde la hora del corte.{isFetching && ' Actualizando…'}
        </span>
      </div>

      {m && (
        <>
          <Card>
            <CardHeader seccion>
              <CardTitle className="text-base">Esperando ahora</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
                {m.enCursoPorPaso.map((p) => (
                  <div key={p.paso} className="rounded-md border p-2">
                    <div className="text-[11px] leading-tight text-ink-faint">{p.nombre}</div>
                    <div className="text-xl font-semibold tabular-nums text-ink">{p.cantidad}</div>
                    {p.cantidad > 0 && (
                      <div className="space-y-0.5 text-[11px] text-ink-faint">
                        <div>más vieja {h(p.masAntiguaHoras)}</div>
                        <div className="flex flex-wrap items-center gap-1">
                          <Cuenta n={p.verdes} color="verde" />
                          <Cuenta n={p.amarillas} color="amarillo" />
                          <Cuenta n={p.rojas} color="rojo" />
                          {p.enRecoleccion > 0 && <span title="Todavía esperan su corte">⏳ {p.enRecoleccion}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                Semáforo del proceso, desde la hora del corte: verde menos de {m.semaforo.minutosVerde} min · amarillo hasta{' '}
                {m.semaforo.minutosAmarillo} min · rojo de ahí en adelante. Lo que aún espera su corte (⏳) no tiene color. En
                &quot;Por recoger&quot; el rojo pasa de {m.semaforo.minutosRecoger} min y es de quien debe recoger.
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Ciclo completo (creación → entrega) de lo entregado en el rango: {m.ciclo.cantidad} reposición(es) · promedio{' '}
                {h(m.ciclo.promedioHoras)} · mediana {h(m.ciclo.medianaHoras)} · p90 {h(m.ciclo.p90Horas)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader seccion>
              <CardTitle className="text-base">Cumplimiento por corte</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Corte</TableHead>
                    <TableHead className="text-right">Reposiciones</TableHead>
                    <TableHead className="text-center">Verde / amarillo / rojo</TableHead>
                    <TableHead className="text-right">% verde</TableHead>
                    <TableHead className="text-right">Corte → lista (prom. / máx.)</TableHead>
                    <TableHead className="text-right" title="Llegaron al corte sin tener hechas las validaciones de los pasos 2 a 5">
                      Sin validar al corte
                    </TableHead>
                    <TableHead className="text-right" title="Del corte a la autorización (paso 6)">
                      Autorización
                    </TableHead>
                    <TableHead className="text-right" title="De la autorización a que bodega la deja lista">
                      Bodega
                    </TableHead>
                    <TableHead className="text-right" title="De lista a recogida: le toca a quien la pidió">
                      Solicitante
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.porCorte.map((c) => (
                    <TableRow key={c.corteEn}>
                      <TableCell className="text-xs whitespace-nowrap">{fechaHoraGT(c.corteEn)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.total}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Cuenta n={c.verdes} color="verde" />
                          <Cuenta n={c.amarillas} color="amarillo" />
                          <Cuenta n={c.rojas} color="rojo" />
                          {c.enRecoleccion > 0 && <span className="text-xs text-ink-faint">⏳ {c.enRecoleccion}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.pctVerde == null ? '—' : `${c.pctVerde}%`}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums whitespace-nowrap">
                        {min(c.procesoPromedioMin)} / {min(c.procesoMaximoMin)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.sinValidarAlCorte || '—'}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{min(c.autorizacionPromedioMin)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{min(c.bodegaPromedioMin)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{min(c.solicitantePromedioMin)}</TableCell>
                    </TableRow>
                  ))}
                  {m.porCorte.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-ink-faint">
                        Ningún corte en el rango (solo cuentan las que pasan por el flujo con validaciones).
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-ink-faint">
                Autorización, bodega y solicitante son promedios en minutos y reparten el recorrido por responsable: autorizar se
                mide desde la hora del corte, porque antes del corte quien autoriza no tenía por qué actuar.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader seccion>
              <CardTitle className="text-base">Validaciones listas para el corte (pasos 2 a 5)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paso</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead className="text-right">Validaciones</TableHead>
                    <TableHead className="text-right">Después del corte</TableHead>
                    <TableHead className="text-right">% tardías</TableHead>
                    <TableHead className="text-right">Atraso promedio</TableHead>
                    <TableHead className="text-right">Atraso máximo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {m.atrasoAlCorte.map((a) => (
                    <TableRow key={`${a.paso}-${a.usuario}`}>
                      <TableCell className="text-xs">{a.paso}. {a.nombrePaso}</TableCell>
                      <TableCell className="text-xs">{a.usuario}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.tardias}</TableCell>
                      <TableCell className={cn('text-right tabular-nums', a.pctTardias >= 50 && 'font-semibold text-red-600 dark:text-red-400')}>
                        {a.pctTardias}%
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{min(a.atrasoPromedioMin)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{min(a.atrasoMaximoMin)}</TableCell>
                    </TableRow>
                  ))}
                  {m.atrasoAlCorte.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-ink-faint">
                        Sin validaciones en el rango.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-ink-faint">
                Lo que importa de estos pasos es si la validación estaba hecha para la hora del corte, no cuánto tardó en crudo: medir
                horas castigaría a quien recibe lo que se creó de noche.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader seccion>
              <CardTitle className="text-base">Cuánto tarda cada paso</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paso</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Promedio</TableHead>
                    <TableHead className="text-right">Mediana</TableHead>
                    <TableHead className="text-right">P90</TableHead>
                    <TableHead className="text-right">Máximo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...actuar, ...devoluciones].map((p) => (
                    <TableRow key={`${p.paso}-${p.accion}`}>
                      <TableCell>
                        {p.paso}. {p.nombre}
                      </TableCell>
                      <TableCell className={cn(p.accion === 'DEVOLVER' && 'text-amber-700 dark:text-amber-400')}>{ACCION[p.accion] ?? p.accion}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.cantidad}</TableCell>
                      <TableCell className="text-right tabular-nums">{h(p.promedioHoras)}</TableCell>
                      <TableCell className="text-right tabular-nums">{h(p.medianaHoras)}</TableCell>
                      <TableCell className="text-right tabular-nums">{h(p.p90Horas)}</TableCell>
                      <TableCell className="text-right tabular-nums">{h(p.maximoHoras)}</TableCell>
                    </TableRow>
                  ))}
                  {m.porPaso.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-ink-faint">
                        Sin movimientos en el rango.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader seccion>
                <CardTitle className="text-base">Por validador</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paso</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead className="text-right">Validó</TableHead>
                      <TableHead className="text-right">Devolvió</TableHead>
                      <TableHead className="text-right">Promedio</TableHead>
                      <TableHead className="text-right">P90</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.porUsuario.map((u) => (
                      <TableRow key={`${u.paso}-${u.usuario}`}>
                        <TableCell className="text-xs">{u.paso}. {u.nombrePaso}</TableCell>
                        <TableCell className="text-xs">{u.usuario}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.validadas}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.devueltas}</TableCell>
                        <TableCell className="text-right tabular-nums">{h(u.promedioHoras)}</TableCell>
                        <TableCell className="text-right tabular-nums">{h(u.p90Horas)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader seccion>
                <CardTitle className="text-base">Devoluciones por creador</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creador</TableHead>
                      <TableHead className="text-right">Creadas</TableHead>
                      <TableHead className="text-right">Devoluciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.porCreador.map((c) => (
                      <TableRow key={c.usuario}>
                        <TableCell className="text-xs">{c.usuario}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.creadas}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.devueltas}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader seccion>
              <CardTitle className="text-base">Últimas devoluciones</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {m.devoluciones.length === 0 ? (
                <p className="text-sm text-ink-faint">Ninguna en el rango.</p>
              ) : (
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Reposición</TableHead>
                      <TableHead>Paso</TableHead>
                      <TableHead>Devolvió</TableHead>
                      <TableHead>Creador</TableHead>
                      <TableHead>Motivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {m.devoluciones.slice(0, 50).map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs whitespace-nowrap">{fechaHoraGT(d.fecha)}</TableCell>
                        <TableCell className="font-mono text-xs">{d.codigo}</TableCell>
                        <TableCell className="text-xs">{d.nombrePaso}</TableCell>
                        <TableCell className="text-xs">{d.usuario}</TableCell>
                        <TableCell className="text-xs">{d.creador ?? '—'}</TableCell>
                        <TableCell className="max-w-[320px] text-xs whitespace-normal">{d.motivo}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
