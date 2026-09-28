import { PrismaService } from '../prisma/prisma.service';

/**
 * Arma el mensaje de "no encontré esa OP", distinguiendo el caso real de
 * "existe, pero en otra de TUS empresas".
 *
 * Desde que Costeo se separó por empresa (migración 20260928120000), buscar una
 * OP parado en la empresa equivocada devolvía un 404 plano: "No existe la orden
 * de producción 26OP010345". Es engañoso, porque la orden sí existe — y deja a
 * quien la busca sin forma de saber qué hacer, que fue justo lo que preguntó el
 * usuario ("¿cómo saber de qué empresa es la orden a modificar?").
 *
 * ⚠️ Solo se nombran empresas donde el usuario TIENE un rol activo. Si la OP
 * vive en una empresa a la que no tiene acceso, la respuesta sigue siendo un
 * "no existe" pelado: confirmar lo contrario le contaría que otro inquilino
 * tiene una orden con ese número, que es exactamente lo que la separación por
 * empresa evita.
 *
 * Se llama SOLO cuando la búsqueda ya falló, así que no pesa en el camino
 * normal.
 */
export interface OpNoEncontrada {
  message: string;
  /**
   * `OP_EN_OTRA_EMPRESA` cuando la orden existe en otra empresa del usuario.
   * La pantalla lo usa para no ofrecer "ir a cargar la orden" cuando el arreglo
   * real es cambiar de empresa — dos consejos que se contradicen.
   */
  motivo?: 'OP_EN_OTRA_EMPRESA';
}

export async function mensajeOpNoEncontrada(
  prisma: PrismaService,
  params: {
    codigo: string;
    anio: number;
    correlativo: number;
    idUsuario: number;
    idEmpresaActual: number;
  },
): Promise<OpNoEncontrada> {
  const base = `No existe la orden de producción ${params.codigo} en esta empresa`;

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

  const candidatas = await prisma.ordenProduccion.findMany({
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
    motivo: 'OP_EN_OTRA_EMPRESA',
  };
}
