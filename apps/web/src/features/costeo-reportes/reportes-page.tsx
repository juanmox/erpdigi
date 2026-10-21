import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { resumirMateriales } from '@/lib/materiales'
import { useMarcaEmpresa } from '@/app/marca-empresa'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { normalizarCodigoCosteo } from '@/lib/codigos-costeo'
import { costeoReportesApi } from './api'
import { imprimirReporteConsumo } from './imprimir'
import type { FiltrosConsumo } from './types'

const TODOS = '__todos__'

/**
 * Cuántas filas se dibujan por tabla.
 *
 * La API es rápida (1.5 s para las 43,833 filas de septiembre + octubre); lo
 * lento es el navegador dibujándolas, a ~0.7 ms cada una: un mes tardaba 30
 * segundos en aparecer. Con la carga del histórico eso solo iba a empeorar.
 *
 * El tope es el mismo criterio que ya usa la tabla de Órdenes —mostrar un
 * primer tramo y DECIR cuántas quedaron fuera—, y acá es seguro porque **los
 * totales se calculan en el servidor** (`data.totales`) y no sumando lo que se
 * ve: topar la vista no los cambia. El conjunto completo sale por el Excel, que
 * se arma en el servidor y aguanta la ventana entera en ~10 s.
 */
const TOPE_FILAS = 200

/** "(N registro(s))", y si se topó, cuántos se ven y dónde están todos. */
function ConteoFilas({ total }: { total: number }) {
  return (
    <span className="text-muted-foreground text-sm font-normal">
      ({total.toLocaleString('es-GT')} registro(s)
      {total > TOPE_FILAS && (
        <> · se muestran los primeros {TOPE_FILAS}; el Excel los trae todos</>
      )}
      )
    </span>
  )
}

const yd = (n: number) =>
  n.toLocaleString('es-GT', { minimumFractionDigits: 4, maximumFractionDigits: 4 })

/** Un instante real (cuándo se imprimió), mostrado en hora de Guatemala. */
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' })

/**
 * Un día calendario que el usuario eligió (`yyyy-mm-dd`), no un instante: se
 * reordena tal cual. Pasarlo por `new Date()` lo leería como medianoche UTC y
 * lo mostraría un día antes — el 1 de enero salía como 31/12.
 */
const dia = (d: string) => d.split('-').reverse().join('/')

/** Primer y último día del mes en curso, en formato `yyyy-mm-dd`. */
function mesActual() {
  const hoy = new Date()
  const p = (d: Date) => d.toISOString().slice(0, 10)
  return {
    desde: p(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: p(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
  }
}

/**
 * Consolidado de consumo por orden de producción.
 *
 * Reúne todo el papel que una OP se llevó del rollo —impresión, enguiamiento,
 * papel en blanco y reposiciones— que desde 2026-09-30 son los cuatro conceptos
 * que se descuentan. La tela va en su propia columna y NO suma al total de
 * papel: es otro material y no sale del rollo.
 *
 * Arranca con el mes en curso porque el uso previsto es cerrar un período.
 */
export function ReportesPage() {
  const marca = useMarcaEmpresa()
  const { tienePermiso } = useAuth()
  const [filtros, setFiltros] = useState<FiltrosConsumo>(mesActual())
  const [aplicados, setAplicados] = useState<FiltrosConsumo>(mesActual())
  const [descargando, setDescargando] = useState(false)
  const [errorExport, setErrorExport] = useState<string | null>(null)
  // Texto libre — se normaliza (atajo de correlativo corto) recién al
  // aplicar, igual que el buscador de OP de Reposiciones/Impresión de OPs.
  const [ofsTexto, setOfsTexto] = useState('')

  function aplicar() {
    const ofs = ofsTexto
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => normalizarCodigoCosteo(c, 'OF'))
      .join(',')
    setAplicados({ ...filtros, ofs: ofs || undefined })
  }

  const { data, isFetching, error } = useQuery({
    queryKey: ['costeo-reportes', 'consumo', aplicados],
    queryFn: () => costeoReportesApi.consumo(aplicados),
  })

  const hayDatos = (data?.resumen.length ?? 0) > 0

  async function exportarExcel() {
    setDescargando(true)
    setErrorExport(null)
    try {
      await costeoReportesApi.consumoExcel(aplicados)
    } catch (e) {
      setErrorExport(e instanceof ApiError ? e.message : 'No se pudo generar el Excel')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-ink">Consumo por orden de producción</h1>
        {tienePermiso('costeo.of.ver') && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/costeo/facturacion">Órdenes de Facturación</Link>
          </Button>
        )}
      </div>

      {/* Los filtros se aplican al presionar "Ver": con fechas, recargar en cada
          tecla dispara consultas contra rangos a medio escribir. */}
      <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="desde" className="mb-1 block text-xs">Desde (fecha de impresión)</Label>
          <Input
            id="desde"
            type="date"
            value={filtros.desde ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value || undefined }))}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="hasta" className="mb-1 block text-xs">Hasta (fecha de impresión)</Label>
          <Input
            id="hasta"
            type="date"
            value={filtros.hasta ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value || undefined }))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Cliente</Label>
          <Select
            value={filtros.idCliente || TODOS}
            onValueChange={(v) =>
              setFiltros((f) => ({ ...f, idCliente: v === TODOS ? undefined : v }))
            }
          >
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {data?.opciones.clientes.map((c) => (
                <SelectItem key={c.idCliente} value={String(c.idCliente)}>{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Impresora</Label>
          <Select
            value={filtros.idImpresora || TODOS}
            onValueChange={(v) =>
              setFiltros((f) => ({ ...f, idImpresora: v === TODOS ? undefined : v }))
            }
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas</SelectItem>
              {data?.opciones.impresoras.map((i) => (
                <SelectItem key={i.idImpresora} value={String(i.idImpresora)}>{i.codigo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Solo aparece si el rango tiene alguno: con un solo subcliente en
            todo el sistema, un selector siempre visible sería ruido. */}
        {data && data.opciones.subclientes.length > 0 && (
          <div>
            <Label className="mb-1 block text-xs">Subcliente</Label>
            <Select
              value={filtros.idSubcliente || TODOS}
              onValueChange={(v) =>
                setFiltros((f) => ({ ...f, idSubcliente: v === TODOS ? undefined : v }))
              }
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {data.opciones.subclientes.map((sc) => (
                  <SelectItem key={sc.idSubcliente} value={String(sc.idSubcliente)}>
                    {sc.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Filtros por OF/factura: el rango de fecha de impresión de arriba deja
          de ser obligatorio en cuanto se pone alguno de estos — costear una OF
          completa exige TODO su consumo, aunque se haya impreso meses antes. */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="mb-1 block text-xs">OF (una o varias, separadas por coma)</Label>
          <Input
            placeholder="159, 26OF000200…"
            value={ofsTexto}
            onChange={(e) => setOfsTexto(e.target.value)}
            className="w-56 font-mono"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">No. de factura</Label>
          <Input
            value={filtros.numeroFactura ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, numeroFactura: e.target.value || undefined }))}
            className="w-32"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Fecha OF desde</Label>
          <Input
            type="date"
            value={filtros.fechaOfDesde ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, fechaOfDesde: e.target.value || undefined }))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Fecha OF hasta</Label>
          <Input
            type="date"
            value={filtros.fechaOfHasta ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, fechaOfHasta: e.target.value || undefined }))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Fecha factura desde</Label>
          <Input
            type="date"
            value={filtros.fechaFacturaDesde ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, fechaFacturaDesde: e.target.value || undefined }))}
            className="w-40"
          />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Fecha factura hasta</Label>
          <Input
            type="date"
            value={filtros.fechaFacturaHasta ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, fechaFacturaHasta: e.target.value || undefined }))}
            className="w-40"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={aplicar} disabled={isFetching}>
          {isFetching ? 'Cargando…' : 'Ver'}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" disabled={!hayDatos || descargando} onClick={exportarExcel}>
            {descargando ? 'Generando…' : 'Excel'}
          </Button>
          <Button
            variant="outline"
            disabled={!hayDatos}
            onClick={() => data && imprimirReporteConsumo(data, marca)}
          >
            PDF
          </Button>
        </div>
      </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof ApiError ? error.message : 'No se pudo cargar el reporte'}
          </AlertDescription>
        </Alert>
      )}
      {errorExport && (
        <Alert variant="destructive"><AlertDescription>{errorExport}</AlertDescription></Alert>
      )}

      {/* Con el filtro de subcliente puesto, el total de reposiciones queda
          corto en exactamente esto: una reposición se registra contra la ORDEN
          y no contra una prenda, así que en una orden que mezcla no hay forma
          de saber de qué subcliente fue. Se dice en vez de atribuirla de más. */}
      {data?.reposicionesNoAtribuibles && (
        <Alert>
          <AlertDescription>
            {data.reposicionesNoAtribuibles.cantidad} reposición(es) quedaron fuera de este
            total ({yd(data.reposicionesNoAtribuibles.papelYd)} yd de papel y{' '}
            {yd(data.reposicionesNoAtribuibles.telaYd)} de tela): son de órdenes que mezclan
            este subcliente con prendas directas del mismo cliente, y una reposición se
            registra contra la orden, no contra la prenda.
          </AlertDescription>
        </Alert>
      )}

      {data && !hayDatos && !isFetching && (
        <p className="text-muted-foreground rounded-md border border-border p-4 text-center text-sm">
          No hay consumo registrado
          {data.filtros.desde && data.filtros.hasta
            ? ` entre ${dia(data.filtros.desde)} y ${dia(data.filtros.hasta)}`
            : ''}
          {data.filtros.idCliente ||
          data.filtros.idImpresora ||
          data.filtros.idSubcliente ||
          data.filtros.ofs?.length ||
          data.filtros.numeroFactura
            ? ' con esos filtros'
            : ''}
          .
        </p>
      )}

      {hayDatos && data && (
        <>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">
              Resumen por orden <ConteoFilas total={data.resumen.length} />
            </h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>OP</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>OF</TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead className="text-right">Impresión</TableHead>
                    <TableHead className="text-right">Enguiamiento</TableHead>
                    <TableHead className="text-right">En blanco</TableHead>
                    <TableHead className="text-right">Reposiciones</TableHead>
                    <TableHead className="text-right">Total papel</TableHead>
                    {/* Separada del total a propósito: la tela no sale del rollo. */}
                    <TableHead className="text-right">Tela</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.resumen.slice(0, TOPE_FILAS).map((r) => (
                    <TableRow key={r.codigo}>
                      <TableCell className="font-mono">{r.codigo}</TableCell>
                      <TableCell className="break-words whitespace-normal">{r.cliente ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{r.of ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{r.numeroFactura ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.impresionYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.enguiamientoYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.enBlancoYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.reposicionYd)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{yd(r.totalPapelYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.telaYd)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-black/[0.04] dark:bg-white/[0.05]">
                    <TableCell colSpan={4} className="font-semibold">TOTAL</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{yd(data.totales.impresionYd)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{yd(data.totales.enguiamientoYd)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{yd(data.totales.enBlancoYd)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{yd(data.totales.reposicionYd)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{yd(data.totales.totalPapelYd)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{yd(data.totales.telaYd)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">
              Resumen por OF <ConteoFilas total={data.resumenPorOf.length} />
            </h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>OF</TableHead>
                    <TableHead>Fecha OF</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Factura</TableHead>
                    <TableHead>Fecha factura</TableHead>
                    <TableHead className="text-right">OP</TableHead>
                    <TableHead className="text-right">Total papel</TableHead>
                    <TableHead className="text-right">Tela</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.resumenPorOf.map((r) => (
                    <TableRow key={r.of}>
                      <TableCell className="font-mono">{r.of}</TableCell>
                      <TableCell>{r.fechaOf ? dia(r.fechaOf) : '—'}</TableCell>
                      <TableCell className="break-words whitespace-normal">{r.cliente ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{r.numeroFactura ?? '—'}</TableCell>
                      <TableCell>{r.fechaFactura ? dia(r.fechaFactura) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.cantidadOps}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{yd(r.totalPapelYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.telaYd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">
              Detalle de impresión{' '}
              <ConteoFilas total={data.detalleImpresion.length} />
            </h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table className="min-w-[1000px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>OP</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Subcliente</TableHead>
                    <TableHead>Talla</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead>Impresora</TableHead>
                    <TableHead className="text-right">Consumo</TableHead>
                    <TableHead className="text-right">Enguiam.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.detalleImpresion.slice(0, TOPE_FILAS).map((x, i) => (
                    <TableRow key={i}>
                      <TableCell>{fecha(x.fecha)}</TableCell>
                      <TableCell className="font-mono text-xs">{x.orden}</TableCell>
                      <TableCell className="font-mono text-xs break-all whitespace-normal">{x.codigoLine ?? '—'}</TableCell>
                      <TableCell className="break-words whitespace-normal">{x.producto ?? '—'}</TableCell>
                      <TableCell className="break-words whitespace-normal">{x.subcliente ?? '—'}</TableCell>
                      <TableCell>{x.talla ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{x.cantidad ?? '—'}</TableCell>
                      <TableCell>{x.impresora}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(x.consumoYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(x.enguiamientoYd)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{yd(x.totalYd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">
              Detalle de reposiciones{' '}
              <ConteoFilas total={data.detalleReposiciones.length} />
            </h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>OP</TableHead>
                    <TableHead>No. repo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Defecto</TableHead>
                    <TableHead>Impresora</TableHead>
                    <TableHead className="text-right">Yd papel</TableHead>
                    <TableHead>Tela</TableHead>
                    <TableHead className="text-right">Yd tela</TableHead>
                    {/* Los materiales van en su columna y fuera de todo total:
                        no salen del rollo y cada uno trae su propia unidad. */}
                    <TableHead>Materiales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.detalleReposiciones.slice(0, TOPE_FILAS).map((x, i) => (
                    <TableRow key={i}>
                      <TableCell>{fecha(x.fecha)}</TableCell>
                      <TableCell className="font-mono text-xs">{x.orden}</TableCell>
                      <TableCell className="font-mono text-xs">{x.codigoRepo ?? '—'}</TableCell>
                      <TableCell>{x.tipo === 'MATERIALES' ? 'Materiales' : 'Reimpresión'}</TableCell>
                      <TableCell className="break-words whitespace-normal">{x.departamento}</TableCell>
                      <TableCell className="break-words whitespace-normal">{x.defecto}</TableCell>
                      <TableCell>{x.impresora ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(x.yardasPapel)}</TableCell>
                      <TableCell className="break-words whitespace-normal">{x.tela ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(x.yardasTela)}</TableCell>
                      <TableCell className="break-words whitespace-normal text-xs">
                        {x.materiales.length > 0 ? resumirMateriales(x.materiales) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
