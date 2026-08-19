import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ImportPreviewDialog } from '@/components/shared/import-preview-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { costeoEstandarApi } from './api'
import { ModalConsumoEstandar } from './components/modal-consumo-estandar'
import type { FilaPreviewConsumoEstandar } from './types'

export function EstandarPage() {
  const { tienePermiso } = useAuth()
  const puedeAdministrar = tienePermiso('costeo.estandar.administrar')
  const [busqueda, setBusqueda] = useState('')
  const [incluirHistorial, setIncluirHistorial] = useState(false)
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const [importAbierto, setImportAbierto] = useState(false)

  const { data: filas, isLoading } = useQuery({
    queryKey: ['costeo', 'estandar', busqueda, incluirHistorial],
    queryFn: () => costeoEstandarApi.listar(busqueda || undefined, incluirHistorial),
  })

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Consumo Estándar de Papel</h1>
        {puedeAdministrar && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportAbierto(true)}>
              Importar plantilla
            </Button>
            <Button onClick={() => setNuevoAbierto(true)}>+ Nuevo consumo</Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consumos registrados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Buscar por código de producto…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id="incluir-historial"
                checked={incluirHistorial}
                onCheckedChange={(checked) => setIncluirHistorial(checked === true)}
              />
              <Label htmlFor="incluir-historial" className="text-sm font-normal">
                Ver histórico (incluye versiones ya reemplazadas)
              </Label>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Talla</TableHead>
                <TableHead className="text-right">Pulgadas</TableHead>
                <TableHead className="text-right">Yardas</TableHead>
                <TableHead>Vigente desde</TableHead>
                <TableHead>Vigente hasta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas?.map((f) => (
                <TableRow key={f.idConsumoEstandar}>
                  <TableCell>
                    <span className="font-mono">{f.producto.codigo}</span> — {f.producto.descripcion}
                  </TableCell>
                  <TableCell>{f.talla.nombre}</TableCell>
                  <TableCell className="text-right">{f.pulgadasPapel}</TableCell>
                  <TableCell className="text-right">{f.yardas ?? '—'}</TableCell>
                  <TableCell>{f.vigenteDesde.slice(0, 10)}</TableCell>
                  <TableCell>{f.vigenteHasta ? f.vigenteHasta.slice(0, 10) : 'Sin fecha de corte'}</TableCell>
                </TableRow>
              ))}
              {!isLoading && filas?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-ink-faint">
                    {busqueda ? 'Sin resultados para esa búsqueda.' : 'Todavía no hay consumos estándar registrados.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ModalConsumoEstandar open={nuevoAbierto} onOpenChange={setNuevoAbierto} />

      <ImportPreviewDialog<FilaPreviewConsumoEstandar>
        open={importAbierto}
        onOpenChange={setImportAbierto}
        titulo="Importar Consumo Estándar de Papel"
        getError={(f) => f.error}
        getKey={(f) => f.fila}
        onDescargarPlantilla={() => costeoEstandarApi.plantillaImportar()}
        columnas={[
          { key: 'producto', header: 'Producto', render: (f) => f.productoCodigo },
          { key: 'talla', header: 'Talla', render: (f) => f.tallaNombre },
          { key: 'pulgadas', header: 'Pulgadas', className: 'text-right', render: (f) => f.pulgadasPapel },
          { key: 'desde', header: 'Vigente desde', render: (f) => f.vigenteDesde?.slice(0, 10) ?? '—' },
          {
            key: 'estado',
            header: 'Estado',
            className: 'whitespace-normal',
            render: (f) =>
              f.error ??
              (f.corrigeId
                ? 'Corrige el valor de hoy (mismo día)'
                : f.reemplazaId
                  ? 'Reemplaza el valor vigente actual'
                  : 'OK'),
          },
        ]}
        onArchivoElegido={async (archivo) => (await costeoEstandarApi.previewImportar(archivo)).filas}
        onAplicar={async (filasValidas) => {
          const r = await costeoEstandarApi.aplicarImportar(filasValidas)
          const detalle = [
            r.reemplazados > 0 ? `${r.reemplazados} reemplazaron una versión anterior` : null,
            r.corregidos > 0 ? `${r.corregidos} corrigieron el valor de hoy` : null,
          ]
            .filter(Boolean)
            .join(', ')
          return `${r.creados} consumos estándar creados${detalle ? ` (${detalle})` : ''}.`
        }}
      />
    </div>
  )
}
