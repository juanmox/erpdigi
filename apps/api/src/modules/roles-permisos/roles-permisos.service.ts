import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesPermisosService {
  constructor(private readonly prisma: PrismaService) {}

  listarRoles() {
    return this.prisma.rol.findMany({
      include: { permisos: { include: { permiso: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  listarPermisos() {
    return this.prisma.permiso.findMany({ orderBy: { codigo: 'asc' } });
  }
}
