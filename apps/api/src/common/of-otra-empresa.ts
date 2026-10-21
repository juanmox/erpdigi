import { PrismaService } from '../prisma/prisma.service';

/**
 * Arma el mensaje de "no encontré esa OF", distinguiendo el caso real de
 * "existe, pero en otra de TUS empresas". Mismo patrón que
 * `mensajeOpNoEncontrada` — ver la nota completa allá.
 */
export interface OfNoEncontrada {
  message: string;
  motivo?: 'OF_EN_OTRA_EMPRESA';
}

export async function mensajeOfNoEncontrada(
  prisma: PrismaService,
  params: {
    codigo: string;
    anio: number;
    correlativo: number;
    idUsuario: number;
    idEmpresaActual: number;
  },
): Promise<OfNoEncontrada> {
  const base = `No existe la orden de facturación ${params.codigo} en esta empresa`;

  const asignaciones = await prisma.usuarioEmpresaRol.findMany({
    where: {
      idUsuario: params.idUsuario,
      activo: true,
      empresa: { activo: true },
      idEmpresa: { not: params.idEmpresaActual },
    },
    select: {
      idEmpresa: true,
      empresa: { select: { nombreComercial: true, codigo: true } },
    },
  });
  if (asignaciones.length === 0) return { message: `${base}.` };

  const candidatas = await prisma.ordenFacturacion.findMany({
    where: {
      anio: params.anio,
      correlativo: params.correlativo,
      idEmpresa: { in: asignaciones.map((a) => a.idEmpresa) },
    },
    select: { idEmpresa: true },
  });
  if (candidatas.length === 0) return { message: `${base}.` };

  const nombres = [
    ...new Set(
      candidatas.map((c) => {
        const a = asignaciones.find((x) => x.idEmpresa === c.idEmpresa);
        return (
          a?.empresa.nombreComercial ?? a?.empresa.codigo ?? 'otra empresa'
        );
      }),
    ),
  ];

  return {
    message: `${base}, pero sí existe en ${nombres.join(' y ')}. Cambiá de empresa desde el menú de tu usuario, arriba a la derecha.`,
    motivo: 'OF_EN_OTRA_EMPRESA',
  };
}
