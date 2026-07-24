import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AsignarRolDto } from './dto/asignar-rol.dto';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';

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
    const existente = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });
    if (existente)
      throw new ConflictException('Ya existe un usuario con ese email');

    const passwordHash = await bcrypt.hash(dto.password, RONDAS_BCRYPT);
    const usuario = await this.prisma.usuario.create({
      data: {
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
      datosNuevos: { idUsuario: usuario.idUsuario, email: usuario.email },
    });

    return this.obtener(usuario.idUsuario);
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

  async quitarRol(
    idUsuario: number,
    idEmpresa: number,
    idRol: number,
    idUsuarioActor: number,
  ) {
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
}
