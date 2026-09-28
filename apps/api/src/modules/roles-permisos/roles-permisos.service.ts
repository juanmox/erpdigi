import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ActualizarPermisosRolDto, CrearRolDto } from './dto/roles.dto';

/**
 * ADMIN no se edita desde la pantalla, a propósito.
 *
 * Es el rol que por definición tiene todos los permisos, y el seed lo
 * reconcilia en cada corrida. Eso lo vuelve el camino de recuperación si
 * alguien se recorta a sí mismo por error desde la pantalla de Roles. Si se
 * dejara personalizar, un permiso nuevo de una release futura dejaría de
 * llegarle solo y nadie se enteraría hasta necesitarlo.
 */
const ROL_NO_EDITABLE = 'ADMIN';

const PERMISO_ADMINISTRAR_ROLES = 'plataforma.roles.administrar';

@Injectable()
export class RolesPermisosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  listarRoles() {
    return this.prisma.rol.findMany({
      include: { permisos: { include: { permiso: true } } },
      orderBy: { nombre: 'asc' },
    });
  }

  listarPermisos() {
    return this.prisma.permiso.findMany({ orderBy: { codigo: 'asc' } });
  }

  async crearRol(dto: CrearRolDto, idUsuarioActor: number) {
    const existente = await this.prisma.rol.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existente)
      throw new ConflictException(
        `Ya existe un rol con el código ${dto.codigo}`,
      );

    // Nace sin permisos y ya marcado como personalizado: no lo administra el
    // seed, así que nada lo va a reconciliar después.
    const rol = await this.prisma.rol.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        esRolSistema: false,
        personalizado: true,
      },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'core.roles',
      idEntidad: String(rol.idRol),
      accion: 'CREATE',
      datosNuevos: { codigo: rol.codigo, nombre: rol.nombre },
    });

    return rol;
  }

  /**
   * Reemplaza el conjunto de permisos de un rol.
   *
   * `rolesDelActor` viene de los claims del token y sirve para una sola cosa:
   * impedir que alguien se quite a sí mismo el permiso de administrar roles y
   * quede sin poder volver a entrar a esta pantalla. No es una salvaguarda
   * absoluta —ADMIN siempre puede recuperarlo— pero evita el tropiezo obvio.
   */
  async actualizarPermisos(
    idRol: number,
    dto: ActualizarPermisosRolDto,
    idUsuarioActor: number,
    rolesDelActor: string[],
  ) {
    const rol = await this.prisma.rol.findUnique({
      where: { idRol },
      include: { permisos: { include: { permiso: true } } },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');

    if (rol.codigo === ROL_NO_EDITABLE)
      throw new BadRequestException(
        'El rol Administrador no se edita: por definición tiene todos los permisos, y es el camino de recuperación si otro rol queda mal configurado.',
      );

    // Se resuelven los códigos contra el catálogo real. Un código inventado es
    // un error explícito y no una línea que se pierde en silencio.
    const permisos = await this.prisma.permiso.findMany({
      where: { codigo: { in: dto.codigosPermisos } },
    });
    if (permisos.length !== dto.codigosPermisos.length) {
      const encontrados = new Set(permisos.map((p) => p.codigo));
      const faltan = dto.codigosPermisos.filter((c) => !encontrados.has(c));
      throw new BadRequestException(
        `Estos permisos no existen: ${faltan.join(', ')}`,
      );
    }

    const teniaAdministrarRoles = rol.permisos.some(
      (rp) => rp.permiso.codigo === PERMISO_ADMINISTRAR_ROLES,
    );
    const quedaConAdministrarRoles = dto.codigosPermisos.includes(
      PERMISO_ADMINISTRAR_ROLES,
    );
    if (
      teniaAdministrarRoles &&
      !quedaConAdministrarRoles &&
      rolesDelActor.includes(rol.codigo)
    )
      throw new ConflictException(
        `No podés quitarle "${PERMISO_ADMINISTRAR_ROLES}" a un rol que vos mismo tenés: perderías el acceso a esta pantalla.`,
      );

    const idsDeseados = permisos.map((p) => p.idPermiso);
    const antes = rol.permisos.map((rp) => rp.permiso.codigo).sort();

    await this.prisma.$transaction(async (tx) => {
      await tx.rolPermiso.deleteMany({
        where: { idRol, idPermiso: { notIn: idsDeseados } },
      });
      if (idsDeseados.length > 0) {
        await tx.rolPermiso.createMany({
          data: idsDeseados.map((idPermiso) => ({ idRol, idPermiso })),
          skipDuplicates: true,
        });
      }
      // A partir de acá el seed no le toca más los permisos a este rol (ver el
      // comentario de `personalizado` en core.prisma y el early-return de
      // upsertRolConPermisos en seed.ts).
      await tx.rol.update({ where: { idRol }, data: { personalizado: true } });
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'core.roles',
      idEntidad: String(idRol),
      accion: 'UPDATE',
      datosAnteriores: { permisos: antes },
      datosNuevos: { permisos: [...dto.codigosPermisos].sort() },
    });

    return this.prisma.rol.findUniqueOrThrow({
      where: { idRol },
      include: { permisos: { include: { permiso: true } } },
    });
  }
}
