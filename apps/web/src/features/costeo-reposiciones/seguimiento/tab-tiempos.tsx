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
import { fechaHoraGT } from '../flujo'

const h = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('es-GT', { maximumFractionDigits: 1 })} h`)
const hoyGT = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - 6 * 3600_000 - n * 86400_000).toISOString().slice(0, 10)

const ACCION: Record<string, string> = {
  VALIDAR: 'Validar',
  DEVOLVER: 'Devolver',
  IMPRIMIR: 'Imprimir',
  DESPACHAR: 'Despachar',
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
          Tiempo corrido (incluye noches y fines de semana).{isFetching && ' Actualizando…'}
        </span>
      </div>

      {m && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Esperando ahora</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                {m.enCursoPorPaso.map((p) => (
                  <div key={p.paso} className="rounded-md border p-2">
                    <div className="text-[11px] leading-tight text-ink-faint">{p.nombre}</div>
                    <div className="text-xl font-semibold tabular-nums text-ink">{p.cantidad}</div>
                    {p.cantidad > 0 && (
                      <div className="text-[11px] text-ink-faint">
                        más vieja {h(p.masAntiguaHoras)}
                        {p.mas48 > 0 ? (
                          <div className="font-semibold text-red-600 dark:text-red-400">{p.mas48} &gt; {m.horasRojo} h</div>
                        ) : p.mas24 > 0 ? (
                          <div className="font-medium text-amber-600 dark:text-amber-400">{p.mas24} &gt; {m.horasAmarillo} h</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                Ciclo completo (creación → despacho) de lo despachado en el rango: {m.ciclo.cantidad} reposición(es) · promedio{' '}
                {h(m.ciclo.promedioHoras)} · mediana {h(m.ciclo.medianaHoras)} · p90 {h(m.ciclo.p90Horas)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
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
              <CardHeader>
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
              <CardHeader>
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
            <CardHeader>
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
