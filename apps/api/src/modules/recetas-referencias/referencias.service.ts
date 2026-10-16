import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReferenciasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Solo los activos: este endpoint alimenta selectores, y ofrecer un cliente
   * retirado invita a seguir usándolo. Los registros que YA apuntan a uno
   * inactivo no se ven afectados — su nombre se resuelve por id, no por esta
   * lista.
   */
  clientes() {
    return this.prisma.cliente.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Subclientes activos (divisiones/marcas de un cliente). Traen su cliente
   * padre porque el selector del producto tiene que poder mostrar a quién
   * pertenecen: dos clientes podrían tener un subcliente con el mismo nombre.
   */
  subclientes() {
    return this.prisma.subcliente.findMany({
      where: { activo: true },
      orderBy: [{ cliente: { nombre: 'asc' } }, { nombre: 'asc' }],
      select: {
        idSubcliente: true,
        idCliente: true,
        codigo: true,
        nombre: true,
        cliente: { select: { nombre: true } },
      },
    });
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
