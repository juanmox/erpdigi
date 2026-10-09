import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { costeoOrdenesApi } from '../api'

interface ModalLineasProductoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Alta de la línea de producto: un catálogo GLOBAL de tipos de prenda.
//
// Fue por CLIENTE hasta el 2026-10-09, heredado del legacy donde el campo
// CLIENTE traía los dos pegados (ANEXO_A §2.3, "BSN Jersey"). Se hizo global
// porque `Jersey` y `Short` son tipos de prenda y no algo de un cliente: por
// cliente, con 100 clientes habría 100 "Jersey" y una estadística por línea
// tendría que agrupar por texto. Mismo criterio que el `deporte`.
//
// ⚠️ Sigue sin ser el deporte, aunque algunos valores lo parezcan. El deporte
// real vive en recetas.productos.deporte, validado contra recetas.deportes;
// mantenerlos separados evita que una estadística tenga dos fuentes que se
// contradigan.
export function ModalLineasProducto({ open, onOpenChange }: ModalLineasProductoProps) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: lineas } = useQuery({
    queryKey: ['costeo-ordenes', 'lineas-producto'],
    queryFn: () => costeoOrdenesApi.lineasProducto(),
    enabled: open,
  })

  async function agregar() {
    if (!nombre.trim()) {
      setError('Escribí el nombre de la línea')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await costeoOrdenesApi.crearLineaProducto({ nombre: nombre.trim() })
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

        <p className="text-ink-faint text-xs">
          Son tipos de prenda y sirven para cualquier cliente: alcanza con crear{' '}
          <strong>Jersey</strong> una vez.
        </p>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="mb-1 block text-xs">Nombre de la línea</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Jersey"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !guardando) void agregar()
              }}
            />
          </div>
          <Button disabled={guardando || !nombre.trim()} onClick={() => void agregar()}>
            {guardando ? 'Agregando…' : 'Agregar'}
          </Button>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Línea de producto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas?.map((l) => (
                <TableRow key={l.idLineaProducto}>
                  <TableCell>{l.nombre}</TableCell>
                </TableRow>
              ))}
              {lineas?.length === 0 && (
                <TableRow>
                  <TableCell className="text-ink-faint text-center">
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
