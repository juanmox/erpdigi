import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { costeoOrdenesApi } from '../api'

interface ModalLineasProductoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Pantalla mínima de alta — Cliente + Línea de producto vienen colapsados en
// un solo campo de texto libre en el sistema legacy (ANEXO_A_Hallazgos.md
// §2.3, ej. "BSN Basketball", "BSN Jersey"); acá quedan separados en un
// catálogo con FK. A diferencia de Producto (alta en /catalogo, con receta y
// costos asociados), Línea de producto es liviano — se da de alta directo,
// sin flujo de pendientes/aprobación.
export function ModalLineasProducto({ open, onOpenChange }: ModalLineasProductoProps) {
  const queryClient = useQueryClient()
  const [idCliente, setIdCliente] = useState('')
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: clientes } = useQuery({
    queryKey: ['costeo-ordenes', 'clientes'],
    queryFn: () => costeoOrdenesApi.clientes(),
    enabled: open,
  })
  const { data: lineas } = useQuery({
    queryKey: ['costeo-ordenes', 'lineas-producto'],
    queryFn: () => costeoOrdenesApi.lineasProducto(),
    enabled: open,
  })

  async function agregar() {
    if (!idCliente || !nombre.trim()) {
      setError('Elegí un cliente y escribí el nombre de la línea')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await costeoOrdenesApi.crearLineaProducto({ idCliente: Number(idCliente), nombre: nombre.trim() })
      setNombre('')
      queryClient.invalidateQueries({ queryKey: ['costeo-ordenes', 'lineas-producto'] })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear la línea de producto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Líneas de producto</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="mb-1 block text-xs">Cliente</Label>
            <Select value={idCliente} onValueChange={setIdCliente}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {clientes?.map((c) => (
                  <SelectItem key={c.idCliente} value={String(c.idCliente)}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="mb-1 block text-xs">Nombre de la línea</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Basketball" />
          </div>
          <Button disabled={guardando} onClick={agregar}>
            {guardando ? 'Agregando…' : 'Agregar'}
          </Button>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Línea de producto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas?.map((l) => (
                <TableRow key={l.idLineaProducto}>
                  <TableCell>{l.cliente.nombre}</TableCell>
                  <TableCell>{l.nombre}</TableCell>
                </TableRow>
              ))}
              {lineas?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-ink-faint">
                    Todavía no hay líneas de producto registradas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
