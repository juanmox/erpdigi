import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { costeoRollosApi } from '../api'
import type { FacturaPapel, RolloPapel } from '../types'

const HOY = new Date().toISOString().slice(0, 10)

export function TabIngreso() {
  const queryClient = useQueryClient()
  const { data: tiposPapel } = useQuery({
    queryKey: ['costeo-rollos', 'tipos-papel'],
    queryFn: () => costeoRollosApi.listarTiposPapel(),
  })

  const [numeroFactura, setNumeroFactura] = useState('')
  const [fecha, setFecha] = useState(HOY)
  const [idTipoPapel, setIdTipoPapel] = useState('')
  const [totalRollos, setTotalRollos] = useState('')
  const [yardasPorRollo, setYardasPorRollo] = useState('')
  const [costoUnitario, setCostoUnitario] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<(FacturaPapel & { rollos: RolloPapel[] }) | null>(null)

  function limpiar() {
    setNumeroFactura('')
    setFecha(HOY)
    setIdTipoPapel('')
    setTotalRollos('')
    setYardasPorRollo('')
    setCostoUnitario('')
  }

  async function guardar() {
    setError(null)
    const total = Number(totalRollos)
    if (!numeroFactura.trim()) {
      setError('El número de factura es obligatorio')
      return
    }
    if (!idTipoPapel) {
      setError('Seleccioná el tipo de papel')
      return
    }
    if (!(total > 0)) {
      setError('El total de rollos debe ser mayor a 0')
      return
    }

    setGuardando(true)
    try {
      const factura = await costeoRollosApi.ingreso({
        numeroFactura: numeroFactura.trim(),
        fecha,
        totalRollos: total,
        idTipoPapel: Number(idTipoPapel),
        yardasPorRollo: yardasPorRollo ? Number(yardasPorRollo) : undefined,
        costoUnitario: costoUnitario ? Number(costoUnitario) : undefined,
      })
      setResultado(factura)
      limpiar()
      queryClient.invalidateQueries({ queryKey: ['costeo-rollos'] })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al registrar el ingreso')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingreso a bodega</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div>
            <Label className="mb-1 block text-xs">Número de factura</Label>
            <Input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} placeholder="958745125" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Tipo de papel</Label>
            <Select value={idTipoPapel} onValueChange={setIdTipoPapel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleccionar…" />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Total de rollos</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={totalRollos}
                onChange={(e) => setTotalRollos(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Yardas por rollo</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={yardasPorRollo}
                onChange={(e) => setYardasPorRollo(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Costo unitario por yarda (GTQ)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={costoUnitario}
              onChange={(e) => setCostoUnitario(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <Button className="w-full" disabled={guardando} onClick={guardar}>
            {guardando ? 'Registrando…' : 'Registrar ingreso'}
          </Button>
          <p className="text-xs text-ink-faint">
            El sistema crea automáticamente los rollos individuales (uno por cada unidad del total).
          </p>
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Factura {resultado.numeroFactura} — {resultado.rollos.length} rollos creados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {resultado.rollos.map((r) => (
                <li key={r.idRolloPapel} className="flex items-center justify-between rounded-md bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                  <span className="font-mono">
                    {resultado.numeroFactura}-{resultado.rollos.length}-{r.secuencia}
                  </span>
                  <span className="text-ink-muted">
                    {r.tipoPapel.nombre}
                    {r.yardasIniciales ? ` · ${r.yardasIniciales} yd` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
