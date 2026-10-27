/**
 * Catálogo de tableros que el ERP sabe incrustar.
 *
 * La lista y los permisos viven en CÓDIGO a propósito: quién puede ver qué es
 * una regla de seguridad y tiene que ser revisable en el repositorio, no un
 * dato que se edita en Superset. Lo único que se configura por entorno es el
 * UUID que Superset le asigna a cada tablero al habilitar su incrustación
 * (`BI_TABLEROS`), porque ese UUID es distinto en cada instalación.
 */
export interface DefinicionTablero {
  /** Clave estable; es lo que viaja en la URL y en `BI_TABLEROS`. */
  clave: string;
  titulo: string;
  descripcion: string;
  /** Permiso del ERP que habilita ver el tablero. */
  permiso: string;
  /**
   * ¿Los datasets del tablero traen `id_empresa`? Si sí, el acceso se emite con
   * una regla por fila de la empresa de la sesión. Si no (rollos: la planta es
   * una sola), aplicar la regla rompería los gráficos, así que no se aplica.
   *
   * Regla de diseño: un tablero NO mezcla datasets con y sin `id_empresa`.
   */
  filtraPorEmpresa: boolean;
  /**
   * El tablero NUNCA ofrece el menú de descarga, ni a quien tiene
   * `costeo.dashboard.exportar`. Para tableros con cifras de dinero.
   *
   * ⚠️ Es un control de PANTALLA: Superset aplica un solo rol a todos los
   * usuarios incrustados, así que quien maneje el token a mano podría pedir la
   * descarga igual. Los datos sensibles se exportan por reportes del ERP.
   */
  sinDescarga?: boolean;
}

export const TABLEROS: readonly DefinicionTablero[] = [
  {
    clave: 'produccion',
    titulo: 'Producción',
    descripcion:
      'Piezas y yardas por mes, cliente, marca, estilo y deporte; avance de impresión.',
    permiso: 'costeo.dashboard.ver',
    filtraPorEmpresa: true,
  },
  {
    clave: 'calidad',
    titulo: 'Calidad y reposiciones',
    descripcion:
      'Reposiciones y yardas repuestas por defecto, departamento e imputable.',
    permiso: 'costeo.dashboard.ver',
    filtraPorEmpresa: true,
  },
  {
    clave: 'prendas',
    titulo: 'Reposiciones por prenda',
    descripcion:
      'Piezas repuestas por producto, talla, pieza (cuello, manga…), estilo, deporte y defecto. Empieza desde que se usa el formulario de prendas.',
    permiso: 'costeo.dashboard.ver',
    filtraPorEmpresa: true,
  },
  {
    clave: 'papel',
    titulo: 'Papel e inventario',
    descripcion:
      'Inventario de rollos, antigüedad y consumo por tipo de papel. Planta compartida.',
    permiso: 'costeo.dashboard.ver',
    filtraPorEmpresa: false,
  },
  {
    clave: 'facturacion',
    titulo: 'Facturación',
    descripcion:
      'Órdenes de facturación vigentes con sus órdenes, piezas y yardas.',
    permiso: 'costeo.dashboard.ver',
    filtraPorEmpresa: true,
  },
  {
    clave: 'costos',
    titulo: 'Costos por orden',
    descripcion:
      'Costo estándar de receta frente al consumo real en yardas, por orden.',
    permiso: 'costeo.dashboard.ver_financiero',
    filtraPorEmpresa: true,
    sinDescarga: true,
  },
];

/** Permiso que muestra el menú de descarga de los gráficos incrustados. */
export const PERMISO_EXPORTAR = 'costeo.dashboard.exportar';
