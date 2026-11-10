import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Historial de cambios de un ítem de la explosión de materiales.
 *
 * Una fila de `costeo.material_op_historial` por ítem y por acto. Se escribe en
 * la MISMA transacción que el cambio: no puede haber un cambio sin historial.
 */

export type AccionHistorial =
  | 'EDITAR'
  | 'ANULAR'
  | 'ENTREGAR'
  | 'CORREGIR_FECHA'
  | 'REVERTIR'
  | 'COSTO_CONGELADO'
  | 'LIGAR_OP';

/** Un campo que cambió. Valores como texto: el historial es para leerlo. */
export interface CambioMaterial {
  campo: string;
  antes: string | null;
  despues: string | null;
}

/** Los campos que son dinero: sin `ver_financiero` no se devuelven. */
const CAMPOS_DINERO = new Set(['costoUnitario', 'costoTotal']);

export function sinDinero(cambios: CambioMaterial[], verDinero: boolean) {
  return verDinero
    ? cambios
    : cambios.filter((c) => !CAMPOS_DINERO.has(c.campo));
}

function comoTexto(v: Prisma.JsonValue | undefined): string | null {
  if (v == null) return null;
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Lo de la base viene como JSON sin tipo: se valida antes de usarlo. */
export function leerCambios(valor: Prisma.JsonValue): CambioMaterial[] {
  if (!Array.isArray(valor)) return [];
  const salida: CambioMaterial[] = [];
  for (const c of valor) {
    if (
      c &&
      typeof c === 'object' &&
      !Array.isArray(c) &&
      typeof c.campo === 'string'
    ) {
      salida.push({
        campo: c.campo,
        antes: comoTexto(c.antes),
        despues: comoTexto(c.despues),
      });
    }
  }
  return salida;
}

export interface NuevoEvento {
  idEmpresa: number;
  idMaterialOp: number;
  accion: AccionHistorial;
  cambios: CambioMaterial[];
  motivo?: string | null;
  idUsuario: number;
  usuarioNombre: string;
}

type ConHistorial = Pick<PrismaService, 'materialOpHistorial'>;

export async function crearEventos(tx: ConHistorial, eventos: NuevoEvento[]) {
  if (eventos.length === 0) return;
  await tx.materialOpHistorial.createMany({
    data: eventos.map((e) => ({
      idEmpresa: e.idEmpresa,
      idMaterialOp: e.idMaterialOp,
      accion: e.accion,
      cambios: e.cambios as unknown as Prisma.InputJsonValue,
      motivo: e.motivo?.trim() || null,
      idUsuario: e.idUsuario,
      usuarioNombre: e.usuarioNombre.slice(0, 80),
    })),
  });
}

/** El nombre con el que el usuario aparece en el historial (foto del momento). */
export async function nombreParaHistorial(
  tx: Pick<PrismaService, 'usuario'>,
  idUsuario: number,
): Promise<string> {
  const u = await tx.usuario.findUnique({
    where: { idUsuario },
    select: { username: true, nombreCompleto: true },
  });
  return (u?.nombreCompleto || u?.username || `Usuario ${idUsuario}`).slice(
    0,
    80,
  );
}

/** Texto de un valor para el historial; vacío se guarda como null, no como "". */
export const textoCambio = (v: string | number | null | undefined) =>
  v == null || v === '' ? null : String(v);
