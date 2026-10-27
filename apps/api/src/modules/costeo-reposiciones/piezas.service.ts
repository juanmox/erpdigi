import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EditarPiezaDto } from './dto/pieza.dto';

const MAX_NOMBRE = 80;
const IG = 'insensitive' as const;

export interface ValorPieza {
  idPieza: number;
  nombre: string;
  activo: boolean;
  /** Cuántas líneas de prendas repuestas la usan, para decidir entre retirar o dejar. */
  usos: number;
}

/**
 * Catálogo de piezas de una prenda (cuello, manga, frontal…). Alta, renombrado y
 * retiro: una pieza se RETIRA y no se borra, así sale de los selectores sin
 * tocar las reposiciones que ya la usaron (la FK es RESTRICT).
 *
 * Mismo patrón que `CatalogosProductoService`. Los nombres se guardan en
 * MAYÚSCULAS, como el listado original ("CUELLO V"), para que el catálogo se
 * mantenga uniforme sin importar cómo lo teclee cada usuario, y no se repiten
 * sin importar mayúsculas (índice único sobre lower(nombre)).
 */
@Injectable()
export class PiezasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private normalizar(crudo: string): string {
    const nombre = crudo.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es');
    if (!nombre) throw new BadRequestException('El nombre no puede ir vacío');
    if (nombre.length > MAX_NOMBRE)
      throw new BadRequestException(
        `El nombre admite hasta ${MAX_NOMBRE} caracteres`,
      );
    return nombre;
  }

  private aValor(x: {
    idPieza: number;
    nombre: string;
    activo: boolean;
    _count: { prendas: number };
  }): ValorPieza {
    return {
      idPieza: x.idPieza,
      nombre: x.nombre,
      activo: x.activo,
      usos: x._count.prendas,
    };
  }

  async listar(): Promise<ValorPieza[]> {
    const filas = await this.prisma.pieza.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { prendas: true } } },
    });
    return filas.map((x) => this.aValor(x));
  }

  async crear(nombreCrudo: string, idUsuarioActor: number) {
    const nombre = this.normalizar(nombreCrudo);
    const repetida = await this.prisma.pieza.findFirst({
      where: { nombre: { equals: nombre, mode: IG } },
    });
    if (repetida)
      throw new ConflictException(`Ya existe la pieza "${repetida.nombre}".`);
    try {
      const creada = await this.prisma.pieza.create({
        data: { nombre },
        include: { _count: { select: { prendas: true } } },
      });
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'costeo.pieza',
        idEntidad: String(creada.idPieza),
        accion: 'CREATE',
        datosNuevos: { nombre },
      });
      return this.aValor(creada);
    } catch (e) {
      // Dos altas simultáneas: la pasa la revisión de arriba y la frena el índice.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException(`Ya existe la pieza "${nombre}".`);
      throw e;
    }
  }

  async editar(id: number, dto: EditarPiezaDto, idUsuarioActor: number) {
    const anterior = await this.prisma.pieza.findUnique({
      where: { idPieza: id },
      include: { _count: { select: { prendas: true } } },
    });
    if (!anterior) throw new NotFoundException('No existe esa pieza');

    const data: { nombre?: string; activo?: boolean } = {};
    if (dto.nombre !== undefined) {
      const nombre = this.normalizar(dto.nombre);
      if (nombre !== anterior.nombre) {
        const repetida = await this.prisma.pieza.findFirst({
          where: { nombre: { equals: nombre, mode: IG }, NOT: { idPieza: id } },
        });
        if (repetida)
          throw new ConflictException(
            `Ya existe la pieza "${repetida.nombre}".`,
          );
        data.nombre = nombre;
      }
    }
    if (dto.activo !== undefined && dto.activo !== anterior.activo)
      data.activo = dto.activo;
    if (Object.keys(data).length === 0) return this.aValor(anterior);

    try {
      const nueva = await this.prisma.pieza.update({
        where: { idPieza: id },
        data,
        include: { _count: { select: { prendas: true } } },
      });
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: 'costeo.pieza',
        idEntidad: String(id),
        accion: 'UPDATE',
        datosAnteriores: { nombre: anterior.nombre, activo: anterior.activo },
        datosNuevos: { nombre: nueva.nombre, activo: nueva.activo },
      });
      return this.aValor(nueva);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('Ya existe otra pieza con ese nombre.');
      throw e;
    }
  }
}
