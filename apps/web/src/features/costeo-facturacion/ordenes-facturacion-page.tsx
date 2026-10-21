import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { ImportPreviewDialog } from '@/components/shared/import-preview-dialog'
import { normalizarCodigoCosteo } from '@/lib/codigos-costeo'
import { costeoFacturacionApi } from './api'
import { ModalDetalleOf } from './components/modal-detalle-of'
import type { FilaPreviewOfOp, FiltrosListadoOf } from './types'

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const SIN_VALOR = '__todas__'

function filtrosVacios(): FiltrosListadoOf {
  return {}
}

export function OrdenesFacturacionPage() {
  const queryClient = useQueryClient()
  const { tienePermiso } = useAuth()
  const puedeImportar = tienePermiso('costeo.of.crear')

  const [codigosTexto, setCodigosTexto] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [estado, setEstado] = useState<string>(SIN_VALOR)
  const [fechaOfDesde, setFechaOfDesde] = useState('')
  const [fechaOfHasta, setFechaOfHasta] = useState('')
  const [fechaFacturaDesde, setFechaFacturaDesde] = useState('')
  const [fechaFacturaHasta, setFechaFacturaHasta] = useState('')
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosListadoOf>(filtrosVacios())

  const [importOpen, setImportOpen] = useState(false)
  const [codigoAbierto, setCodigoAbierto] = useState<string | null>(null)

  const { data: ofs, isLoading, error } = useQuery({
    queryKey: ['costeo-facturacion', 'listado', filtrosAplicados],
    queryFn: () => costeoFacturacionApi.listar(filtrosAplicados),
  })

  function buscar() {
    // Atajos de código (correlativo corto) igual que OP, para no tener que
    // teclear el año y los ceros a la izquierda de cada OF del filtro.
    const codigos = codigosTexto
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => normalizarCodigoCosteo(c, 'OF'))
      .join(',')
    setFiltrosAplicados({
      codigos: codigos || undefined,
      numeroFactura: numeroFactura.trim() || undefined,
      estado: estado === SIN_VALOR ? undefined : (estado as FiltrosListadoOf['estado']),
      fechaOfDesde: fechaOfDesde || undefined,
      fechaOfHasta: fechaOfHasta || undefined,
      fechaFacturaDesde: fechaFacturaDesde || undefined,
      fechaFacturaHasta: fechaFacturaHasta || undefined,
    })
  }

  function limpiar() {
    setCodigosTexto('')
    setNumeroFactura('')
    setEstado(SIN_VALOR)
    setFechaOfDesde('')
    setFechaOfHasta('')
    setFechaFacturaDesde('')
    setFechaFacturaHasta('')
    setFiltrosAplicados(filtrosVacios())
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-ink">Órdenes de Facturación</h1>
          <p className="text-ink-faint text-xs">
            Mientras no existe el módulo de facturación, las OF se cargan por plantilla (OP · OF ·
            Fecha OF) y la factura se asigna después, desde acá.
          </p>
        </div>
        {puedeImportar && (
          <Button onClick={() => setImportOpen(true)}>Importar plantilla</Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-2">
              <Label className="mb-1 block text-xs">OF (una o varias, separadas por coma)</Label>
              <Input
                placeholder="159, 26OF000200…"
                value={codigosTexto}
                onChange={(e) => setCodigosTexto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscar()}
                className="font-mono"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">No. de factura</Label>
              <Input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Todas (sin anuladas)</SelectItem>
                  <SelectItem value="sin_factura">Sin factura</SelectItem>
                  <SelectItem value="facturada">Facturadas</SelectItem>
                  <SelectItem value="anulada">Anuladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="mb-1 block text-xs">Fecha OF desde</Label>
              <Input type="date" value={fechaOfDesde} onChange={(e) => setFechaOfDesde(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Fecha OF hasta</Label>
              <Input type="date" value={fechaOfHasta} onChange={(e) => setFechaOfHasta(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Fecha factura desde</Label>
              <Input
                type="date"
                value={fechaFacturaDesde}
                onChange={(e) => setFechaFacturaDesde(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Fecha factura hasta</Label>
              <Input
                type="date"
                value={fechaFacturaHasta}
                onChange={(e) => setFechaFacturaHasta(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={buscar}>Buscar</Button>
            <Button variant="outline" onClick={limpiar}>
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {ofs ? `${ofs.length} orden(es) de facturación` : 'Resultados'}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading && <p className="text-ink-faint text-sm">Cargando…</p>}
          {error && (
            <p className="text-destructive text-sm">
              {error instanceof ApiError ? error.message : 'No se pudo cargar el listado'}
            </p>
          )}
          {ofs && ofs.length === 0 && (
            <p className="text-ink-faint text-sm">Ninguna OF coincide con los filtros.</p>
          )}
          {ofs && ofs.length > 0 && (
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>OF</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">OP</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Fecha factura</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ofs.map((o) => (
                  <TableRow
                    key={o.idOrdenFacturacion}
                    className="cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                    onClick={() => setCodigoAbierto(o.codigo)}
                  >
                    <TableCell className="font-mono">{o.codigo}</TableCell>
                    <TableCell>{fechaCorta(o.fecha)}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{o.cliente}</TableCell>
                    <TableCell className="text-right">{o.cantidadOps}</TableCell>
                    <TableCell className="font-mono text-xs">{o.numeroFactura ?? '—'}</TableCell>
                    <TableCell>{o.fechaFactura ? fechaCorta(o.fechaFactura) : '—'}</TableCell>
                    <TableCell>
                      {o.anuladaEn ? (
                        <Badge variant="destructive">Anulada</Badge>
                      ) : o.numeroFactura ? (
                        <Badge variant="secondary">Facturada</Badge>
                      ) : (
                        <Badge variant="outline">Sin factura</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ModalDetalleOf
        codigo={codigoAbierto}
        open={!!codigoAbierto}
        onOpenChange={(o) => !o && setCodigoAbierto(null)}
      />

      <ImportPreviewDialog<FilaPreviewOfOp>
        open={importOpen}
        onOpenChange={setImportOpen}
        titulo="Importar OP → OF"
        getKey={(f) => f.fila}
        getError={(f) => f.error}
        onDescargarPlantilla={() => costeoFacturacionApi.plantilla()}
        columnas={[
          { key: 'fila', header: 'Fila', render: (f) => f.fila },
          { key: 'op', header: 'OP', render: (f) => f.codigoOp ?? f.opTexto },
          { key: 'cliente', header: 'Cliente', render: (f) => f.clienteOp ?? '—' },
          { key: 'of', header: 'OF', render: (f) => f.codigoOf ?? f.ofTexto },
          { key: 'fechaOf', header: 'Fecha OF', render: (f) => f.fechaOf ?? '—' },
          {
            key: 'factura',
            header: 'Factura',
            render: (f) => (f.numeroFactura ? `${f.numeroFactura} (${f.fechaFactura})` : '—'),
          },
          {
            key: 'estado',
            header: 'Estado',
            // El error va ACÁ — antes la columna solo distinguía
            // "nueva"/"ya cargada" y cualquier fila con error caía en el '—'
            // final sin decir nada: la tabla se veía toda roja sin ningún
            // indicio de qué estaba mal. Mismo patrón que el resto de los
            // imports del proyecto (`f.error ?? ...`).
            className: 'max-w-xs whitespace-normal break-words',
            render: (f) =>
              f.error ? (
                <span className="text-destructive">{f.error}</span>
              ) : f.estado === 'ya_cargada' ? (
                <span className="text-ink-faint">Ya cargada</span>
              ) : f.estado === 'nueva' ? (
                <span className="text-accent-brand-strong">Nueva</span>
              ) : (
                '—'
              ),
          },
        ]}
        onArchivoElegido={async (archivo) => (await costeoFacturacionApi.previewImportar(archivo)).filas}
        onAplicar={async (filasValidas) => {
          // Las "ya_cargada" no hace falta mandarlas — el servidor las vuelve a
          // saltear igual, pero evita que el contador de "Aplicar (N)" cuente
          // filas que no van a crear nada.
          const nuevas = filasValidas.filter((f) => f.estado !== 'ya_cargada')
          if (nuevas.length === 0) return 'Nada nuevo que cargar: todas esas filas ya estaban cargadas.'
          const r = await costeoFacturacionApi.aplicarImportar(nuevas)
          queryClient.invalidateQueries({ queryKey: ['costeo-facturacion'] })
          return `${r.ofsCreadas} OF creada(s) · ${r.opsAsignadas} OP asignada(s)${r.ofsConFacturaAsignada ? ` · ${r.ofsConFacturaAsignada} con factura asignada` : ''}`
        }}
      />
    </div>
  )
}
