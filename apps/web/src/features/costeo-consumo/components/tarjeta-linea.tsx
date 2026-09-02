import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { LineaConsumo } from '../types'

/**
 * Una línea de producción lista para enviar. Es la unidad de decisión del
 * operario, así que muestra solo lo que hace falta para responder "¿es ésta?":
 * LINE, item, desarrollo, impresora y las tallas con su cantidad.
 *
 * Deliberadamente NO muestra fechas de cliente/entrega, prioridad, imagen,
 * estatus ni descripción larga: existen en la OP y se ven en Órdenes, pero acá
 * competirían por atención en el momento de descontar papel — y en teléfono son
 * directamente ruido.
 */
export function TarjetaLinea({
  linea,
  onEnviar,
  enviando,
  puedeCapturar,
  seleccionada,
  onSeleccionar,
}: {
  linea: LineaConsumo
  onEnviar: () => void
  enviando: boolean
  puedeCapturar: boolean
  seleccionada: boolean
  onSeleccionar: (v: boolean) => void
}) {
  const bloqueada = linea.sinEstandar.length > 0
  // El enguiamiento que tecleó Diseño contra el que sale de la fórmula. Se
  // avisa solo si difieren de forma apreciable: el valor capturado es esa misma
  // fórmula redondeada a un decimal, así que una diferencia chica es normal.
  const desvioEng = Math.abs(linea.enguiamientoCapturadoYd - linea.totalEnguiamientoYd)
  const avisaEng = linea.enguiamientoCapturadoYd > 0 && desvioEng > 0.15

  return (
    <div
      className={
        'rounded-lg border p-3 ' +
        (linea.completa
          ? 'bg-black/[0.02] dark:bg-white/[0.03]'
          : seleccionada
            ? 'border-primary bg-primary/[0.04]'
            : 'bg-card')
      }
    >
      {/* Sin flex-wrap: con el checkbox adelante, una descripción larga
          empujaba el badge a su propia línea y la tarjeta quedaba descuadrada.
          El badge no se encoge; lo que se angosta es el bloque de texto. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {/* Solo lo enviable se puede seleccionar: marcar algo bloqueado o ya
              enviado solo generaría fallas en el resumen del envío masivo. */}
          {puedeCapturar && linea.enviable && (
            <Checkbox
              checked={seleccionada}
              onCheckedChange={(v) => onSeleccionar(v === true)}
              aria-label={`Seleccionar ${linea.codigoLine}`}
              className="mt-0.5"
            />
          )}
          <div className="min-w-0">
            <div className="font-mono text-sm font-semibold break-all">{linea.codigoLine}</div>
            <div className="text-muted-foreground text-xs break-words">
              {linea.producto.codigo} · Desarrollo {linea.producto.desarrollo}
            </div>
          </div>
        </div>
        <div className="shrink-0">
          {linea.completa ? (
            <Badge variant="secondary">Ya enviada</Badge>
          ) : bloqueada ? (
            <Badge variant="destructive">Falta estándar</Badge>
          ) : (
            <Badge>Pendiente</Badge>
          )}
        </div>
      </div>

      <div className="text-muted-foreground mt-2 text-xs">
        Impresora <strong className="text-foreground">{linea.impresora?.codigo ?? '—'}</strong>
        {linea.tipoPapel && <> · {linea.tipoPapel.nombre}</>}
        {linea.consumoEnBlanco && <> · en blanco ×{linea.factorEnBlanco}</>}
      </div>

      {/* Tallas: la grilla crece de 3 columnas en teléfono a 6 en tablet. */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:grid-cols-6">
        {linea.tallas.map((t) => (
          <div
            key={t.idTalla}
            className={
              'rounded-md border px-2 py-1.5 text-center ' +
              (t.consumoYd === null
                ? 'border-destructive/40 bg-destructive/5'
                : t.yaEnviada
                  ? 'opacity-55'
                  : '')
            }
            title={
              t.consumoYd === null
                ? 'Sin consumo estándar cargado para esta talla'
                : `${t.yardasEstandar} yd × ${t.cantidad}`
            }
          >
            <div className="text-[11px] font-semibold">{t.talla}</div>
            <div className="text-base leading-tight font-bold tabular-nums">{t.cantidad}</div>
            <div className="text-muted-foreground text-[10px] tabular-nums">
              {t.consumoYd === null ? 'sin est.' : `${t.consumoYd} yd`}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t pt-2">
        <div className="text-xs">
          <div>
            <span className="text-muted-foreground">Piezas </span>
            <strong className="tabular-nums">{linea.totalPiezas}</strong>
          </div>
          <div className="tabular-nums">
            <span className="text-muted-foreground">Consumo </span>
            <strong>{linea.totalConsumoYd} yd</strong>
            <span className="text-muted-foreground">
              {' '}
              + eng. {linea.totalEnguiamientoYd}
              {linea.totalEnBlancoYd > 0 && <> + blanco {linea.totalEnBlancoYd}</>}
            </span>
          </div>
        </div>
        {puedeCapturar && !linea.completa && (
          <Button size="sm" disabled={bloqueada || enviando} onClick={onEnviar}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </Button>
        )}
      </div>

      {bloqueada && (
        <p className="text-destructive mt-2 text-xs">
          Sin consumo estándar para {linea.sinEstandar.join(', ')}. Cargalo en Consumo Estándar para
          poder enviar esta línea.
        </p>
      )}
      {avisaEng && (
        <p className="text-muted-foreground mt-2 text-xs">
          Diseño registró {linea.enguiamientoCapturadoYd} yd de enguiamiento y el cálculo da{' '}
          {linea.totalEnguiamientoYd}. Se usa el calculado.
        </p>
      )}
    </div>
  )
}
