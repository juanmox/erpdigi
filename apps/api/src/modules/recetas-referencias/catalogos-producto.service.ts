import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

export const TIPOS_CATALOGO_PRODUCTO = [
  'estilos',
  'lineas',
  'generos',
  'composiciones',
] as const;
export type TipoCatalogoProducto = (typeof TIPOS_CATALOGO_PRODUCTO)[number];

/** Forma común de las cuatro tablas, con el id ya normalizado. */
export interface ValorCatalogo {
  id: number;
  nombre: string;
  activo: boolean;
  /** Cuántos productos lo usan, para decidir entre retirar o dejar. */
  productos: number;
}

interface Adaptador {
  /** Nombre de la entidad en `core.auditoria`. */
  entidad: string;
  /** Largo máximo de la columna. */
  max: number;
  listar(): Promise<ValorCatalogo[]>;
  /** Busca por nombre sin distinguir mayúsculas. */
  buscar(nombre: string): Promise<{ id: number } | null>;
  crear(nombre: string): Promise<ValorCatalogo>;
  obtener(id: number): Promise<ValorCatalogo | null>;
  actualizar(
    id: number,
    data: { nombre?: string; activo?: boolean },
  ): Promise<ValorCatalogo>;
}

const IG = 'insensitive' as const;
const CONTEO = { _count: { select: { productos: true } } } as const;

/** Normaliza una fila de cualquiera de las cuatro tablas. */
function valor(
  id: number,
  x: { nombre: string; activo: boolean; _count?: { productos: number } },
): ValorCatalogo {
  return {
    id,
    nombre: x.nombre,
    activo: x.activo,
    productos: x._count?.productos ?? 0,
  };
}

/**
 * Los cuatro catálogos que describen al producto para la estadística:
 * estilos (tipo de prenda), líneas (comercial), géneros y composiciones.
 *
 * Son cuatro tablas con la misma forma, así que un adaptador por tabla y una
 * sola lógica de alta/edición — en vez de cuatro servicios que se desalineen.
 * Los nombres no se repiten sin importar mayúsculas ("V-Neck" = "V-NECK"): la
 * base lo impone con un índice único sobre lower(nombre) y acá se revisa antes
 * para dar un mensaje legible.
 */
@Injectable()
export class CatalogosProductoService {
  private readonly adaptadores: Record<TipoCatalogoProducto, Adaptador>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {
    const p = this.prisma;
    this.adaptadores = {
      estilos: {
        entidad: 'recetas.estilos',
        max: 80,
        listar: async () =>
          (
            await p.estilo.findMany({
              orderBy: { nombre: 'asc' },
              include: CONTEO,
            })
          ).map((x) => valor(x.idEstilo, x)),
        buscar: async (n) => {
          const x = await p.estilo.findFirst({
            where: { nombre: { equals: n, mode: IG } },
          });
          return x ? { id: x.idEstilo } : null;
        },
        crear: async (n) => {
          const x = await p.estilo.create({ data: { nombre: n } });
          return valor(x.idEstilo, x);
        },
        obtener: async (id) => {
          const x = await p.estilo.findUnique({
            where: { idEstilo: id },
            include: CONTEO,
          });
          return x ? valor(x.idEstilo, x) : null;
        },
        actualizar: async (id, data) => {
          const x = await p.estilo.update({
            where: { idEstilo: id },
            data,
            include: CONTEO,
          });
          return valor(x.idEstilo, x);
        },
      },
      lineas: {
        entidad: 'recetas.lineas',
        max: 80,
        listar: async () =>
          (
            await p.linea.findMany({
              orderBy: { nombre: 'asc' },
              include: CONTEO,
            })
          ).map((x) => valor(x.idLinea, x)),
        buscar: async (n) => {
          const x = await p.linea.findFirst({
            where: { nombre: { equals: n, mode: IG } },
          });
          return x ? { id: x.idLinea } : null;
        },
        crear: async (n) => {
          const x = await p.linea.create({ data: { nombre: n } });
          return valor(x.idLinea, x);
        },
        obtener: async (id) => {
          const x = await p.linea.findUnique({
            where: { idLinea: id },
            include: CONTEO,
          });
          return x ? valor(x.idLinea, x) : null;
        },
        actualizar: async (id, data) => {
          const x = await p.linea.update({
            where: { idLinea: id },
            data,
            include: CONTEO,
          });
          return valor(x.idLinea, x);
        },
      },
      generos: {
        entidad: 'recetas.generos',
        max: 80,
        listar: async () =>
          (
            await p.genero.findMany({
              orderBy: { nombre: 'asc' },
              include: CONTEO,
            })
          ).map((x) => valor(x.idGenero, x)),
        buscar: async (n) => {
          const x = await p.genero.findFirst({
            where: { nombre: { equals: n, mode: IG } },
          });
          return x ? { id: x.idGenero } : null;
        },
        crear: async (n) => {
          const x = await p.genero.create({ data: { nombre: n } });
          return valor(x.idGenero, x);
        },
        obtener: async (id) => {
          const x = await p.genero.findUnique({
            where: { idGenero: id },
            include: CONTEO,
          });
          return x ? valor(x.idGenero, x) : null;
        },
        actualizar: async (id, data) => {
          const x = await p.genero.update({
            where: { idGenero: id },
            data,
            include: CONTEO,
          });
          return valor(x.idGenero, x);
        },
      },
      composiciones: {
        entidad: 'recetas.composiciones',
        max: 120,
        listar: async () =>
          (
            await p.composicion.findMany({
              orderBy: { nombre: 'asc' },
              include: CONTEO,
            })
          ).map((x) => valor(x.idComposicion, x)),
        buscar: async (n) => {
          const x = await p.composicion.findFirst({
            where: { nombre: { equals: n, mode: IG } },
          });
          return x ? { id: x.idComposicion } : null;
        },
        crear: async (n) => {
          const x = await p.composicion.create({ data: { nombre: n } });
          return valor(x.idComposicion, x);
        },
        obtener: async (id) => {
          const x = await p.composicion.findUnique({
            where: { idComposicion: id },
            include: CONTEO,
          });
          return x ? valor(x.idComposicion, x) : null;
        },
        actualizar: async (id, data) => {
          const x = await p.composicion.update({
            where: { idComposicion: id },
            data,
            include: CONTEO,
          });
          return valor(x.idComposicion, x);
        },
      },
    };
  }

  private adaptador(tipo: string): Adaptador {
    const a = this.adaptadores[tipo as TipoCatalogoProducto];
    // `hasOwn`: un tipo como "constructor" resolvería a algo del prototipo.
    if (!a || !Object.hasOwn(this.adaptadores, tipo))
      throw new NotFoundException(`No existe el catálogo "${tipo}"`);
    return a;
  }

  listar(tipo: string) {
    return this.adaptador(tipo).listar();
  }

  async crear(tipo: string, nombreCrudo: string, idUsuarioActor: number) {
    const a = this.adaptador(tipo);
    const nombre = this.nombreValido(a, nombreCrudo);
    if (await a.buscar(nombre))
      throw new ConflictException(
        `Ya existe "${nombre}" (sin importar mayúsculas).`,
      );
    try {
      const creado = await a.crear(nombre);
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: a.entidad,
        idEntidad: String(creado.id),
        accion: 'CREATE',
        datosNuevos: { nombre },
      });
      return creado;
    } catch (e) {
      // Dos altas simultáneas del mismo nombre: la pasa la revisión de arriba y
      // la frena el índice único.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException(
          `Ya existe "${nombre}" (sin importar mayúsculas).`,
        );
      throw e;
    }
  }

  async editar(
    tipo: string,
    id: number,
    dto: { nombre?: string; activo?: boolean },
    idUsuarioActor: number,
  ) {
    const a = this.adaptador(tipo);
    const anterior = await a.obtener(id);
    if (!anterior) throw new NotFoundException('No existe ese valor');

    const data: { nombre?: string; activo?: boolean } = {};
    if (dto.nombre !== undefined) {
      const nombre = this.nombreValido(a, dto.nombre);
      if (nombre !== anterior.nombre) {
        const repetido = await a.buscar(nombre);
        if (repetido && repetido.id !== id)
          throw new ConflictException(
            `Ya existe "${nombre}" (sin importar mayúsculas).`,
          );
        data.nombre = nombre;
      }
    }
    if (dto.activo !== undefined && dto.activo !== anterior.activo)
      data.activo = dto.activo;
    if (Object.keys(data).length === 0) return anterior;

    try {
      const nuevo = await a.actualizar(id, data);
      await this.auditoria.registrar({
        idUsuario: idUsuarioActor,
        entidad: a.entidad,
        idEntidad: String(id),
        accion: 'UPDATE',
        datosAnteriores: { nombre: anterior.nombre, activo: anterior.activo },
        datosNuevos: { nombre: nuevo.nombre, activo: nuevo.activo },
      });
      return nuevo;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('Ya existe otro valor con ese nombre.');
      throw e;
    }
  }

  private nombreValido(a: Adaptador, crudo: string): string {
    const nombre = crudo.trim().replace(/\s+/g, ' ');
    if (!nombre) throw new BadRequestException('El nombre no puede ir vacío');
    if (nombre.length > a.max)
      throw new BadRequestException(
        `El nombre admite hasta ${a.max} caracteres`,
      );
    return nombre;
  }
}
