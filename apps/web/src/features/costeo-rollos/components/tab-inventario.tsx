import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useMarcaEmpresa } from '@/app/marca-empresa'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GrupoColapsable } from '@/components/shared/grupo-colapsable'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { costeoRollosApi } from '../api'
import { imprimirInventarioRollos } from '../imprimir'
import type { RolloInventario } from '../types'

const yd = (n: number | null) =>
  n == null
    ? '—'
    : n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const q = (n: number | null) =>
  n == null
    ? '—'
    : 'Q ' + n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const ETIQUETA_ESTADO: Record<string, string> = {
  EN_BODEGA: 'En bodega',
  MONTADO: 'Montado',
  AGOTADO: 'Agotado',
  DESCARTADO: 'Descartado',
  CONSUMIDO_FUERA: 'Consumido fuera del ERP',
}

/** Un número grande con su etiqueta: la franja de arriba del inventario. */
function Dato({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string
  valor: string
  pie?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-ink-faint text-[11px] uppercase tracking-wide">{etiqueta}</div>
      <div className="text-ink mt-0.5 text-lg font-semibold">{valor}</div>
      {pie && <div className="text-ink-faint mt-0.5 text-[11px]">{pie}</div>}
    </div>
  )
}

export function TabInventario() {
  const marca = useMarcaEmpresa()
  const { usuario } = useAuth()
  const [texto, setTexto] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['costeo-rollos', 'inventario'],
    queryFn: () => costeoRollosApi.inventario(),
  })

  // Filtra sobre lo ya traído: el inventario entero son cientos de filas, no
  // miles, y buscar en el navegador evita una consulta por tecla.
  const enBodegaFiltrado = useMemo(() => {
    if (!data) return []
    const t = texto.trim().toLowerCase()
    if (!t) return data.enBodega
    return data.enBodega.filter(
      (r) =>
        r.codigo.toLowerCase().includes(t) ||
        r.numeroFactura.toLowerCase().includes(t) ||
        r.tipoPapel.toLowerCase().includes(t) ||
        (r.ubicacion ?? '').toLowerCase().includes(t),
    )
  }, [data, texto])

  const porTipo = useMemo(() => {
    const m = new Map<string, RolloInventario[]>()
    for (const r of enBodegaFiltrado) {
      const xs = m.get(r.tipoPapel) ?? []
      xs.push(r)
      m.set(r.tipoPapel, xs)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
  }, [enBodegaFiltrado])

  if (isLoading) return <p className="text-ink-faint text-sm">Cargando inventario…</p>
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error instanceof ApiError ? error.message : 'No se pudo cargar el inventario'}
        </AlertDescription>
      </Alert>
    )
  if (!data) return null

  const { resumen: r, senales: s } = data
  const enBodega = r.porEstado.find((e) => e.estado === 'EN_BODEGA')?.rollos ?? 0
  const nombre = usuario?.nombreCompleto || usuario?.username || 'ERP'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-sm font-semibold">Inventario de rollos</h2>
          <p className="text-ink-faint text-xs">
            Para el conteo físico de bodega y para revisar que lo registrado cuadre con lo real.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => imprimirInventarioRollos(data, marca, nombre, true)}
          >
            Imprimir hoja de conteo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => imprimirInventarioRollos(data, marca, nombre, false)}
          >
            Imprimir informe completo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Dato
          etiqueta="Rollos en bodega"
          valor={String(enBodega)}
          pie={`${r.rollosTotales} en total, contando los ya usados`}
        />
        <Dato
          etiqueta="Yardas disponibles"
          valor={yd(r.yardasEnBodega)}
          pie={
            r.rollosSinYardas > 0
              ? `${r.rollosSinYardas} rollo(s) sin yardas declaradas no suman acá`
              : 'todos los rollos traen sus yardas'
          }
        />
        <Dato
          etiqueta="En impresoras"
          valor={yd(r.yardasEnImpresoras)}
          pie={`${data.enImpresoras.length} rollo(s) montado(s)`}
        />
        {data.incluyeCostos ? (
          <Dato
            etiqueta="Valor en bodega"
            valor={q(r.valorEnBodega)}
            pie={
              (r.rollosSinCosto ?? 0) > 0
                ? `es un piso: ${r.rollosSinCosto} rollo(s) sin costo declarado`
                : undefined
            }
          />
        ) : (
          <Dato
            etiqueta="Consumidas"
            valor={yd(r.yardasConsumidas)}
            pie="impresión + enguiamiento + en blanco + reposiciones"
          />
        )}
      </div>

      {/* El balance es lo que vuelve auditable al resto: lo comprado tiene que
          repartirse entre lo consumido y lo que todavía existe. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance de papel</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 border-b border-border pb-1">
              <dt className="text-ink-muted">Compradas (declaradas al ingresar)</dt>
              <dd className="font-medium">{yd(r.yardasCompradas)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-border pb-1">
              <dt className="text-ink-muted">Consumidas y registradas</dt>
              <dd className="font-medium">{yd(r.yardasConsumidas)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-border pb-1">
              <dt className="text-ink-muted">Disponibles en bodega</dt>
              <dd className="font-medium">{yd(r.yardasEnBodega)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-border pb-1">
              <dt className="text-ink-muted">Montadas en impresoras</dt>
              <dd className="font-medium">{yd(r.yardasEnImpresoras)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.porEstado
              .filter((e) => e.rollos > 0)
              .map((e) => (
                <Badge key={e.estado} variant="secondary" className="text-[11px]">
                  {ETIQUETA_ESTADO[e.estado] ?? e.estado}: {e.rollos}
                </Badge>
              ))}
          </div>
          <p className="text-ink-faint mt-2 text-xs">
            Las yardas de Agotado, Descartado y Consumido fuera del ERP son saldo en libros de papel
            que ya no está en bodega — no son papel disponible.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por ubicación</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-muted">
                <th className="py-1.5 pr-2">Ubicación</th>
                <th className="py-1.5 pr-2 text-right">Rollos</th>
                <th className="py-1.5 text-right">Yardas restantes</th>
              </tr>
            </thead>
            <tbody>
              {data.porUbicacion.map((u) => (
                <tr key={u.nombre} className="border-b border-border/60">
                  <td className="py-1.5 pr-2">
                    {u.nombre === 'Sin clasificar' ? (
                      <span className="text-accent-warm-strong">{u.nombre}</span>
                    ) : (
                      u.nombre
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right">{u.rollos}</td>
                  <td className="py-1.5 text-right">{yd(u.yardas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-ink-faint mt-2 text-xs">
            Sobre todos los rollos, no solo bodega — un rollo montado también está en algún lado. Lo
            "sin clasificar" se asigna desde la pestaña "Corregir ingreso".
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por tipo de papel</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-muted">
                <th className="py-1.5 pr-2">Tipo de papel</th>
                <th className="py-1.5 pr-2 text-right">Rollos</th>
                <th className="py-1.5 pr-2 text-right">Yd. en bodega</th>
                <th className="py-1.5 pr-2 text-right">Montados</th>
                {data.incluyeCostos && <th className="py-1.5 text-right">Valor</th>}
              </tr>
            </thead>
            <tbody>
              {data.porTipoPapel.map((t) => (
                <tr key={t.codigo} className="border-b border-border/60">
                  <td className="py-1.5 pr-2">{t.nombre}</td>
                  <td className="py-1.5 pr-2 text-right">{t.rollosEnBodega}</td>
                  <td className="py-1.5 pr-2 text-right">{yd(t.yardasEnBodega)}</td>
                  <td className="py-1.5 pr-2 text-right">{t.rollosMontados}</td>
                  {data.incluyeCostos && (
                    <td className="py-1.5 text-right">{q(t.valorEnBodega)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-ink-faint mt-2 text-xs">
            Es la respuesta a &ldquo;¿de qué papel me estoy quedando?&rdquo;.
          </p>
        </CardContent>
      </Card>

      {/* Señales: lo que conviene revisar, no errores. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Rollos empezados en bodega ({s.parciales.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {s.parciales.length ? (
              <>
                <ul className="space-y-1 text-sm">
                  {s.parciales.map((p) => (
                    <li key={p.idRolloPapel} className="flex justify-between gap-2">
                      <span className="font-mono text-xs">{p.codigo}</span>
                      <span className="text-ink-muted text-xs">
                        usadas {yd(p.consumidas)} · queda {yd(p.restante)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-ink-faint mt-2 text-xs">
                  Hay que gastarlos primero. En el conteo son los más fáciles de pasar por alto:
                  físicamente no parecen un rollo nuevo.
                </p>
              </>
            ) : (
              <p className="text-ink-faint text-sm">
                Ninguno: todos los rollos en bodega están sin empezar.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Papel usado que nadie registró ({s.agotadosConSaldo.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {s.agotadosConSaldo.length ? (
              <>
                <ul className="space-y-1 text-sm">
                  {s.agotadosConSaldo.map((a) => (
                    <li key={a.idRolloPapel} className="flex justify-between gap-2">
                      <span className="font-mono text-xs">{a.codigo}</span>
                      <span className="text-xs text-accent-warm-strong">
                        {yd(a.restante)} yd sin registrar
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-ink-faint mt-2 text-xs">
                  Se declararon agotados pero les quedan yardas en libros. No es desperdicio: es
                  papel que se usó sin registrar su consumo, casi siempre órdenes impresas que no se
                  enviaron desde Impresión de OPs.
                </p>
              </>
            ) : (
              <p className="text-ink-faint text-sm">
                Ninguno: todo el papel agotado tiene su consumo registrado.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Antigüedad del papel en bodega</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {s.antiguedad.map((a) => (
                <li key={a.etiqueta} className="flex justify-between gap-2">
                  <span className="text-ink-muted">{a.etiqueta}</span>
                  <span className="font-medium">{a.rollos}</span>
                </li>
              ))}
            </ul>
            <p className="text-ink-faint mt-2 text-xs">
              Contada desde la fecha de la factura, no desde que se cargó al sistema.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Montajes abiertos hace mucho ({s.montajesLargos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {s.montajesLargos.length ? (
              <>
                <ul className="space-y-1 text-sm">
                  {s.montajesLargos.map((m) => (
                    <li key={m.codigo} className="flex justify-between gap-2">
                      <span className="font-mono text-xs">
                        {m.impresora} · {m.codigo}
                      </span>
                      <span className="text-ink-muted text-xs">
                        {m.diasMontado} días · {m.montadoPor ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-ink-faint mt-2 text-xs">
                  O el rollo se terminó y nadie lo desmontó, o el registro quedó colgado. Lo segundo
                  importa más: un montaje abierto sigue recibiendo consumo.
                </p>
              </>
            ) : (
              <p className="text-ink-faint text-sm">Ninguno.</p>
            )}
            {s.consumidoFuera.rollos > 0 && (
              <p className="text-ink-faint mt-3 border-t border-border pt-2 text-xs">
                Aparte: <strong>{s.consumidoFuera.rollos} rollo(s)</strong> ·{' '}
                {yd(s.consumidoFuera.yardas)} yd se consumieron <strong>fuera del ERP</strong>, antes
                de usar este sistema. Su consumo no está acá, así que no se cuentan como papel
                perdido.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Rollos en bodega ({enBodegaFiltrado.length})</CardTitle>
          <div>
            <Label className="mb-1 block text-xs">Buscar rollo, factura o tipo</Label>
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="777-10-3, TEXTPRINT…"
              className="w-56"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {porTipo.length === 0 && (
            <p className="text-ink-faint text-sm">Ningún rollo coincide con la búsqueda.</p>
          )}
          {porTipo.map(([tipo, rollos]) => (
            <GrupoColapsable
              // La key incluye si hay búsqueda: `defaultAbierto` solo se lee al
              // montar, así que sin esto filtrar dejaría los resultados
              // escondidos detrás de un clic.
              key={`${tipo}-${texto ? 'filtrado' : 'todo'}`}
              defaultAbierto={!!texto || porTipo.length <= 2}
              titulo={
                <span>
                  {tipo}{' '}
                  <span className="text-ink-faint font-normal normal-case">
                    · {rollos.length} rollo(s) ·{' '}
                    {yd(rollos.reduce((t, x) => t + (x.restante ?? 0), 0))} yd
                  </span>
                </span>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-ink-muted">
                      <th className="py-1 pr-2">Rollo</th>
                      <th className="py-1 pr-2">Factura</th>
                      <th className="py-1 pr-2">Ubicación</th>
                      <th className="py-1 pr-2 text-right">Días</th>
                      <th className="py-1 pr-2 text-right">Restante</th>
                      {data.incluyeCostos && <th className="py-1 text-right">Valor</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rollos.map((x) => (
                      <tr key={x.idRolloPapel} className="border-b border-border/60">
                        <td className="py-1 pr-2 font-mono text-xs">{x.codigo}</td>
                        <td className="py-1 pr-2 text-xs">{x.numeroFactura}</td>
                        <td className="py-1 pr-2 text-xs">
                          {x.ubicacion ?? (
                            <span className="text-accent-warm-strong">Sin clasificar</span>
                          )}
                        </td>
                        <td className="py-1 pr-2 text-right text-xs">{x.diasDesdeFactura}</td>
                        <td className="py-1 pr-2 text-right">
                          {yd(x.restante)}
                          {x.consumidas > 0.01 && (
                            <span className="text-accent-warm-strong ml-1 text-[11px]">
                              empezado
                            </span>
                          )}
                        </td>
                        {data.incluyeCostos && (
                          <td className="py-1 text-right text-xs">{q(x.valor)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GrupoColapsable>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
