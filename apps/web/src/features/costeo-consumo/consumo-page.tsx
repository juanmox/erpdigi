import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/auth-context'
import { ApiError } from '@/lib/api'
import { normalizarCodigoCosteo } from '@/lib/codigos-costeo'
import { costeoConsumoApi } from './api'
import { TarjetaLinea } from './components/tarjeta-linea'

type Filtro = 'pendientes' | 'todas'

/**
 * Envío de órdenes ya impresas: descuenta el papel consumido por OP.
 * Reemplaza la "Forma 2" legacy.
 *
 * Pensada para los tres tamaños con un solo flujo, no tres pantallas:
 * la búsqueda y la cabecera de la OP quedan arriba, y las líneas son tarjetas
 * que reflowean — 1 columna en teléfono, 2 en tablet, 3 en escritorio. La
 * unidad de decisión es la línea, así que cada tarjeta se basta a sí misma
 * para responder "¿es ésta?" sin depender de una tabla ancha.
 */
export function ConsumoPage() {
  const { tienePermiso } = useAuth()
  const puedeCapturar = tienePermiso('costeo.consumo.capturar')
  const queryClient = useQueryClient()

  const [texto, setTexto] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const { data, isFetching, error } = useQuery({
    queryKey: ['consumo', 'orden', codigo],
    queryFn: () => costeoConsumoApi.obtenerOrden(codigo!),
    enabled: !!codigo,
    retry: false,
  })

  const capturar = useMutation({
    mutationFn: (idLineaProduccion: number) => costeoConsumoApi.capturar({ idLineaProduccion }),
    onSuccess: (r) => {
      setMensaje({
        tipo: 'ok',
        texto:
          r.creadas > 0
            ? `Línea ${r.codigoLine}: ${r.creadas} talla(s) enviada(s)`
            : `Línea ${r.codigoLine} ya estaba enviada (${r.yaEstaban.join(', ')})`,
      })
      queryClient.invalidateQueries({ queryKey: ['consumo', 'orden'] })
      // El consumo descuenta del rollo montado: el panel de Gestión de Rollos
      // muestra papel disponible y quedaría desactualizado.
      queryClient.invalidateQueries({ queryKey: ['rollos'] })
    },
    onError: (e) =>
      setMensaje({
        tipo: 'error',
        texto: e instanceof ApiError ? e.message : 'No se pudo registrar el consumo',
      }),
  })

  function buscar() {
    const t = texto.trim()
    if (!t) return
    setMensaje(null)
    setCodigo(normalizarCodigoCosteo(t, 'OP'))
  }

  const lineas = useMemo(() => {
    const todas = data?.lineas ?? []
    return filtro === 'pendientes' ? todas.filter((l) => !l.completa) : todas
  }, [data, filtro])

  const resumen = useMemo(() => {
    const todas = data?.lineas ?? []
    return {
      total: todas.length,
      completas: todas.filter((l) => l.completa).length,
      bloqueadas: todas.filter((l) => !l.completa && l.sinEstandar.length > 0).length,
      enviables: todas.filter((l) => l.enviable).length,
    }
  }, [data])

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Envío de órdenes impresas</h1>
        <p className="text-muted-foreground text-sm">
          Descuenta el papel consumido por orden de producción.
        </p>
      </div>

      {/* Búsqueda: acepta solo el correlativo (159) o el código completo. */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Label htmlFor="op" className="mb-1 block text-xs">
            Orden de producción
          </Label>
          <Input
            id="op"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            placeholder="26OP010345 o solo 10345"
            className="font-mono"
            inputMode="numeric"
          />
        </div>
        <Button onClick={buscar} disabled={!texto.trim() || isFetching}>
          {isFetching ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof ApiError ? error.message : 'No se pudo cargar la orden'}
          </AlertDescription>
        </Alert>
      )}
      {mensaje && (
        <Alert variant={mensaje.tipo === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{mensaje.texto}</AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          {/* Cabecera de la OP: identifica lo que se está por descontar y se
              queda a la vista mientras se recorren las líneas. */}
          <div className="bg-card sticky top-0 z-10 space-y-1 rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-lg font-bold">{data.orden.codigo}</span>
              <span className="text-sm">{data.orden.cliente?.nombre ?? 'Sin cliente'}</span>
              {data.orden.ordenCompra && (
                <span className="text-muted-foreground text-xs">OC {data.orden.ordenCompra}</span>
              )}
            </div>
            <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
              <span>{resumen.total} líneas</span>
              <span>{resumen.enviables} por enviar</span>
              {resumen.completas > 0 && <span>{resumen.completas} enviadas</span>}
              {resumen.bloqueadas > 0 && (
                <span className="text-destructive">{resumen.bloqueadas} sin estándar</span>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            {(['pendientes', 'todas'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filtro === f ? 'default' : 'outline'}
                onClick={() => setFiltro(f)}
              >
                {f === 'pendientes' ? 'Pendientes' : 'Todas'}
              </Button>
            ))}
          </div>

          {lineas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {filtro === 'pendientes'
                ? 'Todas las líneas de esta orden ya fueron enviadas.'
                : 'Esta orden no tiene líneas.'}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lineas.map((l) => (
                <TarjetaLinea
                  key={l.idLineaProduccion}
                  linea={l}
                  puedeCapturar={puedeCapturar}
                  enviando={capturar.isPending && capturar.variables === l.idLineaProduccion}
                  onEnviar={() => capturar.mutate(l.idLineaProduccion)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
