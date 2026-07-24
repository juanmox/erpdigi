import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface RegistrarAuditoriaInput {
  idEmpresa?: number | null;
  idUsuario?: number | null;
  entidad: string;
  idEntidad: string;
  accion: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN';
  datosAnteriores?: Record<string, unknown> | null;
  datosNuevos?: Record<string, unknown> | null;
  ipOrigen?: string | null;
  userAgent?: string | null;
}

function aJson(
  valor: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return valor == null ? Prisma.JsonNull : (valor as Prisma.InputJsonValue);
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(input: RegistrarAuditoriaInput) {
    await this.prisma.auditoria.create({
      data: {
        idEmpresa: input.idEmpresa ?? null,
        idUsuario: input.idUsuario ?? null,
        entidad: input.entidad,
        idEntidad: input.idEntidad,
        accion: input.accion,
        datosAnteriores: aJson(input.datosAnteriores),
        datosNuevos: aJson(input.datosNuevos),
        ipOrigen: input.ipOrigen ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async listar(params: {
    idEmpresa?: number;
    entidad?: string;
    limit?: number;
  }) {
    return this.prisma.auditoria.findMany({
      where: {
        idEmpresa: params.idEmpresa,
        entidad: params.entidad,
      },
      orderBy: { creadoEn: 'desc' },
      take: params.limit ?? 50,
    });
  }
}
