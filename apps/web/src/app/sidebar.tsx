import { MenuIcon, PanelLeftClose, PanelLeftOpen, XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { useTablerosBi } from '@/features/bi/api'
import { useAvisosReposiciones } from '@/features/costeo-reposiciones/use-avisos'
import { MODULOS } from './modulos'

const CLAVE_COLAPSADO = 'digitexsa.sidebar.colapsado'

interface NavItemInfo {
  to: string
  codigo: string
  etiqueta: string
  /** Solo para los items de fin, si aplica end-matching (ej. "Inicio" en "/"). */
  end?: boolean
  /** Trabajo esperando (ej. reposiciones por validar). 0 o ausente: sin marca. */
  contador?: number
}

function ItemNav({
  item,
  colapsado,
  onNavegar,
  grande,
}: {
  item: NavItemInfo
  colapsado: boolean
  onNavegar?: () => void
  /** Objetivo táctil más alto, para el menú del móvil. */
  grande?: boolean
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={colapsado ? item.etiqueta : undefined}
      onClick={onNavegar}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-ink-muted transition-colors hover:bg-black/[0.03] hover:text-ink dark:hover:bg-white/[0.04]',
          colapsado && 'justify-center px-0',
          grande && 'py-3 text-[15px]',
          isActive && 'bg-accent-brand-soft text-accent-brand-strong hover:bg-accent-brand-soft hover:text-accent-brand-strong',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'relative flex size-[22px] shrink-0 items-center justify-center rounded-md bg-black/[0.04] text-[10px] font-bold text-ink-faint dark:bg-white/[0.06]',
              isActive && 'bg-accent-brand text-white',
            )}
          >
            {item.codigo}
            {/* Con el panel colapsado no hay lugar para el número: un punto. */}
            {colapsado && !!item.contador && (
              <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-red-600 ring-2 ring-card" />
            )}
          </span>
          {!colapsado && <span className="min-w-0 flex-1">{item.etiqueta}</span>}
          {!colapsado && !!item.contador && (
            <span
              className="ml-auto min-w-[20px] rounded-full bg-red-600 px-1.5 text-center text-[11px] leading-[18px] font-bold text-white tabular-nums"
              aria-label={`${item.contador} pendientes`}
            >
              {item.contador > 99 ? '99+' : item.contador}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

/** Los ítems de navegación que este usuario puede ver. Una sola lista para el
 *  panel de escritorio y el menú del móvil: si no, se desincronizarían. */
function useItemsNav(): NavItemInfo[] {
  const { tienePermiso } = useAuth()
  const { data: tablerosBi } = useTablerosBi()
  const { data: avisosRepos } = useAvisosReposiciones()
  const moduloRecetas = MODULOS.find((m) => m.codigo === 'RC')!

  return [
    { to: '/', codigo: 'IN', etiqueta: 'Inicio', end: true },
    // Recetas contiene información confidencial de desarrollo de prendas —
    // solo Cotizador/Editor/Admin (recetas.cotizaciones.ver) deben verla en
    // la navegación, no cualquier usuario autenticado (bug real: antes se
    // agregaba sin ninguna condición).
    ...(tienePermiso('recetas.cotizaciones.ver')
      ? [{ to: moduloRecetas.ruta!, codigo: moduloRecetas.codigo, etiqueta: moduloRecetas.nombre }]
      : []),
    ...(tienePermiso('costeo.rollo.ver') ? [{ to: '/costeo/rollos', codigo: 'CR', etiqueta: 'Gestión de Rollos' }] : []),
    ...(tienePermiso('costeo.orden.ver') ? [{ to: '/costeo/ordenes', codigo: 'OP', etiqueta: 'Órdenes de Producción' }] : []),
    // El formulario es para quien registra; los validadores trabajan desde el
    // seguimiento (`SR`, libre: IN RC CR OP RE IO CE RS OF EM DB).
    ...(tienePermiso('costeo.reposicion.crear') ? [{ to: '/costeo/reposiciones', codigo: 'RE', etiqueta: 'Reposiciones', end: true, contador: avisosRepos?.devueltas.cantidad }] : []),
    ...(tienePermiso('costeo.reposicion.ver') ? [{ to: '/costeo/reposiciones/seguimiento', codigo: 'SR', etiqueta: 'Seguimiento de reposiciones', contador: avisosRepos ? avisosRepos.total + avisosRepos.porRecoger.cantidad : undefined }] : []),
    ...(tienePermiso('costeo.consumo.ver') ? [{ to: '/costeo/consumo', codigo: 'IO', etiqueta: 'Impresión de OPs' }] : []),
    ...(tienePermiso('costeo.estandar.ver') ? [{ to: '/costeo/estandar', codigo: 'CE', etiqueta: 'Consumo Estándar' }] : []),
    // "Reportes de Costeo" y no "Reportes" a secas: el mosaico de Inicio ya
    // tiene un tile "Reportes" del roadmap global, todavía en Próximamente.
    //
    // El código es `RS` y no el `RC` obvio porque con el panel colapsado esas
    // dos letras son lo único que se ve, y `RC` ya es Recetas (`app/modulos.ts`)
    // — dos ítems del mismo sidebar quedarían indistinguibles. `RP`, el otro
    // candidato, es el del tile "Reportes" del roadmap.
    ...(tienePermiso('costeo.dashboard.ver') ? [{ to: '/costeo/reportes', codigo: 'RS', etiqueta: 'Reportes de Costeo' }] : []),
    ...(tienePermiso('costeo.of.ver') ? [{ to: '/costeo/facturacion', codigo: 'OF', etiqueta: 'Órdenes de Facturación' }] : []),
    // `EM` no choca con ningún otro código del sidebar (IN RC CR OP RE IO CE RS OF DB).
    ...(tienePermiso('costeo.material.ver') ? [{ to: '/costeo/materiales', codigo: 'EM', etiqueta: 'Explosión de materiales' }] : []),
    // Solo si el servidor dice que hay al menos un tablero para este usuario en
    // esta empresa (Superset configurado + permiso por tablero): evita ofrecer
    // un menú que lleva a una pantalla vacía. `TB` no choca con ningún otro código.
    ...(tablerosBi?.tableros.length ? [{ to: '/dashboards', codigo: 'DB', etiqueta: 'Dashboards' }] : []),
  ]
}

function MarcaEmpresa({ colapsado }: { colapsado: boolean }) {
  const { empresasDisponibles, idEmpresa } = useAuth()
  const empresaActual = empresasDisponibles.find((e) => e.idEmpresa === idEmpresa)
  return (
    <>
      {/* El tile de marca toma el color de la empresa activa (core.empresas.
          color_marca). Junto con la franja del encabezado es la señal de "en
          qué empresa estoy" — el usuario pidió poder notarlo de un vistazo para
          no transaccionar en la empresa equivocada. Si la empresa no tiene
          color cargado, cae al azul corporativo de siempre. */}
      <div className={cn('flex items-center gap-2.5', colapsado ? 'justify-center px-0' : 'px-2')}>
        <div
          className="relative size-[30px] shrink-0 rounded-lg bg-accent-brand"
          style={empresaActual?.colorMarca ? { backgroundColor: empresaActual.colorMarca } : undefined}
        >
          <span className="absolute inset-x-[7px] top-[14px] h-[2px] bg-white/90" />
          <span className="absolute inset-y-[7px] left-[14px] w-[2px] bg-white/90" />
        </div>
        {!colapsado && (
          <div className="flex min-w-0 flex-col leading-tight">
            {/* El logo real de la empresa activa cuando lo tiene cargado
                (`core.empresas.logo`), y el nombre en texto cuando no — así una
                empresa sin logo nunca hereda el de la otra. El recuadro de color
                de al lado se queda en los dos casos: con el panel colapsado es
                lo único visible, y un logo apaisado no se lee a 30px. */}
            {empresaActual?.logo ? (
              <img
                src={empresaActual.logo}
                alt={empresaActual.nombreComercial ?? empresaActual.codigo}
                className="max-h-[38px] max-w-[150px] self-start object-contain"
              />
            ) : (
              <strong className="truncate text-[14.5px] font-bold tracking-tight text-ink">
                {empresaActual?.nombreComercial ?? empresaActual?.codigo ?? 'Digitexsa'} ERP
              </strong>
            )}
            <span className="text-[11.5px] text-ink-faint">{empresaActual?.codigo ?? 'Digital Textil, S.A.'}</span>
          </div>
        )}
      </div>
    </>
  )
}

function Proximamente({ colapsado }: { colapsado: boolean }) {
  const proximamente = MODULOS.filter((m) => !m.activo)
  return (
    <>
      {!colapsado && (
        <div>
          <div className="mb-0.5 px-2.5 text-[10.5px] font-bold tracking-[0.08em] text-ink-faint uppercase">Próximamente</div>
          <ul className="flex flex-col gap-0.5">
            {proximamente.map((modulo) => (
              <li key={modulo.codigo}>
                <span className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-ink-faint">
                  <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-black/[0.04] text-[10px] font-bold text-ink-faint dark:bg-white/[0.06]">
                    {modulo.codigo}
                  </span>
                  {modulo.nombre}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </>
  )
}

export function Sidebar() {
  const itemsReales = useItemsNav()
  const [colapsado, setColapsado] = useState(() => localStorage.getItem(CLAVE_COLAPSADO) === '1')

  useEffect(() => {
    localStorage.setItem(CLAVE_COLAPSADO, colapsado ? '1' : '0')
  }, [colapsado])

  return (
    <nav
      className={cn(
        // sticky + alto de viewport: sin esto el <nav> crece con el alto de la
        // página y el botón de colapsar (mt-auto) queda al final del contenido,
        // invisible hasta hacer scroll hasta el fondo de una tabla larga.
        'sticky top-0 hidden h-svh shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-card py-5 transition-[width] duration-150 lg:flex',
        colapsado ? 'w-[68px] px-2' : 'w-[248px] px-3.5',
      )}
      aria-label="Navegación principal"
    >
      <MarcaEmpresa colapsado={colapsado} />

      <ul className="flex flex-col gap-0.5">
        {itemsReales.map((item) => (
          <li key={item.to}>
            <ItemNav item={item} colapsado={colapsado} />
          </li>
        ))}
      </ul>

      <Proximamente colapsado={colapsado} />

      <div className="mt-auto flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => setColapsado((v) => !v)}
          title={colapsado ? 'Expandir panel' : 'Colapsar panel'}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-ink-faint transition-colors hover:bg-black/[0.03] hover:text-ink dark:hover:bg-white/[0.04]',
            colapsado && 'justify-center px-0',
          )}
        >
          {colapsado ? <PanelLeftOpen className="size-[18px] shrink-0" /> : <PanelLeftClose className="size-[18px] shrink-0" />}
          {!colapsado && 'Colapsar panel'}
        </button>
      </div>
    </nav>
  )
}

/// Menú del móvil y la tablet. El panel lateral solo existe desde `lg` (1024px):
/// debajo no hay lugar para él, y sin esto no había forma de llegar a ninguna
/// pantalla que no fuera la que abría el aviso. Es el mismo contenido que el
/// panel, en un cajón que sale desde la izquierda.
export function MenuMovil() {
  const [abierto, setAbierto] = useState(false)
  const items = useItemsNav()
  // El mismo número que ve el escritorio, pero como punto en el botón: con el
  // cajón cerrado es la única señal de que hay trabajo esperando.
  const hayPendientes = items.some((i) => !!i.contador)
  const cerrar = () => setAbierto(false)

  return (
    <DialogPrimitive.Root open={abierto} onOpenChange={setAbierto}>
      <DialogPrimitive.Trigger
        aria-label="Abrir el menú"
        className="relative -ml-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-ink outline-none hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-ring lg:hidden dark:hover:bg-white/[0.06]"
      >
        <MenuIcon className="size-[22px]" />
        {hayPendientes && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-red-600 ring-2 ring-surface-paper" />}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex h-svh w-[290px] max-w-[85vw] flex-col gap-5 overflow-y-auto border-r border-border bg-card px-3.5 py-5 shadow-xl outline-none duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden"
        >
          <DialogPrimitive.Title className="sr-only">Navegación principal</DialogPrimitive.Title>
          <div className="flex items-start justify-between gap-2">
            <MarcaEmpresa colapsado={false} />
            <DialogPrimitive.Close
              aria-label="Cerrar el menú"
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-muted outline-none hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/[0.06]"
            >
              <XIcon className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <nav aria-label="Navegación principal">
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <ItemNav item={item} colapsado={false} onNavegar={cerrar} grande />
                </li>
              ))}
            </ul>
          </nav>
          <Proximamente colapsado={false} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
