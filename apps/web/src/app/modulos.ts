/**
 * Metadata de los 8 módulos del roadmap del ERP — fuente única compartida por el
 * sidebar de navegación y el mosaico del panel de inicio, para que ambos queden
 * siempre en sincronía.
 */

export interface ModuloInfo {
  codigo: string
  nombre: string
  descripcion: string
  /** Presente solo en módulos activos. */
  ruta?: string
  activo: boolean
}

export const MODULOS: ModuloInfo[] = [
  {
    codigo: 'RC',
    nombre: 'Recetas',
    descripcion: 'Cotización, catálogo de insumos y productos, costeo por receta.',
    ruta: '/recetas',
    activo: true,
  },
  {
    codigo: 'IV',
    nombre: 'Inventario',
    descripcion: 'Rollos de tela, insumos y ubicaciones de almacén.',
    activo: false,
  },
  {
    codigo: 'CO',
    nombre: 'Compras',
    descripcion: 'Órdenes a proveedores de tela, hilo y avíos.',
    activo: false,
  },
  {
    codigo: 'VE',
    nombre: 'Ventas',
    descripcion: 'Pedidos de clientes, despachos y facturación.',
    activo: false,
  },
  {
    codigo: 'CN',
    nombre: 'Contabilidad',
    descripcion: 'Libros contables, FEL y conciliación multi-moneda.',
    activo: false,
  },
  {
    codigo: 'RH',
    nombre: 'RRHH',
    descripcion: 'Personal de planta, turnos y nómina.',
    activo: false,
  },
  {
    codigo: 'PR',
    nombre: 'Producción',
    descripcion: 'Corte, confección y tejido por línea.',
    activo: false,
  },
  {
    codigo: 'RP',
    nombre: 'Reportes',
    descripcion: 'Indicadores consolidados de todos los módulos.',
    activo: false,
  },
]
