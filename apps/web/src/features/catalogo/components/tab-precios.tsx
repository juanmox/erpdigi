import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useMemo, useState } from 'react'
import { ImportPreviewDialog } from '@/components/shared/import-preview-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { formatGTQ } from '@digitexsa-erp/shared-utils'
import { catalogoApi } from '../api'
import type { FilaPreviewPrecio, InsumoCatalogo } from '../types'

export function TabPrecios() {
  const { tienePermiso } = useAuth()
  const puedeEditar = tienePermiso('recetas.insumos.editar')
  const puedeImportar = tienePermiso('recetas.importar')
  const queryClient = useQueryClient()

  const { data: insumos, isLoading } = useQuery({
    queryKey: ['catalogo', 'insumos', 'activos'],
    queryFn: () => catalogoApi.listarInsumos('activos'),
  })

  const [cambios, setCambios] = useState<Map<number, number>>(new Map())
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)

  const grupos = useMemo(() => {
    const g: Record<string, InsumoCatalogo[]> = {}
    for (const i of insumos ?? []) (g[i.categoria] ??= []).push(i)
    return g
  }, [insumos])

  function onCambiarPrecio(idInsumo: number, valor: string) {
    setCambios((prev) => {
      const next = new Map(prev)
      if (valor === '') next.delete(idInsumo)
      else next.set(idInsumo, Number(valor))
      return next
    })
  }

  async function guardarCambios() {
    if (cambios.size === 0) return
    setGuardando(true)
    setMensaje(null)
    try {
      const resultado = await catalogoApi.guardarPrecios(
        Array.from(cambios.entries()).map(([idInsumo, costoPromedio]) => ({ idInsumo, costoPromedio })),
      )
      setMensaje({ tipo: 'ok', texto: `${resultado.actualizados} precio(s) actualizado(s)` })
      setCambios(new Map())
      queryClient.invalidateQueries({ queryKey: ['catalogo', 'insumos'] })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error al guardar precios' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {insumos?.length ?? 0} insumos activos
          {cambios.size > 0 && <span> · {cambios.size} cambio(s) sin guardar</span>}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => catalogoApi.exportarInsumos()}>
            Exportar Excel
          </Button>
          {puedeImportar && (
            <Button variant="outline" size="sm" onClick={() => setDialogoAbierto(true)}>
              Importar precios
            </Button>
          )}
          {puedeEditar && (
            <Button size="sm" disabled={cambios.size === 0 || guardando} onClick={guardarCambios}>
              {guardando ? 'Guardando…' : `Guardar cambios (${cambios.size})`}
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
              <TableHead className="text-right">Costo actual</TableHead>
              <TableHead className="text-right">Costo nuevo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground text-center">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {Object.entries(grupos).map(([categoria, filas]) => (
              <Fragment key={categoria}>
                <TableRow className="bg-muted">
                  <TableCell colSpan={5} className="text-xs font-bold tracking-wide uppercase">
                    {categoria}
                  </TableCell>
                </TableRow>
                {filas.map((i) => (
                  <TableRow key={i.idInsumo}>
                    <TableCell className="font-medium">{i.codigo}</TableCell>
                    <TableCell>{i.descripcion}</TableCell>
                    <TableCell>{i.unidad}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatGTQ(i.costoPromedio)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.000001"
                        min={0}
                        disabled={!puedeEditar}
                        className="ml-auto h-8 w-28 text-right"
                        placeholder={i.costoPromedio.toFixed(4)}
                        value={cambios.has(i.idInsumo) ? String(cambios.get(i.idInsumo)) : ''}
                        onChange={(e) => onCambiarPrecio(i.idInsumo, e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <ImportPreviewDialog<FilaPreviewPrecio>
        open={dialogoAbierto}
        onOpenChange={(v) => {
          setDialogoAbierto(v)
          if (!v) queryClient.invalidateQueries({ queryKey: ['catalogo', 'insumos'] })
        }}
        titulo="Importar precios desde Excel"
        getError={(f) => f.error}
        getKey={(f) => f.fila}
        columnas={[
          { key: 'codigo', header: 'Código', render: (f) => f.codigo },
          { key: 'descripcion', header: 'Descripción', render: (f) => f.descripcion ?? '—' },
          {
            key: 'actual',
            header: 'Costo actual',
            className: 'text-right',
            render: (f) => (f.costoActual != null ? formatGTQ(f.costoActual) : '—'),
          },
          {
            key: 'nuevo',
            header: 'Costo nuevo',
            className: 'text-right',
            render: (f) => (f.costoNuevo != null ? formatGTQ(f.costoNuevo) : '—'),
          },
          {
            key: 'estado',
            header: 'Estado',
            render: (f) => f.error ?? (f.encontrado ? 'OK' : '—'),
          },
        ]}
        onArchivoElegido={async (archivo) => (await catalogoApi.previewImportarPrecios(archivo)).filas}
        onAplicar={async (filas) => {
          const resultado = await catalogoApi.guardarPrecios(
            filas.map((f) => ({ idInsumo: f.idInsumo as number, costoPromedio: f.costoNuevo as number })),
          )
          return `${resultado.actualizados} precio(s) actualizado(s)`
        }}
        textoBotonAplicar="Aplicar cambios"
      />
    </div>
  )
}
