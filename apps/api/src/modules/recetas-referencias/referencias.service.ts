import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReferenciasService {
  constructor(private readonly prisma: PrismaService) {}

  clientes() {
    return this.prisma.cliente.findMany({ orderBy: { nombre: 'asc' } });
  }

  tallas() {
    return this.prisma.talla.findMany({ orderBy: { orden: 'asc' } });
  }

  deportes() {
    return this.prisma.deporte.findMany({ orderBy: { nombre: 'asc' } });
  }

  areasUso() {
    return this.prisma.areaUso.findMany({ orderBy: { nombre: 'asc' } });
  }

  categoriasInsumo() {
    return this.prisma.categoriaInsumo.findMany({
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  unidadesMedida() {
    return this.prisma.unidadMedida.findMany({ orderBy: { nombre: 'asc' } });
  }

  async deporteEsValido(deporte?: string | null): Promise<boolean> {
    if (!deporte || !deporte.trim()) return true;
    const existe = await this.prisma.deporte.findFirst({
      where: { nombre: { equals: deporte.trim(), mode: 'insensitive' } },
    });
    return !!existe;
  }
}
