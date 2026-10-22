import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/features/auth/auth-context'
import { costeoOrdenesApi } from '@/features/costeo-ordenes/api'
import { costeoRollosApi } from '@/features/costeo-rollos/api'
import { ApiError } from '@/lib/api'
import { avisarError, avisarExito, avisarFaltan } from '@/lib/avisos'
import { normalizarCodigoCosteo } from '@/lib/codigos-costeo'
import { resumirMateriales } from '@/lib/materiales'
import { costeoReposicionesApi } from './api'
import { ModalAnular } from './components/modal-anular'
import { PanelImpresoras } from './components/panel-impresoras'
import { SeccionMateriales, type LineaMaterial } from './components/seccion-materiales'
import { useMarcaEmpresa } from '@/app/marca-empresa'
import { imprimirReposicion } from './imprimir'
import type { Reposicion } from './types'

const HORA_LOCAL = () => {
  const ahora = new Date()
  ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset())
  return ahora.toISOString().slice(0, 16)
}

/**
 * Categoria del catalogo de insumos que corresponde a este campo. Por nombre
 * y no por id: los ids de catalogo difieren entre local y produccion.
 */
const CATEGORIA_TELA = 'Telas'

const SIN_VALOR = '__ninguno__'

/** Los campos que participan de la validacion de "falta completar". */
type CampoForm =
  | 'idDepartamento'
  | 'idDefecto'
  | 'idImpresora'
  | 'yardasPapel'
  | 'idInsumoTela'
  | 'yardasTela'
  | 'materiales'

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
  const marca = useMarcaEmpresa()
  const queryClient = useQueryClient()
  const { usuario, tienePermiso } = useAuth()
  const puedeAnular = tienePermiso('costeo.reposicion.anular')
  const puedeImpresoraSinRollo = tienePermiso('costeo.reposicion.impresora_sin_rollo')

  const [codigoOp, setCodigoOp] = useState('')
  const [opBuscada, setOpBuscada] = useState<string | null>(null)
  const [buscandoOp, setBuscandoOp] = useState(false)
  const [errorOp, setErrorOp] = useState<string | null>(null)
  const [ordenInfo, setOrdenInfo] = useState<{ idOrdenProduccion: number; cliente: string | null; lineaProducto: string | null } | null>(null)

  const [campos, setCampos] = useState(campoVacio())
  // REIMPRESION (papel + tela) o MATERIALES (N insumos). Son excluyentes: el
  // CHECK `ck_reposicion_tipo_regla` las separa en la base, así que una mezcla
  // ni siquiera es representable.
  const [esMateriales, setEsMateriales] = useState(false)
  const [materiales, setMateriales] = useState<LineaMaterial[]>([])
  // Las yardas de tela igualan a las de papel salvo que alguien las edite: el
  // usuario confirmó que "regularmente son el mismo número, muy raras veces
  // cambia". En cuanto se tocan, dejan de copiarse solas.
  const [telaTocada, setTelaTocada] = useState(false)
  const [guardando, setGuardando] = useState(false)
  // Que campos faltan AHORA MISMO (recalculado en cada submit fallido). Se
  // usa para marcar los controles en rojo (`aria-invalid`) y llevar el foco
  // al primero — el toast dice QUE falta, esto dice DONDE. Se vacia en
  // cuanto el campo se toca, no cuando queda valido: mas simple y, en la
  // practica, pasa casi siempre al mismo tiempo.
  const [camposInvalidos, setCamposInvalidos] = useState<Set<CampoForm>>(new Set())
  const [reposicionAnular, setReposicionAnular] = useState<Reposicion | null>(null)

  const refDepartamento = useRef<HTMLButtonElement>(null)
  const refDefecto = useRef<HTMLButtonElement>(null)
  const refImpresora = useRef<HTMLButtonElement>(null)
  const refYardasPapel = useRef<HTMLInputElement>(null)
  const refInsumoTela = useRef<HTMLButtonElement>(null)
  const refYardasTela = useRef<HTMLInputElement>(null)
  const refMateriales = useRef<HTMLDivElement>(null)
  const refsPorCampo: Record<CampoForm, React.RefObject<HTMLElement | null>> = {
    idDepartamento: refDepartamento,
    idDefecto: refDefecto,
    idImpresora: refImpresora,
    yardasPapel: refYardasPapel,
    idInsumoTela: refInsumoTela,
    yardasTela: refYardasTela,
    materiales: refMateriales,
  }

  function limpiarInvalido(campo: CampoForm) {
    setCamposInvalidos((prev) => {
      if (!prev.has(campo)) return prev
      const next = new Set(prev)
      next.delete(campo)
      return next
    })
  }

  const { data: departamentos } = useQuery({ queryKey: ['costeo-reposiciones', 'departamentos'], queryFn: () => costeoReposicionesApi.departamentos() })
  const { data: defectos } = useQuery({ queryKey: ['costeo-reposiciones', 'defectos'], queryFn: () => costeoReposicionesApi.defectos() })
  const { data: calandras } = useQuery({ queryKey: ['costeo-reposiciones', 'calandras'], queryFn: () => costeoReposicionesApi.calandras() })
  const { data: todosLosInsumos } = useQuery({ queryKey: ['costeo-reposiciones', 'insumos'], queryFn: () => costeoReposicionesApi.insumos() })

  // `/recetas/insumos` devuelve el catálogo completo, así que el selector
  // ofrecía también hilos, elásticos, etiquetas y herrajes — reportado por el
  // usuario. El campo es "Insumo de tela", así que solo van las telas.
  //
  // Se filtra por NOMBRE de categoría y no por `idCategoria`: los ids de los
  // catálogos no son los mismos en local y en producción (la talla `2XS-XS` es
  // 440 en una y 298 en la otra), y acá se filtraría mal sin que nada avise.
  const insumosTela = useMemo(
    () => (todosLosInsumos ?? []).filter((i) => i.categoria === CATEGORIA_TELA),
    [todosLosInsumos],
  )
  const { data: impresoras } = useQuery({
    queryKey: ['costeo-rollos', 'impresoras'],
    queryFn: () => costeoRollosApi.listarImpresoras(),
  })
  // Misma queryKey que usa PanelImpresoras, así que react-query lo sirve de
  // caché y no hay una segunda llamada.
  const { data: panelRollos } = useQuery({
    queryKey: ['costeo-rollos', 'panel'],
    queryFn: () => costeoRollosApi.panel(),
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

  // El selector solo ofrece impresoras con un rollo montado AHORA: elegir una
  // sin rollo terminaba siempre en un 409 al guardar, porque el servidor
  // resuelve el rollo con fn_rollo_en y no acepta uno indeterminado. Registrar
  // sobre una impresora sin rollo es la excepción (una reposición de algo que
  // pasó antes, con ese rollo ya desmontado) y exige permiso de administrador;
  // el servidor valida lo mismo, esto no es solo cosmética.
  const idsConRollo = new Set(
    (panelRollos ?? []).filter((p) => p.montaje).map((p) => p.impresora.idImpresora),
  )
  const impresorasElegibles = puedeImpresoraSinRollo
    ? (impresoras ?? [])
    : (impresoras ?? []).filter((i) => idsConRollo.has(i.idImpresora))

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
      limpiarFormulario()
    } catch (err) {
      setErrorOp(err instanceof ApiError ? err.message : 'Error al buscar la OP')
    } finally {
      setBuscandoOp(false)
    }
  }

  function limpiarFormulario() {
    setCampos(campoVacio())
    setMateriales([])
    setTelaTocada(false)
    setCamposInvalidos(new Set())
  }

  function set<K extends keyof ReturnType<typeof campoVacio>>(campo: K, valor: string) {
    setCampos((prev) => ({ ...prev, [campo]: valor }))
    if (campo in refsPorCampo) limpiarInvalido(campo as CampoForm)
  }

  /** Las yardas de papel arrastran a las de tela mientras nadie las edite. */
  function setYardasPapel(valor: string) {
    setCampos((prev) => ({
      ...prev,
      yardasPapel: valor,
      yardasTela: telaTocada ? prev.yardasTela : valor,
    }))
    limpiarInvalido('yardasPapel')
    if (!telaTocada) limpiarInvalido('yardasTela')
  }

  function cambiarMateriales(lineas: typeof materiales) {
    setMateriales(lineas)
    if (lineas.length > 0) limpiarInvalido('materiales')
  }

  /**
   * Las mismas reglas que verifica el servidor, para no gastar un viaje. El
   * servidor las revalida igual: ocultar un control no es una validacion.
   * Cada item lleva la seccion donde esta el campo (para el toast) y a que
   * control corresponde (para marcarlo en rojo y enfocarlo).
   */
  function loQueFalta(): { campo: CampoForm; seccion: string; etiqueta: string }[] {
    const faltan: { campo: CampoForm; seccion: string; etiqueta: string }[] = []
    if (!campos.idDepartamento)
      faltan.push({ campo: 'idDepartamento', seccion: 'Datos', etiqueta: 'Departamento' })
    if (!campos.idDefecto)
      faltan.push({ campo: 'idDefecto', seccion: 'Datos', etiqueta: 'Defecto' })
    if (esMateriales) {
      if (materiales.length === 0)
        faltan.push({ campo: 'materiales', seccion: 'Materiales', etiqueta: 'Agregar al menos un material' })
      return faltan
    }
    if (!campos.idImpresora)
      faltan.push({ campo: 'idImpresora', seccion: 'Papel', etiqueta: 'Impresora' })
    if (!(Number(campos.yardasPapel) > 0))
      faltan.push({ campo: 'yardasPapel', seccion: 'Papel', etiqueta: 'Yardas de papel' })
    if (!campos.idInsumoTela)
      faltan.push({ campo: 'idInsumoTela', seccion: 'Tela', etiqueta: 'Insumo de tela' })
    // A diferencia del papel, 0 es un valor válido acá: a veces se usan
    // retazos de tela y el consumo real es cero. Lo que falta es que el
    // campo esté vacío o con algo que no sea un número (negativo incluido),
    // no que valga 0 — por eso no se puede usar `Number(x) > 0` como con
    // yardasPapel, que sí exige una cantidad positiva.
    if (campos.yardasTela.trim() === '' || !(Number(campos.yardasTela) >= 0))
      faltan.push({ campo: 'yardasTela', seccion: 'Tela', etiqueta: 'Yardas de tela' })
    return faltan
  }

  async function registrar(otraParaMismaOp: boolean) {
    if (!opBuscada) return
    const faltan = loQueFalta()
    if (faltan.length > 0) {
      setCamposInvalidos(new Set(faltan.map((f) => f.campo)))
      avisarFaltan(faltan.map(({ seccion, etiqueta }) => ({ seccion, etiqueta })))
      // El toast dice QUE falta; esto lleva al operario directo a DONDE esta.
      // Sin esto, con el formulario largo, el primer campo faltante puede
      // estar fuera de la pantalla y hay que ir a buscarlo a ciegas.
      const primerRef = refsPorCampo[faltan[0].campo]
      primerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      primerRef.current?.focus()
      return
    }
    setCamposInvalidos(new Set())
    setGuardando(true)
    try {
      // Los campos del otro tipo no se mandan vacíos sino que no se mandan:
      // el servidor exige que una MATERIALES no traiga nada de papel ni tela.
      const resultado = await costeoReposicionesApi.crear({
        fecha: new Date(campos.fecha).toISOString(),
        codigoOp: opBuscada,
        tipo: esMateriales ? 'MATERIALES' : 'REIMPRESION',
        idDepartamento: Number(campos.idDepartamento),
        idDefecto: Number(campos.idDefecto),
        bodegaSac: campos.bodegaSac || undefined,
        comentario: campos.comentario || undefined,
        ...(esMateriales
          ? {
              materiales: materiales.map((m) => ({
                idInsumo: m.idInsumo,
                cantidad: Number(m.cantidad),
              })),
            }
          : {
              yardasPapel: Number(campos.yardasPapel),
              idImpresora: Number(campos.idImpresora),
              idCalandra: campos.idCalandra ? Number(campos.idCalandra) : undefined,
              idInsumoTela: Number(campos.idInsumoTela),
              yardasTela: Number(campos.yardasTela),
            }),
      })
      avisarExito(`Reposición ${resultado.codigoRepo} registrada correctamente.`, {
        etiqueta: 'Imprimir',
        onClick: () => imprimirReposicion(resultado, usuario?.nombreCompleto ?? '', marca),
      })
      limpiarFormulario()
      queryClient.invalidateQueries({ queryKey: ['costeo-reposiciones', 'siguiente-numero'] })
      queryClient.invalidateQueries({ queryKey: ['costeo-rollos'] })
      refetchReposiciones()
      if (!otraParaMismaOp) {
        setOpBuscada(null)
        setOrdenInfo(null)
        setCodigoOp('')
      }
    } catch (err) {
      avisarError(err instanceof ApiError ? err.message : 'Error al registrar la reposición')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="mb-4 text-xl font-semibold text-ink">Reposiciones</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {/* `min-w-0`: un item de grid no baja de su ancho de contenido sin esto,
          asi que la tabla de reposiciones estiraba la columna entera y la
          pagina desbordaba en telefono en vez de scrollear dentro de su
          `overflow-x-auto`. Mismo defecto ya visto en ImportPreviewDialog. */}
      <div className="min-w-0 space-y-4">
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
            <div>
              <Label className="mb-1 block text-xs">Fecha y hora</Label>
              <Input type="datetime-local" value={campos.fecha} onChange={(e) => set('fecha', e.target.value)} />
            </div>

            <div>
              <Label className="mb-1 block text-xs">Departamento</Label>
              <Select value={campos.idDepartamento} onValueChange={(v) => set('idDepartamento', v)}>
                <SelectTrigger
                  ref={refDepartamento}
                  aria-invalid={camposInvalidos.has('idDepartamento')}
                  className="w-full"
                >
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
                <SelectTrigger
                  ref={refDefecto}
                  aria-invalid={camposInvalidos.has('idDefecto')}
                  className="w-full"
                >
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

            <label className="flex items-start gap-2 rounded-md border border-border p-3">
              <Checkbox
                className="mt-0.5"
                checked={esMateriales}
                onCheckedChange={(v) => {
                  const marcado = v === true
                  setEsMateriales(marcado)
                  // Cambiar de tipo vuelve obsoleta cualquier marca de
                  // "falta completar" anterior: los campos que se evaluan
                  // son otros.
                  setCamposInvalidos(new Set())
                  // Al cambiar de tipo se limpia lo del otro. Dejarlo cargado
                  // haria que el servidor rechace la reposicion por mezclar
                  // los dos tipos, que son excluyentes.
                  if (marcado) {
                    setCampos((prev) => ({
                      ...prev,
                      idImpresora: '',
                      yardasPapel: '',
                      idCalandra: '',
                      idInsumoTela: '',
                      yardasTela: '',
                    }))
                    setTelaTocada(false)
                  } else {
                    setMateriales([])
                  }
                }}
              />
              <span className="text-sm">
                <span className="font-medium text-ink">Materiales</span>
                <span className="mt-0.5 block text-xs text-ink-faint">
                  Requisicion de insumos de bodega en lugar de una reimpresion. No lleva
                  papel ni tela, y no se descuenta de ningun rollo.
                </span>
              </span>
            </label>

            {esMateriales ? (
              <div
                ref={refMateriales}
                className={
                  camposInvalidos.has('materiales')
                    ? 'rounded-md ring-2 ring-destructive ring-offset-2 ring-offset-background'
                    : undefined
                }
              >
                <p className="mb-2 text-xs font-medium text-ink-muted">Materiales</p>
                <SeccionMateriales
                  lineas={materiales}
                  onChange={cambiarMateriales}
                  insumos={todosLosInsumos}
                  disabled={guardando}
                />
              </div>
            ) : (
              <>
                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-medium text-ink-muted">Papel</p>
                  <div className="space-y-3">
                    <div>
                      <Label className="mb-1 block text-xs">Impresora</Label>
                      <Select value={campos.idImpresora || SIN_VALOR} onValueChange={(v) => set('idImpresora', v === SIN_VALOR ? '' : v)}>
                        <SelectTrigger
                          ref={refImpresora}
                          aria-invalid={camposInvalidos.has('idImpresora')}
                          className="w-full"
                        >
                          <SelectValue placeholder="Seleccionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SIN_VALOR}>Seleccionar…</SelectItem>
                          {impresorasElegibles.map((i) => (
                            <SelectItem key={i.idImpresora} value={String(i.idImpresora)}>
                              {i.codigo}
                              {puedeImpresoraSinRollo && !idsConRollo.has(i.idImpresora) && ' · sin rollo'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-[11px] text-ink-faint">
                        {puedeImpresoraSinRollo
                          ? 'El tipo de papel se autocompleta del rollo montado en esa impresora al guardar. Las marcadas "sin rollo" solo resuelven si la fecha apunta a un momento en que sí lo tenían.'
                          : 'Solo se listan las impresoras con un rollo montado. El tipo de papel se autocompleta de ese rollo al guardar.'}
                      </p>
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Yardas papel</Label>
                      <Input
                        ref={refYardasPapel}
                        aria-invalid={camposInvalidos.has('yardasPapel')}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={campos.yardasPapel}
                        onChange={(e) => setYardasPapel(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Calandra (opcional)</Label>
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
                  <p className="mb-2 text-xs font-medium text-ink-muted">Tela</p>
                  <div className="space-y-3">
                    <div>
                      <Label className="mb-1 block text-xs">Insumo de tela</Label>
                      <Select value={campos.idInsumoTela || SIN_VALOR} onValueChange={(v) => set('idInsumoTela', v === SIN_VALOR ? '' : v)}>
                        <SelectTrigger
                          ref={refInsumoTela}
                          aria-invalid={camposInvalidos.has('idInsumoTela')}
                          className="w-full"
                        >
                          <SelectValue placeholder="Seleccionar…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SIN_VALOR}>Seleccionar…</SelectItem>
                          {/* El código adelante es solo visual: lo que se guarda
                              sigue siendo el id. Los operarios identifican la tela
                              por su código antes que por la descripción. */}
                          {insumosTela.map((i) => (
                            <SelectItem key={i.idInsumo} value={String(i.idInsumo)}>
                              {i.codigo} - {i.descripcion}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs">Yardas tela</Label>
                      <Input
                        ref={refYardasTela}
                        aria-invalid={camposInvalidos.has('yardasTela')}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={campos.yardasTela}
                        onChange={(e) => {
                          setTelaTocada(true)
                          set('yardasTela', e.target.value)
                        }}
                      />
                      {telaTocada && campos.yardasPapel && campos.yardasTela !== campos.yardasPapel ? (
                        <button
                          type="button"
                          className="mt-1 text-[11px] text-ink-faint underline underline-offset-2"
                          onClick={() => {
                            setTelaTocada(false)
                            set('yardasTela', campos.yardasPapel)
                          }}
                        >
                          Igualar a las yardas de papel ({campos.yardasPapel})
                        </button>
                      ) : (
                        <p className="mt-1 text-[11px] text-ink-faint">
                          Se copia de las yardas de papel. Editala si esta vez no coinciden.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reposiciones.map((r) => (
                  <TableRow key={r.idReposicion}>
                    <TableCell className="font-mono">{r.codigoRepo}</TableCell>
                    <TableCell className="whitespace-normal">{r.defecto.nombre}</TableCell>
                    <TableCell>
                      {r.tipo === 'MATERIALES' ? (
                        <Badge variant="secondary">Materiales</Badge>
                      ) : (
                        'Reimpresión'
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs">
                      {r.tipo === 'MATERIALES'
                        ? resumirMateriales(
                            r.reposicionInsumos.map((m) => ({
                              codigo: m.insumo.codigo,
                              cantidad: m.cantidad,
                              unidad: m.insumo.unidad.nombre,
                            })),
                          )
                        : `${r.yardasPapel} yd papel · ${r.yardasTela} yd tela`}
                    </TableCell>
                    <TableCell>
                      {r.anuladoEn ? <Badge variant="secondary">Anulada</Badge> : <Badge>Activa</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => imprimirReposicion(r, usuario?.nombreCompleto ?? '', marca)}
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
