import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { costeoRollosApi } from '../api'
import type { FacturaConRollos, RolloDeFactura } from '../types'

// El tipo de papel no está acá: es del ARTÍCULO entero (ver abajo), no de cada
// rollo. Lo que sí varía rollo por rollo son las yardas y el costo.
type FilaEdicion = { yardasIniciales: string; costoUnitario: string }

export function TabCorregirIngreso() {
  const queryClient = useQueryClient()
  const { tienePermiso } = useAuth()
  // Permiso propio: BODEGUERO tiene `costeo.rollo.ingresar` y esto, mal usado,
  // saca rollos buenos de circulación.
  const puedeMarcarFuera = tienePermiso('costeo.rollo.marcar_consumido_fuera')
  const [rangoDesde, setRangoDesde] = useState('')
  const [rangoHasta, setRangoHasta] = useState('')
  const [motivoFuera, setMotivoFuera] = useState('')
  const [marcando, setMarcando] = useState(false)
  const [msgFuera, setMsgFuera] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const { data: tiposPapel } = useQuery({
    queryKey: ['costeo-rollos', 'tipos-papel'],
    queryFn: () => costeoRollosApi.listarTiposPapel(),
  })

  const [numeroBuscar, setNumeroBuscar] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  // Un número de factura puede tener varios artículos (uno por tipo de papel),
  // así que la búsqueda devuelve una lista y hay que elegir cuál corregir.
  // Quedarse con el primero sin preguntar sería editar uno creyendo editar otro.
  const [candidatas, setCandidatas] = useState<FacturaConRollos[]>([])
  const [factura, setFactura] = useState<FacturaConRollos | null>(null)

  const [numeroFactura, setNumeroFactura] = useState('')
  const [idTipoPapel, setIdTipoPapel] = useState('')
  const [fecha, setFecha] = useState('')
  const [filas, setFilas] = useState<Record<number, FilaEdicion>>({})
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  useEffect(() => {
    if (!factura) return
    setNumeroFactura(factura.numeroFactura)
    setIdTipoPapel(String(factura.idTipoPapel))
    setFecha(factura.fecha.slice(0, 10))
    const nuevasFilas: Record<number, FilaEdicion> = {}
    for (const r of factura.rollos) {
      nuevasFilas[r.idRolloPapel] = {
        yardasIniciales: r.yardasIniciales ?? '',
        costoUnitario: r.costoUnitario ?? '',
      }
    }
    setFilas(nuevasFilas)
    setExito(null)
    setError(null)
  }, [factura])

  /**
   * Vuelve a traer los artículos de ese número y se queda en el mismo que
   * estaba abierto. Hace falta porque la búsqueda devuelve varios y después de
   * guardar o de marcar rollos hay que refrescar sin perder de vista cuál era.
   */
  async function recargar(numero: string, idFacturaPapel: number) {
    const { facturas } = await costeoRollosApi.buscarFacturas(numero)
    setCandidatas(facturas)
    setFactura(facturas.find((f) => f.idFacturaPapel === idFacturaPapel) ?? facturas[0] ?? null)
  }

  async function marcarFuera(marcar: boolean) {
    if (!factura) return
    setMarcando(true)
    setMsgFuera(null)
    try {
      const r = await costeoRollosApi.marcarConsumidoFuera({
        idFacturaPapel: factura.idFacturaPapel,
        desde: Number(rangoDesde),
        hasta: Number(rangoHasta),
        marcar,
        motivo: marcar ? motivoFuera.trim() : undefined,
      })
      setMsgFuera({
        tipo: 'ok',
        texto:
          `${r.afectados} rollo(s) ${marcar ? 'fuera de circulación' : 'de vuelta en bodega'}` +
          // Decirlo evita que alguien crea que marcó 20 cuando 5 ya lo estaban.
          (r.sinCambio > 0 ? ` · ${r.sinCambio} ya estaban así` : ''),
      })
      // El panel y la lista de disponibles cambian: un rollo menos para montar.
      await queryClient.invalidateQueries({ queryKey: ['rollos'] })
      await recargar(factura.numeroFactura, factura.idFacturaPapel)
      if (marcar) setMotivoFuera('')
    } catch (e) {
      setMsgFuera({
        tipo: 'error',
        texto: e instanceof ApiError ? e.message : 'No se pudo cambiar el estado de los rollos',
      })
    } finally {
      setMarcando(false)
    }
  }

  async function buscar() {
    if (!numeroBuscar.trim()) return
    setBuscando(true)
    setErrorBusqueda(null)
    setFactura(null)
    setCandidatas([])
    try {
      const { facturas } = await costeoRollosApi.buscarFacturas(numeroBuscar.trim())
      setCandidatas(facturas)
      // Con un solo artículo no hay nada que elegir: se abre directo.
      setFactura(facturas.length === 1 ? facturas[0] : null)
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
        idTipoPapel: Number(idTipoPapel) !== factura.idTipoPapel ? Number(idTipoPapel) : undefined,
        fecha: fecha ? new Date(fecha).toISOString() : undefined,
        rollos: factura.rollos.map((r: RolloDeFactura) => ({
          idRolloPapel: r.idRolloPapel,
          yardasIniciales: filas[r.idRolloPapel].yardasIniciales ? Number(filas[r.idRolloPapel].yardasIniciales) : undefined,
          costoUnitario: filas[r.idRolloPapel].costoUnitario ? Number(filas[r.idRolloPapel].costoUnitario) : undefined,
        })),
      })
      // El número pudo haber cambiado: la lista se rearma con el nuevo.
      await recargar(actualizado.numeroFactura, actualizado.idFacturaPapel)
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

      {candidatas.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Esta factura trae {candidatas.length} artículos — elegí cuál corregir
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-ink-faint text-xs">
              Una misma factura puede traer varios tipos de papel. Cada uno se cargó aparte, con sus
              rollos numerados desde el 1.
            </p>
            <div className="flex flex-wrap gap-2">
              {candidatas.map((c) => (
                <Button
                  key={c.idFacturaPapel}
                  size="sm"
                  variant={factura?.idFacturaPapel === c.idFacturaPapel ? 'default' : 'outline'}
                  onClick={() => setFactura(c)}
                >
                  {c.tipoPapel.nombre} · {c.totalRollos} rollo(s)
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {factura && !factura.editable && (
        <Alert variant="destructive">
          <AlertDescription>
            Esta factura ya tiene (o tuvo) rollos montados — ya no se puede editar desde acá, es un caso excepcional. Si el
            dato original está mal, corregilo directamente en la base de datos.
          </AlertDescription>
        </Alert>
      )}

      {/* Va FUERA del gate de `editable` a propósito: corregir los datos de la
          factura y sacar rollos de circulación son cosas distintas. Una factura
          con un rollo ya montado no se puede corregir, pero sus rollos que
          nunca se usaron sí se pueden marcar. El servidor rechaza uno por uno
          los que tengan historial de montaje. */}
      {factura && puedeMarcarFuera && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sacar rollos de circulación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-ink-faint text-xs">
              Para rollos de esta factura que <strong>ya se gastaron fuera de este ERP</strong> — por
              ejemplo los que se consumieron en el sistema anterior antes de arrancar Costeo. Quedan
              registrados con su costo, pero nadie los puede montar por error. No se puede con un
              rollo que ya se montó acá: ése sí tiene su consumo registrado.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="mb-1 block text-xs">Del rollo #</Label>
                <Input
                  type="number"
                  min={1}
                  value={rangoDesde}
                  onChange={(e) => setRangoDesde(e.target.value)}
                  className="w-24"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">al #</Label>
                <Input
                  type="number"
                  min={1}
                  value={rangoHasta}
                  onChange={(e) => setRangoHasta(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="min-w-[260px] flex-1">
                <Label className="mb-1 block text-xs">Motivo (obligatorio)</Label>
                <Textarea
                  rows={2}
                  value={motivoFuera}
                  onChange={(e) => setMotivoFuera(e.target.value)}
                  placeholder="Consumidos en el sistema anterior antes de arrancar el ERP"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={marcando || !rangoDesde || !rangoHasta || motivoFuera.trim().length < 3}
                onClick={() => void marcarFuera(true)}
              >
                Sacar de circulación
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={marcando || !rangoDesde || !rangoHasta}
                onClick={() => void marcarFuera(false)}
              >
                Revertir
              </Button>
              <span className="text-ink-faint text-xs">
                Revertir los devuelve a bodega. El motivo no hace falta para revertir.
              </span>
            </div>
            {msgFuera && (
              <Alert variant={msgFuera.tipo === 'error' ? 'destructive' : 'default'}>
                <AlertDescription>{msgFuera.texto}</AlertDescription>
              </Alert>
            )}
            {factura.rollos.some((r) => r.estado === 'CONSUMIDO_FUERA') && (
              <p className="text-ink-faint text-xs">
                Fuera de circulación:{' '}
                <strong>
                  {factura.rollos
                    .filter((r) => r.estado === 'CONSUMIDO_FUERA')
                    .map((r) => r.secuencia)
                    .join(', ')}
                </strong>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {factura && factura.editable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Corregir ingreso — {factura.tipoPapel.nombre}, {factura.rollos.length} rollos
            </CardTitle>
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1 block text-xs">Número de factura</Label>
                <Input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Fecha</Label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              {/* Uno solo para todo el artículo, no uno por rollo: todos los
                  rollos de este ingreso son del mismo papel —lo garantiza la
                  base— así que cambiarlo acá los cambia a todos. */}
              <div className="sm:col-span-2">
                <Label className="mb-1 block text-xs">Tipo de papel (de los {factura.rollos.length} rollos)</Label>
                <Select value={idTipoPapel} onValueChange={setIdTipoPapel}>
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
            </div>

            <div className="space-y-2">
              {factura.rollos.map((r) => (
                <div key={r.idRolloPapel} className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-medium text-ink-muted">Rollo #{r.secuencia}</p>
                  <div className="grid grid-cols-2 gap-3">
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
