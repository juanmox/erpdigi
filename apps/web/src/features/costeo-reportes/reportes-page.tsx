import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMarcaEmpresa } from '@/app/marca-empresa'
import { ApiError } from '@/lib/api'
import { costeoReportesApi } from './api'
import { imprimirReporteConsumo } from './imprimir'
import type { FiltrosConsumo } from './types'

const TODOS = '__todos__'

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
  const [filtros, setFiltros] = useState<FiltrosConsumo>(mesActual())
  const [aplicados, setAplicados] = useState<FiltrosConsumo>(mesActual())
  const [descargando, setDescargando] = useState(false)
  const [errorExport, setErrorExport] = useState<string | null>(null)

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
      <h1 className="text-xl font-semibold text-ink">Consumo por orden de producción</h1>

      {/* Los filtros se aplican al presionar "Ver": con fechas, recargar en cada
          tecla dispara consultas contra rangos a medio escribir. */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
        <div>
          <Label htmlFor="desde" className="mb-1 block text-xs">Desde</Label>
          <Input
            id="desde"
            type="date"
            value={filtros.desde}
            onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
            className="w-40"
          />
        </div>
        <div>
          <Label htmlFor="hasta" className="mb-1 block text-xs">Hasta</Label>
          <Input
            id="hasta"
            type="date"
            value={filtros.hasta}
            onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
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
        <Button onClick={() => setAplicados(filtros)} disabled={isFetching}>
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

      {data && !hayDatos && !isFetching && (
        <p className="text-muted-foreground rounded-md border border-border p-4 text-center text-sm">
          No hay consumo registrado entre {dia(data.filtros.desde)} y {dia(data.filtros.hasta)}
          {data.filtros.idCliente || data.filtros.idImpresora ? ' con esos filtros' : ''}.
        </p>
      )}

      {hayDatos && data && (
        <>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-ink">Resumen por orden</h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>OP</TableHead>
                    <TableHead>Cliente</TableHead>
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
                  {data.resumen.map((r) => (
                    <TableRow key={r.codigo}>
                      <TableCell className="font-mono">{r.codigo}</TableCell>
                      <TableCell className="break-words whitespace-normal">{r.cliente ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.impresionYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.enguiamientoYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.enBlancoYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.reposicionYd)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{yd(r.totalPapelYd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(r.telaYd)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-black/[0.04] dark:bg-white/[0.05]">
                    <TableCell colSpan={2} className="font-semibold">TOTAL</TableCell>
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
              Detalle de impresión{' '}
              <span className="text-muted-foreground text-sm font-normal">
                ({data.detalleImpresion.length} registro(s))
              </span>
            </h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>OP</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Talla</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead>Impresora</TableHead>
                    <TableHead className="text-right">Consumo</TableHead>
                    <TableHead className="text-right">Enguiam.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.detalleImpresion.map((x, i) => (
                    <TableRow key={i}>
                      <TableCell>{fecha(x.fecha)}</TableCell>
                      <TableCell className="font-mono text-xs">{x.orden}</TableCell>
                      <TableCell className="font-mono text-xs break-all whitespace-normal">{x.codigoLine ?? '—'}</TableCell>
                      <TableCell className="break-words whitespace-normal">{x.producto ?? '—'}</TableCell>
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
              <span className="text-muted-foreground text-sm font-normal">
                ({data.detalleReposiciones.length} registro(s))
              </span>
            </h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>OP</TableHead>
                    <TableHead>No. repo</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Defecto</TableHead>
                    <TableHead>Impresora</TableHead>
                    <TableHead className="text-right">Yd papel</TableHead>
                    <TableHead>Tela</TableHead>
                    <TableHead className="text-right">Yd tela</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.detalleReposiciones.map((x, i) => (
                    <TableRow key={i}>
                      <TableCell>{fecha(x.fecha)}</TableCell>
                      <TableCell className="font-mono text-xs">{x.orden}</TableCell>
                      <TableCell className="font-mono text-xs">{x.codigoRepo ?? '—'}</TableCell>
                      <TableCell className="break-words whitespace-normal">{x.departamento}</TableCell>
                      <TableCell className="break-words whitespace-normal">{x.defecto}</TableCell>
                      <TableCell>{x.impresora ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(x.yardasPapel)}</TableCell>
                      <TableCell className="break-words whitespace-normal">{x.tela ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{yd(x.yardasTela)}</TableCell>
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
