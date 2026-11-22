/** Lo que se trae de una reposición para mostrarla, imprimirla o espejarla. */
export const INCLUDE_REPOSICION = {
  departamento: true,
  defecto: true,
  empleado: true,
  impresora: true,
  calandra: true,
  tipoPapel: true,
  insumoTela: true,
  // Las lineas de material, con su insumo y unidad resueltos: la pantalla y
  // el impreso los necesitan, y la unidad NO se guarda en la linea — se lee
  // del catalogo, para que no se desincronice.
  reposicionInsumos: {
    include: {
      insumo: {
        select: {
          idInsumo: true,
          codigo: true,
          descripcion: true,
          unidad: { select: { nombre: true } },
        },
      },
    },
    orderBy: { idReposicionInsumo: 'asc' },
  },
  // Las prendas repuestas, con producto (y su estilo) y talla resueltos.
  prendas: {
    include: {
      producto: {
        select: {
          idProducto: true,
          codigo: true,
          descripcion: true,
          estilo: { select: { nombre: true } },
        },
      },
      talla: { select: { idTalla: true, nombre: true, orden: true } },
      pieza: { select: { idPieza: true, nombre: true } },
    },
    orderBy: { idReposicionPrenda: 'asc' },
  },
  ordenProduccion: { include: { cliente: true } },
  requisicion: true,
} as const;
