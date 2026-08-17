import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { costeoOrdenesApi } from '@/features/costeo-ordenes/api'
import { costeoRollosApi } from '@/features/costeo-rollos/api'
import { ApiError } from '@/lib/api'
import { normalizarCodigoCosteo } from '@/lib/codigos-costeo'
import { costeoReposicionesApi } from './api'
import { ModalAnular } from './components/modal-anular'
import { PanelImpresoras } from './components/panel-impresoras'
import { imprimirReposicion } from './imprimir'
import type { Reposicion } from './types'

const HORA_LOCAL = () => {
  const ahora = new Date()
  ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset())
  return ahora.toISOString().slice(0, 16)
}

const SIN_VALOR = '__ninguno__'

function campoVacio() {
  return {
    fecha: HORA_LOCAL(),
    idDepartamento: '',
    idDefecto: '',
    bodegaSac: '',
    idImpresora: '',
    yardasPapel: '',
    idCalandra: '',
    idInsumoTela: '',
    yardasTela: '',
    comentario: '',
  }
}

export function ReposicionesPage() {
  const queryClient = useQueryClient()
  const { usuario, tienePermiso } = useAuth()
  const puedeAnular = tienePermiso('costeo.reposicion.anular')

  const [codigoOp, setCodigoOp] = useState('')
  const [opBuscada, setOpBuscada] = useState<string | null>(null)
  const [buscandoOp, setBuscandoOp] = useState(false)
  const [errorOp, setErrorOp] = useState<string | null>(null)
  const [ordenInfo, setOrdenInfo] = useState<{ idOrdenProduccion: number; cliente: string | null; lineaProducto: string | null } | null>(null)

  const [campos, setCampos] = useState(campoVacio())
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [ultimaRegistrada, setUltimaRegistrada] = useState<Reposicion | null>(null)
  const [reposicionAnular, setReposicionAnular] = useState<Reposicion | null>(null)

  const { data: departamentos } = useQuery({ queryKey: ['costeo-reposiciones', 'departamentos'], queryFn: () => costeoReposicionesApi.departamentos() })
  const { data: defectos } = useQuery({ queryKey: ['costeo-reposiciones', 'defectos'], queryFn: () => costeoReposicionesApi.defectos() })
  const { data: calandras } = useQuery({ queryKey: ['costeo-reposiciones', 'calandras'], queryFn: () => costeoReposicionesApi.calandras() })
  const { data: insumosTela } = useQuery({ queryKey: ['costeo-reposiciones', 'insumos-tela'], queryFn: () => costeoReposicionesApi.insumosTela() })
  const { data: impresoras } = useQuery({
    queryKey: ['costeo-rollos', 'impresoras'],
    queryFn: () => costeoRollosApi.listarImpresoras(),
  })
  const { data: siguienteNumero } = useQuery({
    queryKey: ['costeo-reposiciones', 'siguiente-numero', opBuscada],
    queryFn: () => costeoReposicionesApi.siguienteNumero(opBuscada!),
    enabled: !!opBuscada,
  })
  const { data: reposiciones, refetch: refetchReposiciones } = useQuery({
    queryKey: ['costeo-reposiciones', 'listar', ordenInfo?.idOrdenProduccion],
    queryFn: () => costeoReposicionesApi.listar(ordenInfo!.idOrdenProduccion),
    enabled: !!ordenInfo,
  })

  async function buscarOp() {
    if (!codigoOp.trim()) return
    setBuscandoOp(true)
    setErrorOp(null)
    setOrdenInfo(null)
    setOpBuscada(null)
    try {
      const orden = await costeoOrdenesApi.buscarPorCodigo(normalizarCodigoCosteo(codigoOp, 'OP'))
      setOrdenInfo({
        idOrdenProduccion: orden.idOrdenProduccion,
        cliente: orden.cliente?.nombre ?? null,
        lineaProducto: orden.lineaProducto?.nombre ?? null,
      })
      setOpBuscada(orden.codigo)
      setCampos(campoVacio())
      setExito(null)
    } catch (err) {
      setErrorOp(err instanceof ApiError ? err.message : 'Error al buscar la OP')
    } finally {
      setBuscandoOp(false)
    }
  }

  function set<K extends keyof ReturnType<typeof campoVacio>>(campo: K, valor: string) {
    setCampos((prev) => ({ ...prev, [campo]: valor }))
  }

  async function registrar(otraParaMismaOp: boolean) {
    if (!opBuscada) return
    if (!campos.idDepartamento || !campos.idDefecto) {
      setErrorForm('Departamento y defecto son obligatorios')
      return
    }
    setGuardando(true)
    setErrorForm(null)
    try {
      const resultado = await costeoReposicionesApi.crear({
        fecha: new Date(campos.fecha).toISOString(),
        codigoOp: opBuscada,
        idDepartamento: Number(campos.idDepartamento),
        idDefecto: Number(campos.idDefecto),
        bodegaSac: campos.bodegaSac || undefined,
        yardasPapel: campos.yardasPapel ? Number(campos.yardasPapel) : undefined,
        idImpresora: campos.idImpresora ? Number(campos.idImpresora) : undefined,
        idCalandra: campos.idCalandra ? Number(campos.idCalandra) : undefined,
        idInsumoTela: campos.idInsumoTela ? Number(campos.idInsumoTela) : undefined,
        yardasTela: campos.yardasTela ? Number(campos.yardasTela) : undefined,
        comentario: campos.comentario || undefined,
      })
      setExito(`Reposición ${resultado.codigoRepo} registrada correctamente.`)
      setUltimaRegistrada(resultado)
      setCampos(campoVacio())
      queryClient.invalidateQueries({ queryKey: ['costeo-reposiciones', 'siguiente-numero'] })
      queryClient.invalidateQueries({ queryKey: ['costeo-rollos'] })
      refetchReposiciones()
      if (!otraParaMismaOp) {
        setOpBuscada(null)
        setOrdenInfo(null)
        setCodigoOp('')
      }
    } catch (err) {
      setErrorForm(err instanceof ApiError ? err.message : 'Error al registrar la reposición')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-ink">Reposiciones</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Orden de Producción</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Ej: 159 (o 26OP000159 completo)"
              value={codigoOp}
              onChange={(e) => setCodigoOp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarOp()}
              className="max-w-xs font-mono"
              autoFocus
            />
            <Button variant="outline" disabled={buscandoOp} onClick={buscarOp}>
              {buscandoOp ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>
          {errorOp && (
            <Alert variant="destructive">
              <AlertDescription>{errorOp}</AlertDescription>
            </Alert>
          )}
          {ordenInfo && (
            <div className="grid grid-cols-2 gap-3 rounded-md bg-black/[0.03] p-3 text-sm dark:bg-white/[0.04]">
              <div>
                <div className="text-ink-faint">Cliente</div>
                <div className="font-medium text-ink">{ordenInfo.cliente ?? '—'}</div>
              </div>
              <div>
                <div className="text-ink-faint">Línea de producto</div>
                <div className="font-medium text-ink">{ordenInfo.lineaProducto ?? '—'}</div>
              </div>
              {siguienteNumero && (
                <div className="col-span-2 text-xs text-ink-faint">
                  Siguiente número sugerido: <span className="font-mono font-medium text-ink">R{String(siguienteNumero.siguienteNumero).padStart(2, '0')}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {opBuscada && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Datos de la reposición</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {exito && (
              <Alert>
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>{exito}</span>
                  {ultimaRegistrada && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => imprimirReposicion(ultimaRegistrada, usuario?.nombreCompleto ?? '')}
                    >
                      Imprimir
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {errorForm && (
              <Alert variant="destructive">
                <AlertDescription>{errorForm}</AlertDescription>
              </Alert>
            )}

            <div>
              <Label className="mb-1 block text-xs">Fecha y hora</Label>
              <Input type="datetime-local" value={campos.fecha} onChange={(e) => set('fecha', e.target.value)} />
            </div>

            <div>
              <Label className="mb-1 block text-xs">Departamento</Label>
              <Select value={campos.idDepartamento} onValueChange={(v) => set('idDepartamento', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {departamentos?.map((d) => (
                    <SelectItem key={d.idDepartamento} value={String(d.idDepartamento)}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1 block text-xs">Defecto</Label>
              <Select value={campos.idDefecto} onValueChange={(v) => set('idDefecto', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {defectos?.map((d) => (
                    <SelectItem key={d.idDefecto} value={String(d.idDefecto)}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1 block text-xs">Bodega SAC</Label>
              <Input value={campos.bodegaSac} onChange={(e) => set('bodegaSac', e.target.value)} />
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-medium text-ink-muted">Papel (opcional)</p>
              <div className="space-y-3">
                <div>
                  <Label className="mb-1 block text-xs">Impresora</Label>
                  <Select value={campos.idImpresora || SIN_VALOR} onValueChange={(v) => set('idImpresora', v === SIN_VALOR ? '' : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sin impresora" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_VALOR}>Sin impresora</SelectItem>
                      {impresoras?.map((i) => (
                        <SelectItem key={i.idImpresora} value={String(i.idImpresora)}>
                          {i.codigo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-ink-faint">El tipo de papel se autocompleta del rollo montado en esa impresora al guardar.</p>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Yardas papel</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={campos.yardasPapel}
                    onChange={(e) => set('yardasPapel', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Calandra</Label>
                  <Select value={campos.idCalandra || SIN_VALOR} onValueChange={(v) => set('idCalandra', v === SIN_VALOR ? '' : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sin calandra" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_VALOR}>Sin calandra</SelectItem>
                      {calandras?.map((c) => (
                        <SelectItem key={c.idCalandra} value={String(c.idCalandra)}>
                          {c.codigo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-medium text-ink-muted">Tela (opcional)</p>
              <div className="space-y-3">
                <div>
                  <Label className="mb-1 block text-xs">Insumo de tela</Label>
                  <Select value={campos.idInsumoTela || SIN_VALOR} onValueChange={(v) => set('idInsumoTela', v === SIN_VALOR ? '' : v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sin tela" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_VALOR}>Sin tela</SelectItem>
                      {insumosTela?.map((i) => (
                        <SelectItem key={i.idInsumo} value={String(i.idInsumo)}>
                          {i.descripcion}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Yardas tela</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={campos.yardasTela}
                    onChange={(e) => set('yardasTela', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-1 block text-xs">Comentario</Label>
              <Textarea
                value={campos.comentario}
                onChange={(e) => set('comentario', e.target.value)}
                placeholder="Contexto adicional: qué pasó, instrucciones, responsables, etc."
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" disabled={guardando} onClick={() => registrar(true)}>
                {guardando ? 'Guardando…' : 'Registrar y capturar otra'}
              </Button>
              <Button variant="outline" className="flex-1" disabled={guardando} onClick={() => registrar(false)}>
                Registrar y salir
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {opBuscada && reposiciones && reposiciones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reposiciones de esta OP</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Defecto</TableHead>
                  <TableHead>Yd papel</TableHead>
                  <TableHead>Yd tela</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reposiciones.map((r) => (
                  <TableRow key={r.idReposicion}>
                    <TableCell className="font-mono">{r.codigoRepo}</TableCell>
                    <TableCell className="whitespace-normal">{r.defecto.nombre}</TableCell>
                    <TableCell>{r.yardasPapel}</TableCell>
                    <TableCell>{r.yardasTela}</TableCell>
                    <TableCell>
                      {r.anuladoEn ? <Badge variant="secondary">Anulada</Badge> : <Badge>Activa</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => imprimirReposicion(r, usuario?.nombreCompleto ?? '')}
                        >
                          Imprimir
                        </Button>
                        {!r.anuladoEn && puedeAnular && (
                          <Button variant="ghost" size="sm" onClick={() => setReposicionAnular(r)}>
                            Anular
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <PanelImpresoras
          idImpresoraSeleccionada={campos.idImpresora}
          onSeleccionar={(idImpresora) => set('idImpresora', String(idImpresora))}
        />
      </div>
      </div>

      <ModalAnular
        reposicion={reposicionAnular}
        open={!!reposicionAnular}
        onOpenChange={(open) => !open && setReposicionAnular(null)}
        onAnulada={() => {
          refetchReposiciones()
          queryClient.invalidateQueries({ queryKey: ['costeo-rollos'] })
        }}
      />
    </div>
  )
}
