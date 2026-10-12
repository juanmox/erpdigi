import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { GrupoColapsable } from '@/components/shared/grupo-colapsable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { costeoRollosApi } from '../api'
import type { ArticuloIngresado } from '../types'

const yd = (n: number | null) =>
  n == null
    ? '—'
    : n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const instante = (iso: string) =>
  new Date(iso).toLocaleString('es-GT', {
    timeZone: 'America/Guatemala',
    dateStyle: 'short',
    timeStyle: 'short',
  })

const dia = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/** Los estados de los rollos de un artículo, como chips legibles. */
const ETIQUETA_ESTADO: Record<string, string> = {
  EN_BODEGA: 'en bodega',
  MONTADO: 'montado',
  AGOTADO: 'agotado',
  DESCARTADO: 'descartado',
  CONSUMIDO_FUERA: 'consumido fuera',
}

function Articulo({ a }: { a: ArticuloIngresado }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-ink text-sm font-medium">{a.tipoPapel.nombre}</span>
        <span className="text-ink-muted text-xs">
          {a.totalRollos} rollo(s)
          {a.yardasPorRollo != null && <> · {yd(a.yardasPorRollo)} yd c/u</>}
          {a.yardasPorRollo == null && <> · {yd(a.yardasTotales)} yd en total</>}
          {a.costoUnitario != null && <> · Q {a.costoUnitario} / yd</>}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {Object.entries(a.estados).map(([estado, n]) => (
          <Badge
            key={estado}
            variant={estado === 'EN_BODEGA' ? 'secondary' : 'outline'}
            className="text-[10px]"
          >
            {n} {ETIQUETA_ESTADO[estado] ?? estado}
          </Badge>
        ))}
        {!a.editable && (
          <span className="text-ink-faint text-[10px]">· ya no se puede corregir</span>
        )}
      </div>
      <div className="text-ink-faint mt-1 text-[11px]">
        Cargado {instante(a.creadoEn)}
        {a.creadoPor && <> por {a.creadoPor}</>}
      </div>
    </div>
  )
}

/**
 * Lo que se ha cargado a bodega, agrupado por número de factura.
 *
 * Vive en la misma pestaña que el formulario de ingreso a propósito: la
 * pregunta "¿ya cargué esta factura?" aparece justo después de cargarla, y
 * mandar a otra pantalla para responderla es lo que hacía que nadie la
 * respondiera.
 *
 * El agrupado por número no es decorativo: desde que una factura puede traer
 * varios artículos (uno por tipo de papel), verlos juntos es lo que permite
 * contrastar la factura del proveedor contra el papel que llegó con ella.
 */
export function HistorialIngresos() {
  const [texto, setTexto] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  // Se aplica al presionar Buscar y no en cada tecla: con campos de fecha,
  // recargar por tecla dispara consultas contra rangos a medio escribir.
  const [consulta, setConsulta] = useState<{
    texto?: string
    desde?: string
    hasta?: string
  }>({})

  const { data, isFetching, error } = useQuery({
    queryKey: ['costeo-rollos', 'ingresos', consulta],
    queryFn: () => costeoRollosApi.historialIngresos(consulta),
  })

  function buscar() {
    setConsulta({
      texto: texto.trim() || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
    })
  }

  function limpiar() {
    setTexto('')
    setDesde('')
    setHasta('')
    setConsulta({})
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lo que se ha cargado a bodega</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="mb-1 block text-xs">Número de factura</Label>
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
              placeholder="Parte del número"
              className="w-44"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Cargado desde</Label>
            <Input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">hasta</Label>
            <Input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" size="sm" onClick={buscar}>
            Buscar
          </Button>
          {(consulta.texto || consulta.desde || consulta.hasta) && (
            <Button variant="ghost" size="sm" onClick={limpiar}>
              Limpiar
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof ApiError ? error.message : 'No se pudo cargar el historial'}
            </AlertDescription>
          </Alert>
        )}

        {data && (
          <p className="text-ink-faint text-xs">
            {data.facturas.length} factura(s) · {data.articulos} artículo(s)
            {isFetching && <span className="ml-1">· actualizando…</span>}
            {data.truncado && (
              <>
                {' '}
                · se muestran los {data.limite} más recientes; usá los filtros para ver más atrás
              </>
            )}
          </p>
        )}

        <div className="space-y-1.5">
          {data?.facturas.map((f) => (
            <GrupoColapsable
              key={`${f.numeroFactura}-${consulta.texto ?? ''}`}
              // Una factura con un solo artículo no gana nada escondida; con
              // varios, el grupo es justamente lo que hay que ver primero.
              defaultAbierto={data.facturas.length <= 3}
              titulo={
                <span className="normal-case">
                  Factura <span className="text-ink font-semibold">{f.numeroFactura}</span>
                  <span className="text-ink-faint font-normal">
                    {' '}
                    · {dia(f.fecha)} · {f.totalRollos} rollo(s) ·{' '}
                    {f.articulos.length === 1
                      ? '1 artículo'
                      : `${f.articulos.length} artículos`}
                  </span>
                </span>
              }
            >
              <div className="space-y-1.5 pl-5">
                {f.articulos.map((a) => (
                  <Articulo key={a.idFacturaPapel} a={a} />
                ))}
              </div>
            </GrupoColapsable>
          ))}
          {data?.facturas.length === 0 && (
            <p className="text-ink-faint rounded-md border border-border p-5 text-center text-sm">
              {consulta.texto || consulta.desde || consulta.hasta
                ? 'Ninguna factura coincide con esos filtros.'
                : 'Todavía no se ha cargado ninguna factura de papel.'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
