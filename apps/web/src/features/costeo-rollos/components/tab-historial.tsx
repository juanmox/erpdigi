import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { costeoRollosApi } from '../api'

const TODAS = '__todas__'

/** dd/mm/aaaa hh:mm en hora de Guatemala, o "—" si no hay fecha. */
function fecha(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

/**
 * Historial de montajes: qué rollo estuvo en qué impresora, quién lo montó y
 * quién lo cerró.
 *
 * El Panel de estado solo muestra el montaje VIGENTE de cada impresora, así que
 * al desmontar el registro desaparecía de la vista aunque quedara guardado. Esta
 * pestaña es donde se ve lo ya cerrado.
 *
 * "Cambio de turno" marca los montajes que cerró alguien distinto del que los
 * montó. Lo normal es que sea la misma persona —cada operario tiene su impresora
 * asignada—, así que la marca sirve para ubicar rápido las excepciones.
 */
export function TabHistorial() {
  const [idImpresora, setIdImpresora] = useState(TODAS)

  const { data: impresoras } = useQuery({
    queryKey: ['costeo-rollos', 'impresoras'],
    queryFn: () => costeoRollosApi.listarImpresoras(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['costeo-rollos', 'montajes', idImpresora],
    queryFn: () =>
      costeoRollosApi.historialMontajes(idImpresora === TODAS ? undefined : Number(idImpresora)),
  })

  const montajes = data?.montajes ?? []

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {montajes.length} montaje(s), del más reciente al más antiguo
        </p>
        <Select value={idImpresora} onValueChange={setIdImpresora}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder="Impresora" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas las impresoras</SelectItem>
            {impresoras?.map((i) => (
              <SelectItem key={i.idImpresora} value={String(i.idImpresora)}>
                {i.codigo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[10%]">Impresora</TableHead>
              <TableHead className="w-[18%]">Rollo</TableHead>
              <TableHead className="w-[18%]">Montó</TableHead>
              <TableHead className="w-[18%]">Desmontó</TableHead>
              <TableHead className="w-[12%] text-right">Consumo</TableHead>
              <TableHead className="w-[12%] text-right">Yardas finales</TableHead>
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
            {!isLoading && montajes.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground text-center">
                  No hay montajes registrados todavía.
                </TableCell>
              </TableRow>
            )}
            {montajes.map((m) => (
              <TableRow key={m.idMontajeRollo}>
                <TableCell className="font-medium">{m.impresora.codigo}</TableCell>
                <TableCell className="break-words whitespace-normal">
                  <div className="font-mono text-xs">{m.rollo.codigo}</div>
                  <div className="text-muted-foreground text-xs">{m.rollo.tipoPapel}</div>
                </TableCell>
                <TableCell className="break-words whitespace-normal">
                  <div>{m.montadoPor?.nombreCompleto ?? '—'}</div>
                  <div className="text-muted-foreground text-xs">{fecha(m.montadoEn)}</div>
                </TableCell>
                <TableCell className="break-words whitespace-normal">
                  {m.desmontadoEn ? (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {m.desmontadoPor?.nombreCompleto ?? '—'}
                        {/* Solo se marca la excepción; lo normal no necesita etiqueta. */}
                        {m.cambioDeTurno && (
                          <Badge variant="secondary" className="text-[10px]">
                            Cambio de turno
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">{fecha(m.desmontadoEn)}</div>
                    </>
                  ) : (
                    <Badge>Montado ahora</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.consumoEsteMontaje.toFixed(2)} yd
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.yardasFinales != null ? `${m.yardasFinales.toFixed(2)} yd` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
