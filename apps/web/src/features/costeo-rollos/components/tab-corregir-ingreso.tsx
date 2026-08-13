import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { costeoRollosApi } from '../api'
import type { RolloDeFactura } from '../types'

type FilaEdicion = { idTipoPapel: string; yardasIniciales: string; costoUnitario: string }

export function TabCorregirIngreso() {
  const queryClient = useQueryClient()
  const { data: tiposPapel } = useQuery({
    queryKey: ['costeo-rollos', 'tipos-papel'],
    queryFn: () => costeoRollosApi.listarTiposPapel(),
  })

  const [numeroBuscar, setNumeroBuscar] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [factura, setFactura] = useState<Awaited<ReturnType<typeof costeoRollosApi.buscarFactura>> | null>(null)

  const [numeroFactura, setNumeroFactura] = useState('')
  const [fecha, setFecha] = useState('')
  const [filas, setFilas] = useState<Record<number, FilaEdicion>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  useEffect(() => {
    if (!factura) return
    setNumeroFactura(factura.numeroFactura)
    setFecha(factura.fecha.slice(0, 10))
    const nuevasFilas: Record<number, FilaEdicion> = {}
    for (const r of factura.rollos) {
      nuevasFilas[r.idRolloPapel] = {
        idTipoPapel: String(r.idTipoPapel),
        yardasIniciales: r.yardasIniciales ?? '',
        costoUnitario: r.costoUnitario ?? '',
      }
    }
    setFilas(nuevasFilas)
    setExito(null)
    setError(null)
  }, [factura])

  async function buscar() {
    if (!numeroBuscar.trim()) return
    setBuscando(true)
    setErrorBusqueda(null)
    setFactura(null)
    try {
      const resultado = await costeoRollosApi.buscarFactura(numeroBuscar.trim())
      setFactura(resultado)
    } catch (err) {
      setErrorBusqueda(err instanceof ApiError ? err.message : 'Error al buscar la factura')
    } finally {
      setBuscando(false)
    }
  }

  function setFila(idRolloPapel: number, campo: keyof FilaEdicion, valor: string) {
    setFilas((prev) => ({ ...prev, [idRolloPapel]: { ...prev[idRolloPapel], [campo]: valor } }))
  }

  async function guardar() {
    if (!factura) return
    setGuardando(true)
    setError(null)
    try {
      const actualizado = await costeoRollosApi.editarIngreso(factura.idFacturaPapel, {
        numeroFactura: numeroFactura !== factura.numeroFactura ? numeroFactura : undefined,
        fecha: fecha ? new Date(fecha).toISOString() : undefined,
        rollos: factura.rollos.map((r: RolloDeFactura) => ({
          idRolloPapel: r.idRolloPapel,
          idTipoPapel: Number(filas[r.idRolloPapel].idTipoPapel),
          yardasIniciales: filas[r.idRolloPapel].yardasIniciales ? Number(filas[r.idRolloPapel].yardasIniciales) : undefined,
          costoUnitario: filas[r.idRolloPapel].costoUnitario ? Number(filas[r.idRolloPapel].costoUnitario) : undefined,
        })),
      })
      setFactura(actualizado)
      setExito('Ingreso corregido correctamente.')
      queryClient.invalidateQueries({ queryKey: ['costeo-rollos'] })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar la corrección')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buscar factura de papel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Número de factura"
              value={numeroBuscar}
              onChange={(e) => setNumeroBuscar(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              className="max-w-xs"
            />
            <Button variant="outline" disabled={buscando} onClick={buscar}>
              {buscando ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
          {errorBusqueda && (
            <Alert variant="destructive">
              <AlertDescription>{errorBusqueda}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {factura && !factura.editable && (
        <Alert variant="destructive">
          <AlertDescription>
            Esta factura ya tiene (o tuvo) rollos montados — ya no se puede editar desde acá, es un caso excepcional. Si el
            dato original está mal, corregilo directamente en la base de datos.
          </AlertDescription>
        </Alert>
      )}

      {factura && factura.editable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corregir ingreso — {factura.rollos.length} rollos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {exito && (
              <Alert>
                <AlertDescription>{exito}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs">Número de factura</Label>
                <Input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Fecha</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              {factura.rollos.map((r) => (
                <div key={r.idRolloPapel} className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-medium text-ink-muted">Rollo #{r.secuencia}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="mb-1 block text-xs">Tipo de papel</Label>
                      <Select
                        value={filas[r.idRolloPapel]?.idTipoPapel ?? ''}
                        onValueChange={(v) => setFila(r.idRolloPapel, 'idTipoPapel', v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {tiposPapel?.map((t) => (
                            <SelectItem key={t.idTipoPapel} value={String(t.idTipoPapel)}>
                              {t.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Yardas iniciales</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={filas[r.idRolloPapel]?.yardasIniciales ?? ''}
                        onChange={(e) => setFila(r.idRolloPapel, 'yardasIniciales', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Costo unitario</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={filas[r.idRolloPapel]?.costoUnitario ?? ''}
                        onChange={(e) => setFila(r.idRolloPapel, 'costoUnitario', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button disabled={guardando} onClick={guardar}>
              {guardando ? 'Guardando…' : 'Guardar corrección'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
