import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AsignarRolDto } from './dto/asignar-rol.dto';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { EditarUsuarioDto } from './dto/editar-usuario.dto';
import { EstablecerPasswordDto } from './dto/establecer-password.dto';

const PERMISO_ADMINISTRAR_USUARIOS = 'plataforma.usuarios.administrar';

const RONDAS_BCRYPT = 12;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  listar() {
    return this.prisma.usuario.findMany({
      select: {
        idUsuario: true,
        username: true,
        email: true,
        nombreCompleto: true,
        activo: true,
        ultimoLoginEn: true,
        creadoEn: true,
        empresaRoles: {
          where: { activo: true },
          include: { empresa: true, rol: true },
        },
      },
      orderBy: { nombreCompleto: 'asc' },
    });
  }

  async obtener(idUsuario: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario },
      select: {
        idUsuario: true,
        username: true,
        email: true,
        nombreCompleto: true,
        activo: true,
        ultimoLoginEn: true,
        creadoEn: true,
        empresaRoles: {
          where: { activo: true },
          include: { empresa: true, rol: true },
        },
      },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return usuario;
  }

  async crear(dto: CrearUsuarioDto, idUsuarioActor: number) {
    const existenteUsername = await this.prisma.usuario.findUnique({
      where: { username: dto.username },
    });
    if (existenteUsername)
      throw new ConflictException(
        'Ya existe un usuario con ese nombre de usuario',
      );

    if (dto.email) {
      const existenteEmail = await this.prisma.usuario.findUnique({
        where: { email: dto.email },
      });
      if (existenteEmail)
        throw new ConflictException('Ya existe un usuario con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, RONDAS_BCRYPT);
    const usuario = await this.prisma.usuario.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        nombreCompleto: dto.nombreCompleto,
      },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'usuarios',
      idEntidad: String(usuario.idUsuario),
      accion: 'CREATE',
      datosNuevos: { idUsuario: usuario.idUsuario, username: usuario.username },
    });

    return this.obtener(usuario.idUsuario);
  }

  // El correo NUNCA es la clave real de nada — idUsuario (Int, inmutable) es
  // lo que referencian creadoPor/anuladoPor/auditoría en todo el sistema, así
  // que editarlo acá no reescribe ni desvincula ningún historial ya guardado.
  async editar(
    idUsuario: number,
    dto: EditarUsuarioDto,
    idUsuarioActor: number,
  ) {
    await this.obtener(idUsuario);

    if (dto.username) {
      const existente = await this.prisma.usuario.findUnique({
        where: { username: dto.username },
      });
      if (existente && existente.idUsuario !== idUsuario)
        throw new ConflictException(
          'Ya existe un usuario con ese nombre de usuario',
        );
    }

    if (dto.email) {
      const existente = await this.prisma.usuario.findUnique({
        where: { email: dto.email },
      });
      if (existente && existente.idUsuario !== idUsuario)
        throw new ConflictException('Ya existe un usuario con ese email');
    }

    const usuario = await this.prisma.usuario.update({
      where: { idUsuario },
      data: {
        username: dto.username,
        email: dto.email,
        nombreCompleto: dto.nombreCompleto,
      },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'usuarios',
      idEntidad: String(idUsuario),
      accion: 'UPDATE',
      datosNuevos: {
        username: usuario.username,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
      },
    });

    return this.obtener(idUsuario);
  }

  async asignarRol(
    idUsuario: number,
    dto: AsignarRolDto,
    idUsuarioActor: number,
  ) {
    await this.obtener(idUsuario);
    const asignacion = await this.prisma.usuarioEmpresaRol.upsert({
      where: {
        idUsuario_idEmpresa_idRol: {
          idUsuario,
          idEmpresa: dto.idEmpresa,
          idRol: dto.idRol,
        },
      },
      update: { activo: true },
      create: { idUsuario, idEmpresa: dto.idEmpresa, idRol: dto.idRol },
    });

    await this.auditoria.registrar({
      idEmpresa: dto.idEmpresa,
      idUsuario: idUsuarioActor,
      entidad: 'usuario_empresa_rol',
      idEntidad: String(asignacion.idUsuarioEmpresaRol),
      accion: 'CREATE',
      datosNuevos: { idUsuario, idEmpresa: dto.idEmpresa, idRol: dto.idRol },
    });

    return this.obtener(idUsuario);
  }

  private async rolOtorgaAdministrarUsuarios(idRol: number): Promise<boolean> {
    const rolPermiso = await this.prisma.rolPermiso.findFirst({
      where: { idRol, permiso: { codigo: PERMISO_ADMINISTRAR_USUARIOS } },
    });
    return rolPermiso !== null;
  }

  async quitarRol(
    idUsuario: number,
    idEmpresa: number,
    idRol: number,
    idUsuarioActor: number,
  ) {
    if (
      idUsuario === idUsuarioActor &&
      (await this.rolOtorgaAdministrarUsuarios(idRol))
    ) {
      throw new ForbiddenException(
        'No podés quitarte tu propio rol de administrador',
      );
    }

    await this.prisma.usuarioEmpresaRol.updateMany({
      where: { idUsuario, idEmpresa, idRol },
      data: { activo: false },
    });

    await this.auditoria.registrar({
      idEmpresa,
      idUsuario: idUsuarioActor,
      entidad: 'usuario_empresa_rol',
      idEntidad: `${idUsuario}-${idEmpresa}-${idRol}`,
      accion: 'DELETE',
      datosAnteriores: { idUsuario, idEmpresa, idRol },
    });

    return this.obtener(idUsuario);
  }

  async desactivar(idUsuario: number, idUsuarioActor: number) {
    if (idUsuario === idUsuarioActor) {
      throw new ForbiddenException('No podés desactivar tu propia cuenta');
    }
    await this.obtener(idUsuario);
    const usuario = await this.prisma.usuario.update({
      where: { idUsuario },
      data: { activo: false },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'usuarios',
      idEntidad: String(idUsuario),
      accion: 'UPDATE',
      datosNuevos: { activo: usuario.activo },
    });

    return this.obtener(idUsuario);
  }

  async activar(idUsuario: number, idUsuarioActor: number) {
    await this.obtener(idUsuario);
    const usuario = await this.prisma.usuario.update({
      where: { idUsuario },
      data: { activo: true },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'usuarios',
      idEntidad: String(idUsuario),
      accion: 'UPDATE',
      datosNuevos: { activo: usuario.activo },
    });

    return this.obtener(idUsuario);
  }

  async establecerPassword(
    idUsuario: number,
    dto: EstablecerPasswordDto,
    idUsuarioActor: number,
  ) {
    await this.obtener(idUsuario);
    const passwordHash = await bcrypt.hash(dto.password, RONDAS_BCRYPT);
    await this.prisma.usuario.update({
      where: { idUsuario },
      data: { passwordHash },
    });

    // Revoca todas las sesiones activas de ese usuario — mismo patrón que la
    // detección de robo de refresh token en auth.service.ts. Si el propio admin
    // se resetea la contraseña, esto también revoca su sesión actual; el
    // frontend maneja ese caso cerrando sesión explícitamente.
    await this.prisma.refreshToken.updateMany({
      where: { idUsuario, revocado: false },
      data: { revocado: true },
    });

    await this.auditoria.registrar({
      idUsuario: idUsuarioActor,
      entidad: 'usuarios',
      idEntidad: String(idUsuario),
      accion: 'UPDATE',
      datosNuevos: { evento: 'password_reestablecida' },
    });

    return this.obtener(idUsuario);
  }
}
