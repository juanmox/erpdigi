import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/auth-context'
import { MODULOS } from './modulos'

const CLAVE_COLAPSADO = 'digitexsa.sidebar.colapsado'

interface NavItemInfo {
  to: string
  codigo: string
  etiqueta: string
  /** Solo para los items de fin, si aplica end-matching (ej. "Inicio" en "/"). */
  end?: boolean
}

function ItemNav({ item, colapsado }: { item: NavItemInfo; colapsado: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={colapsado ? item.etiqueta : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-ink-muted transition-colors hover:bg-black/[0.03] hover:text-ink dark:hover:bg-white/[0.04]',
          colapsado && 'justify-center px-0',
          isActive && 'bg-accent-brand-soft text-accent-brand-strong hover:bg-accent-brand-soft hover:text-accent-brand-strong',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex size-[22px] shrink-0 items-center justify-center rounded-md bg-black/[0.04] text-[10px] font-bold text-ink-faint dark:bg-white/[0.06]',
              isActive && 'bg-accent-brand text-white',
            )}
          >
            {item.codigo}
          </span>
          {!colapsado && item.etiqueta}
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  const { empresasDisponibles, idEmpresa, tienePermiso } = useAuth()
  const [colapsado, setColapsado] = useState(() => localStorage.getItem(CLAVE_COLAPSADO) === '1')

  useEffect(() => {
    localStorage.setItem(CLAVE_COLAPSADO, colapsado ? '1' : '0')
  }, [colapsado])

  const empresaActual = empresasDisponibles.find((e) => e.idEmpresa === idEmpresa)
  const moduloRecetas = MODULOS.find((m) => m.codigo === 'RC')!

  const itemsReales: NavItemInfo[] = [
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
    ...(tienePermiso('costeo.reposicion.ver') ? [{ to: '/costeo/reposiciones', codigo: 'RE', etiqueta: 'Reposiciones' }] : []),
    ...(tienePermiso('costeo.consumo.ver') ? [{ to: '/costeo/consumo', codigo: 'EI', etiqueta: 'Envío de impresas' }] : []),
    ...(tienePermiso('costeo.estandar.ver') ? [{ to: '/costeo/estandar', codigo: 'CE', etiqueta: 'Consumo Estándar' }] : []),
  ]

  const proximamente = MODULOS.filter((m) => !m.activo)

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
      <div className={cn('flex items-center gap-2.5', colapsado ? 'justify-center px-0' : 'px-2')}>
        <div className="relative size-[30px] shrink-0 rounded-lg bg-accent-brand">
          <span className="absolute inset-x-[7px] top-[14px] h-[2px] bg-white/90" />
          <span className="absolute inset-y-[7px] left-[14px] w-[2px] bg-white/90" />
        </div>
        {!colapsado && (
          <div className="flex flex-col leading-tight">
            <strong className="text-[14.5px] font-bold tracking-tight text-ink">Digitexsa ERP</strong>
            <span className="text-[11.5px] text-ink-faint">{empresaActual?.nombreComercial ?? empresaActual?.codigo ?? 'Digital Textil, S.A.'}</span>
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-0.5">
        {itemsReales.map((item) => (
          <li key={item.to}>
            <ItemNav item={item} colapsado={colapsado} />
          </li>
        ))}
      </ul>

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
