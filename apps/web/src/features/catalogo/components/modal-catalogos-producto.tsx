import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito } from '@/lib/avisos'
import { catalogoApi } from '../api'
import type { TipoCatalogoProducto, ValorCatalogoProducto } from '../types'
import { claveCatalogoProducto } from './select-catalogo-producto'

const TIPOS: {
  tipo: TipoCatalogoProducto
  titulo: string
  columna: string
  singular: string
  ayuda: string
}[] = [
  {
    tipo: 'estilos',
    titulo: 'Estilos',
    columna: 'Estilo',
    singular: 'estilo',
    ayuda: 'Tipo de prenda: Jersey, Short, T-Shirt, Pants…',
  },
  {
    tipo: 'lineas',
    titulo: 'Líneas',
    columna: 'Línea',
    singular: 'línea',
    ayuda: 'Línea comercial: Hail Mary, Mesh Crew Neck, V-Neck… No es el estilo.',
  },
  {
    tipo: 'generos',
    titulo: 'Géneros',
    columna: 'Género',
    singular: 'género',
    ayuda: 'Público de la prenda: hombre, mujer, juvenil…',
  },
  {
    tipo: 'composiciones',
    titulo: 'Composiciones',
    columna: 'Composición',
    singular: 'composición',
    ayuda: 'Composición de la tela: 100% Polyester…',
  },
]

/**
 * Alta, renombrado y retiro de los cuatro catálogos que describen al producto.
 * Un valor se RETIRA y no se borra: lo saca de los selectores sin tocar a los
 * productos que ya lo usan. Mismo patrón que `modal-lineas-producto` de Órdenes,
 * que este reemplaza (el estilo pasó al producto el 2026-10-23).
 */
export function ModalCatalogosProducto({
  open,
  onOpenChange,
  puedeEditar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  puedeEditar: boolean
}) {
  const queryClient = useQueryClient()
  const [tipo, setTipo] = useState<TipoCatalogoProducto>('estilos')
  const actual = TIPOS.find((t) => t.tipo === tipo)!

  const { data: valores } = useQuery({
    queryKey: claveCatalogoProducto(tipo),
    queryFn: () => catalogoApi.catalogoProducto(tipo),
    enabled: open,
  })

  const [nombreNuevo, setNombreNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null)

  function refrescar() {
    void queryClient.invalidateQueries({ queryKey: claveCatalogoProducto(tipo) })
  }

  async function agregar() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setGuardando(true)
    try {
      const creado = await catalogoApi.crearCatalogoProducto(tipo, nombre)
      setNombreNuevo('')
      refrescar()
      avisarExito(`Agregado: ${creado.nombre}`)
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'No se pudo agregar')
    } finally {
      setGuardando(false)
    }
  }

  async function cambiar(v: ValorCatalogoProducto, body: { nombre?: string; activo?: boolean }) {
    try {
      await catalogoApi.editarCatalogoProducto(tipo, v.id, body)
      setEditando(null)
      refrescar()
      // Si cambió el nombre o el estado, los listados de productos lo muestran.
      void queryClient.invalidateQueries({ queryKey: ['catalogo', 'productos'] })
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'No se pudo guardar el cambio')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setEditando(null)
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
        <div className="flex max-h-[80vh] flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Catálogos de producto</DialogTitle>
            <DialogDescription>
              Describen a cada producto para la estadística de producción. Se eligen en el formulario del producto.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1">
            {TIPOS.map((t) => (
              <Button
                key={t.tipo}
                size="sm"
                variant={t.tipo === tipo ? 'default' : 'outline'}
                onClick={() => {
                  setTipo(t.tipo)
                  setEditando(null)
                  setNombreNuevo('')
                }}
              >
                {t.titulo}
              </Button>
            ))}
          </div>
          <p className="text-ink-faint text-xs">{actual.ayuda}</p>

          {puedeEditar && (
            <div className="flex gap-2">
              <Input
                value={nombreNuevo}
                placeholder={`Nuevo ${actual.singular}`}
                onChange={(e) => setNombreNuevo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !guardando) void agregar()
                }}
              />
              <Button disabled={guardando || !nombreNuevo.trim()} onClick={() => void agregar()}>
                {guardando ? 'Agregando…' : 'Agregar'}
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 bg-popover">
                  <TableHead>{actual.columna}</TableHead>
                  <TableHead className="w-24 text-right">Productos</TableHead>
                  {puedeEditar && <TableHead className="w-44" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {valores?.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="whitespace-normal">
                      {editando?.id === v.id ? (
                        <Input
                          autoFocus
                          value={editando.nombre}
                          className="h-8"
                          onChange={(e) => setEditando({ id: v.id, nombre: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void cambiar(v, { nombre: editando.nombre })
                            if (e.key === 'Escape') setEditando(null)
                          }}
                        />
                      ) : (
                        <span className={v.activo ? '' : 'text-ink-faint line-through'}>
                          {v.nombre}{' '}
                          {!v.activo && <Badge variant="secondary">Retirado</Badge>}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{v.productos}</TableCell>
                    {puedeEditar && (
                      <TableCell className="text-right">
                        {editando?.id === v.id ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" onClick={() => void cambiar(v, { nombre: editando.nombre })}>
                              Guardar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditando({ id: v.id, nombre: v.nombre })}
                            >
                              Renombrar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void cambiar(v, { activo: !v.activo })}>
                              {v.activo ? 'Retirar' : 'Reactivar'}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {valores?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={puedeEditar ? 3 : 2} className="text-ink-faint text-center">
                      Todavía no hay ninguno. {puedeEditar ? 'Agregá el primero arriba.' : ''}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
