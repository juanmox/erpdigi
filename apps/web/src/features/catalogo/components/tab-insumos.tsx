import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState } from 'react'
import { ImportPreviewDialog } from '@/components/shared/import-preview-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { formatGTQ } from '@digitexsa-erp/shared-utils'
import { catalogoApi } from '../api'
import type { FilaPreviewAltaInsumo, InsumoCatalogo } from '../types'
import { ModalInsumo } from './modal-insumo'

type Estado = 'activos' | 'inactivos' | 'todos'

export function TabInsumos() {
  const { tienePermiso } = useAuth()
  const puedeCrear = tienePermiso('recetas.insumos.crear')
  const puedeEditar = tienePermiso('recetas.insumos.editar')
  const puedeDesactivar = tienePermiso('recetas.insumos.desactivar')
  const puedeImportar = tienePermiso('recetas.importar')
  const queryClient = useQueryClient()

  const [estado, setEstado] = useState<Estado>('activos')
  const { data: insumos, isLoading } = useQuery({
    queryKey: ['catalogo', 'insumos', estado],
    queryFn: () => catalogoApi.listarInsumos(estado),
  })

  const [modalAbierto, setModalAbierto] = useState(false)
  const [insumoEditando, setInsumoEditando] = useState<InsumoCatalogo | null>(null)
  const [importAbierto, setImportAbierto] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const grupos = useMemo(() => {
    const g: Record<string, InsumoCatalogo[]> = {}
    for (const i of insumos ?? []) (g[i.categoria] ??= []).push(i)
    return g
  }, [insumos])

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['catalogo', 'insumos'] })
  }

  function abrirCrear() {
    setInsumoEditando(null)
    setModalAbierto(true)
  }

  function abrirEditar(i: InsumoCatalogo) {
    setInsumoEditando(i)
    setModalAbierto(true)
  }

  async function alternarActivo(i: InsumoCatalogo) {
    setMensaje(null)
    try {
      await catalogoApi.cambiarActivoInsumo(i.idInsumo, !i.activo)
      invalidar()
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al cambiar el estado' })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={estado} onValueChange={(v) => setEstado(v as Estado)}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activos">Activos</SelectItem>
              <SelectItem value="inactivos">Inactivos</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-sm">{insumos?.length ?? 0} insumos</p>
        </div>
        <div className="flex gap-2">
          {puedeImportar && (
            <>
              <Button variant="outline" size="sm" onClick={() => catalogoApi.plantillaAltaInsumos()}>
                Plantilla de altas
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportAbierto(true)}>
                Importar altas
              </Button>
            </>
          )}
          {puedeCrear && (
            <Button size="sm" onClick={abrirCrear}>
              Nuevo insumo
            </Button>
          )}
        </div>
      </div>

      {mensaje && (
        <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{mensaje.texto}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Costo promedio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-center">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {Object.entries(grupos).map(([categoria, filas]) => (
              <Fragment key={categoria}>
                <TableRow className="bg-muted">
                  <TableCell colSpan={6} className="text-xs font-bold tracking-wide uppercase">
                    {categoria}
                  </TableCell>
                </TableRow>
                {filas.map((i) => (
                  <TableRow key={i.idInsumo}>
                    <TableCell className="font-medium">{i.codigo}</TableCell>
                    <TableCell>{i.descripcion}</TableCell>
                    <TableCell>{i.unidad}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatGTQ(i.costoPromedio)}</TableCell>
                    <TableCell>
                      <Badge variant={i.activo ? 'default' : 'secondary'}>{i.activo ? 'Activo' : 'Inactivo'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {puedeEditar && (
                          <Button variant="ghost" size="sm" onClick={() => abrirEditar(i)}>
                            Editar
                          </Button>
                        )}
                        {puedeDesactivar && (
                          <Button variant="ghost" size="sm" onClick={() => alternarActivo(i)}>
                            {i.activo ? 'Desactivar' : 'Reactivar'}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <ModalInsumo
        insumo={insumoEditando}
        open={modalAbierto}
        onOpenChange={setModalAbierto}
        onGuardado={invalidar}
      />

      <ImportPreviewDialog<FilaPreviewAltaInsumo>
        open={importAbierto}
        onOpenChange={(v) => {
          setImportAbierto(v)
          if (!v) invalidar()
        }}
        titulo="Importar altas de insumos"
        getError={(f) => f.error}
        getKey={(f) => f.fila}
        onDescargarPlantilla={() => catalogoApi.plantillaAltaInsumos()}
        columnas={[
          { key: 'codigo', header: 'Código', render: (f) => f.codigo },
          { key: 'descripcion', header: 'Descripción', render: (f) => f.descripcion },
          { key: 'categoria', header: 'Categoría', render: (f) => f.categoria },
          { key: 'unidad', header: 'Unidad', render: (f) => f.unidad },
          {
            key: 'costo',
            header: 'Costo inicial',
            className: 'text-right',
            render: (f) => (f.costoInicial != null ? formatGTQ(f.costoInicial) : '—'),
          },
          { key: 'estado', header: 'Estado', render: (f) => f.error ?? 'OK' },
        ]}
        onArchivoElegido={async (archivo) => (await catalogoApi.previewImportarAltasInsumos(archivo)).filas}
        onAplicar={async (filas) => {
          const resultado = await catalogoApi.altasInsumos(
            filas.map((f) => ({
              codigo: f.codigo,
              descripcion: f.descripcion,
              idCategoria: f.idCategoria as number,
              idUnidad: f.idUnidad as number,
              costoPromedio: f.costoInicial ?? 0,
            })),
          )
          return `${resultado.creados} insumo(s) creado(s)`
        }}
        textoBotonAplicar="Crear insumos"
      />
    </div>
  )
}
