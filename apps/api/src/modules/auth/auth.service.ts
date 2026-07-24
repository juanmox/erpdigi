import { randomBytes, createHash } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from './types/jwt-payload.type';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export interface EmpresaDisponible {
  idEmpresa: number;
  codigo: string;
  nombreComercial: string | null;
  rol: string;
}

export interface SesionEmitida {
  accessToken: string;
  refreshToken: string;
  usuario: { idUsuario: number; email: string; nombreCompleto: string };
  idEmpresa: number | null;
  empresasDisponibles: EmpresaDisponible[];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async empresasActivasDe(
    idUsuario: number,
  ): Promise<EmpresaDisponible[]> {
    const asignaciones = await this.prisma.usuarioEmpresaRol.findMany({
      where: { idUsuario, activo: true, empresa: { activo: true } },
      include: { empresa: true, rol: true },
    });
    return asignaciones.map((a) => ({
      idEmpresa: a.empresa.idEmpresa,
      codigo: a.empresa.codigo,
      nombreComercial: a.empresa.nombreComercial,
      rol: a.rol.codigo,
    }));
  }

  private async claimsParaEmpresa(idUsuario: number, idEmpresa: number) {
    const asignaciones = await this.prisma.usuarioEmpresaRol.findMany({
      where: { idUsuario, idEmpresa, activo: true },
      include: {
        rol: { include: { permisos: { include: { permiso: true } } } },
      },
    });
    const roles = new Set<string>();
    const permisos = new Set<string>();
    for (const a of asignaciones) {
      roles.add(a.rol.codigo);
      for (const rp of a.rol.permisos) permisos.add(rp.permiso.codigo);
    }
    return { roles: [...roles], permisos: [...permisos] };
  }

  private async emitirSesion(
    usuario: { idUsuario: number; email: string; nombreCompleto: string },
    idEmpresa: number | null,
  ): Promise<SesionEmitida> {
    const empresasDisponibles = await this.empresasActivasDe(usuario.idUsuario);
    const { roles, permisos } = idEmpresa
      ? await this.claimsParaEmpresa(usuario.idUsuario, idEmpresa)
      : { roles: [], permisos: [] };

    const payload: JwtPayload = {
      sub: usuario.idUsuario,
      email: usuario.email,
      idEmpresa,
      roles,
      permisos,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        idUsuario: usuario.idUsuario,
        tokenHash: hashToken(refreshToken),
        expiraEn: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken,
      refreshToken,
      usuario,
      idEmpresa,
      empresasDisponibles,
    };
  }

  async login(email: string, password: string): Promise<SesionEmitida> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordValida) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const empresasDisponibles = await this.empresasActivasDe(usuario.idUsuario);
    if (empresasDisponibles.length === 0) {
      throw new ForbiddenException(
        'El usuario no tiene acceso a ninguna empresa',
      );
    }

    await this.prisma.usuario.update({
      where: { idUsuario: usuario.idUsuario },
      data: { ultimoLoginEn: new Date() },
    });

    const idEmpresa =
      empresasDisponibles.length === 1
        ? empresasDisponibles[0].idEmpresa
        : null;
    return this.emitirSesion(
      {
        idUsuario: usuario.idUsuario,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
      },
      idEmpresa,
    );
  }

  async seleccionarEmpresa(
    idUsuario: number,
    idEmpresa: number,
  ): Promise<SesionEmitida> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario },
    });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException();
    }
    const empresasDisponibles = await this.empresasActivasDe(idUsuario);
    if (!empresasDisponibles.some((e) => e.idEmpresa === idEmpresa)) {
      throw new ForbiddenException('No tiene acceso a esa empresa');
    }
    return this.emitirSesion(
      {
        idUsuario: usuario.idUsuario,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
      },
      idEmpresa,
    );
  }

  async refrescar(rawToken: string): Promise<SesionEmitida> {
    const tokenHash = hashToken(rawToken);
    const registro = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!registro) {
      throw new UnauthorizedException('Sesión inválida');
    }
    if (registro.revocado) {
      // Reuso de un refresh token ya rotado: posible robo de token — se revoca toda la sesión.
      await this.prisma.refreshToken.updateMany({
        where: { idUsuario: registro.idUsuario, revocado: false },
        data: { revocado: true },
      });
      throw new UnauthorizedException(
        'Sesión inválida, inicie sesión nuevamente',
      );
    }
    if (registro.expiraEn < new Date()) {
      throw new UnauthorizedException('Sesión expirada');
    }

    await this.prisma.refreshToken.update({
      where: { idRefreshToken: registro.idRefreshToken },
      data: { revocado: true },
    });

    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: registro.idUsuario },
    });
    if (!usuario || !usuario.activo) {
      throw new UnauthorizedException();
    }

    const empresasDisponibles = await this.empresasActivasDe(usuario.idUsuario);
    const idEmpresa =
      empresasDisponibles.length === 1
        ? empresasDisponibles[0].idEmpresa
        : null;
    return this.emitirSesion(
      {
        idUsuario: usuario.idUsuario,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
      },
      idEmpresa,
    );
  }

  async cerrarSesion(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revocado: false },
      data: { revocado: true },
    });
  }
}
