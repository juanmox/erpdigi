import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MonedasService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.moneda.findMany({ orderBy: { codigoIso: 'asc' } });
  }

  listarTasasCambio(params: {
    idMonedaOrigen?: number;
    idMonedaDestino?: number;
    limit?: number;
  }) {
    return this.prisma.tasaCambio.findMany({
      where: {
        idMonedaOrigen: params.idMonedaOrigen,
        idMonedaDestino: params.idMonedaDestino,
      },
      orderBy: { fecha: 'desc' },
      take: params.limit ?? 30,
    });
  }
}
