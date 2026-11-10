import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { costeoMaterialesApi } from '../api'
import type { CambioGlobal, FiltrosHistorial } from '../types'
import { AccionBadge, CambiosDeEvento } from './historial-comun'
import { ETIQUETA_ACCION, fechaHora } from './historial-etiquetas'

/** Las acciones que se pueden filtrar; `CARGA` no es una fila del historial. */
const ACCIONES = (Object.keys(ETIQUETA_ACCION) as (keyof typeof ETIQUETA_ACCION)[]).filter((a) => a !== 'CARGA')
const TODAS = 'todas'

/** Hoy en Guatemala, como yyyy-mm-dd. */
const hoyGT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })
/** Hace `n` días, en Guatemala. */
const haceDias = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })
}

/**
 * Todo lo que se ha modificado en la explosión de materiales, del más reciente
 * al más antiguo: quién, cuándo, qué cambió y por qué. Abre con los últimos 30
 * días; las fechas son las del CAMBIO, no las del ítem.
 */
export function TabHistorial({ onVerItem }: { onVerItem: (id: number) => void }) {
  const inicial: FiltrosHistorial = { desde: haceDias(30), hasta: hoyGT() }
  const [desde, setDesde] = useState(inicial.desde ?? '')
  const [hasta, setHasta] = useState(inicial.hasta ?? '')
  const [accion, setAccion] = useState(TODAS)
  const [usuario, setUsuario] = useState('')
  const [op, setOp] = useState('')
  const [plan, setPlan] = useState('')
  const [insumo, setInsumo] = useState('')
  const [aplicados, setAplicados] = useState<FiltrosHistorial>(inicial)

  const { data, isLoading, error } = useQuery({
    queryKey: ['costeo-materiales', 'historial', aplicados],
    queryFn: () => costeoMaterialesApi.historial(aplicados),
  })

  function ver() {
    setAplicados({
      desde: desde || undefined,
      hasta: hasta || undefined,
      accion: accion === TODAS ? undefined : accion,
      usuario: usuario.trim() || undefined,
      op: op.trim() || undefined,
      ordenPlanificacion: plan.trim() || undefined,
      insumo: insumo.trim() || undefined,
    })
  }
  function limpiar() {
    setDesde('')
    setHasta('')
    setAccion(TODAS)
    setUsuario('')
    setOp('')
    setPlan('')
    setInsumo('')
    setAplicados({})
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div>
              <Label className="mb-1 block text-xs">Cambios desde</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Cambios hasta</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Qué se hizo</Label>
              <Select value={accion} onValueChange={setAccion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODAS}>Todo</SelectItem>
                  {ACCIONES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ETIQUETA_ACCION[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Quién lo hizo</Label>
              <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Nombre o parte" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">OP</Label>
              <Input value={op} onChange={(e) => setOp(e.target.value)} placeholder="25OP021463 o parte" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Orden de planificación</Label>
              <Input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="25P0000294" />
            </div>
            <div className="col-span-2">
              <Label className="mb-1 block text-xs">Insumo (código o descripción)</Label>
              <Input value={insumo} onChange={(e) => setInsumo(e.target.value)} placeholder="ZIPPER, 6150116…" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={limpiar}>
              Limpiar
            </Button>
            <Button onClick={ver}>Ver</Button>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-destructive text-sm">{error instanceof ApiError ? error.message : 'No se pudo cargar el historial'}</p>}
      {isLoading && <p className="text-muted-foreground text-sm">Cargando…</p>}

      {data && (
        <p className="text-sm">
          <strong>{data.items.length}</strong> cambio(s)
          {data.truncado && (
            <span className="text-amber-700 dark:text-amber-400"> de {data.total} (se muestran los más recientes: afiná los filtros)</span>
          )}
        </p>
      )}
      {data && data.items.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">No hay cambios con esos filtros.</p>
      )}

      {data && data.items.length > 0 && <ListaCambios items={data.items} onVerItem={onVerItem} />}
    </div>
  )
}

function ListaCambios({ items, onVerItem }: { items: CambioGlobal[]; onVerItem: (id: number) => void }) {
  return (
    <>
      {/* Escritorio: tabla. */}
      <div className="hidden overflow-x-auto xl:block">
        <Table className="min-w-[1000px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Cuándo</TableHead>
              <TableHead className="w-44">Qué se hizo</TableHead>
              <TableHead className="w-36">Quién</TableHead>
              <TableHead>Ítem</TableHead>
              <TableHead>Qué cambió</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.idHistorial}>
                <TableCell className="text-xs whitespace-nowrap">{fechaHora(c.fecha)}</TableCell>
                <TableCell>
                  <AccionBadge accion={c.accion} />
                </TableCell>
                <TableCell className="text-sm">{c.usuario}</TableCell>
                <TableCell className="max-w-xs text-xs whitespace-normal break-words">
                  <span className="font-mono">{c.codigoOp}</span> · <span className="font-mono">{c.ordenPlanificacion}</span>
                  <div>
                    <span className="font-mono">{c.insumoCodigo}</span> {c.insumoDescripcion}
                  </div>
                </TableCell>
                <TableCell className="max-w-sm whitespace-normal">
                  <CambiosDeEvento cambios={c.cambios} />
                </TableCell>
                <TableCell className="max-w-xs text-sm whitespace-normal break-words">{c.motivo ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => onVerItem(c.idMaterialOp)}>
                    Ver ítem
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Tablet y teléfono: tarjetas. */}
      <div className="grid gap-2 md:grid-cols-2 xl:hidden">
        {items.map((c) => (
          <div key={c.idHistorial} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <AccionBadge accion={c.accion} />
              <span className="text-sm font-medium">{c.usuario}</span>
              <span className="text-muted-foreground text-xs">{fechaHora(c.fecha)}</span>
            </div>
            <div className="mt-2 text-xs break-words">
              <span className="font-mono">{c.codigoOp}</span> · <span className="font-mono">{c.ordenPlanificacion}</span>
              <div>
                <span className="font-mono">{c.insumoCodigo}</span> {c.insumoDescripcion}
              </div>
            </div>
            {c.cambios.length > 0 && (
              <div className="mt-2">
                <CambiosDeEvento cambios={c.cambios} />
              </div>
            )}
            {c.motivo && (
              <p className="bg-muted/60 mt-2 rounded-md px-2.5 py-1.5 text-sm break-words">
                <span className="text-muted-foreground">Motivo: </span>
                {c.motivo}
              </p>
            )}
            <div className="mt-2 text-right">
              <Button size="sm" variant="ghost" onClick={() => onVerItem(c.idMaterialOp)}>
                Ver ítem
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
