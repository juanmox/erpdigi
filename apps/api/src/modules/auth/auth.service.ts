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

/**
 * Minutos sin actividad del usuario antes de cerrar la sesión, cuando ni el
 * usuario ni sus roles definen uno propio.
 *
 * ⚠️ No confundir con `ACCESS_TOKEN_TTL`, que casualmente vale lo mismo. Son
 * mecanismos distintos: el token se renueva SOLO —la app hace peticiones sola, el
 * panel de impresoras refresca cada 30s— así que una pantalla olvidada nunca
 * caduca por sí misma. Este contador mira la actividad REAL del usuario (mouse
 * y teclado) y es el único que cierra una máquina desatendida en planta.
 */
const MINUTOS_INACTIVIDAD_DEFAULT = 15;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

export interface EmpresaDisponible {
  idEmpresa: number;
  codigo: string;
  nombreComercial: string | null;
  /** Nombre legal, para encabezar documentos formales (requisiciones, reportes). */
  razonSocial: string;
  /** TODOS los roles activos del usuario en esa empresa, no uno solo. */
  roles: string[];
  /** #RRGGBB de `core.empresas.color_marca`, para distinguirlas en pantalla. */
  colorMarca: string | null;
  /**
   * Logo como data URI. Viaja en la sesión —y no por un endpoint aparte—
   * porque los documentos impresos se arman en un iframe con su propio HTML:
   * ahí un `<img src="/ruta">` no lleva el token y depende del prefijo del
   * servidor, mientras que un data URI ya viene resuelto. Son ~19 KB por
   * empresa; si alguna vez pesa, el camino es servirlo aparte y cachearlo.
   */
  logo: string | null;
}

export interface SesionEmitida {
  accessToken: string;
  refreshToken: string;
  usuario: {
    idUsuario: number;
    username: string;
    email: string | null;
    nombreCompleto: string;
  };
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

  /**
   * Una entrada por EMPRESA, no por asignación.
   *
   * `usuario_empresa_rol` es una tripleta (usuario, empresa, rol), asi que un
   * usuario con 3 roles en la misma empresa tiene 3 filas. Devolver una por
   * fila rompía dos cosas: la pantalla de selección mostraba la misma empresa
   * repetida y parecía un selector de ROL, y `login()` —que compara contra 1
   * para autoseleccionar— obligaba a elegir aunque hubiera una sola empresa.
   *
   * Los roles nunca fueron excluyentes: `claimsParaEmpresa` ya une los
   * permisos de todos los roles que el usuario tiene en la empresa elegida.
   * Lo que faltaba era decirlo así en la respuesta.
   */
  private async empresasActivasDe(
    idUsuario: number,
  ): Promise<EmpresaDisponible[]> {
    const asignaciones = await this.prisma.usuarioEmpresaRol.findMany({
      where: { idUsuario, activo: true, empresa: { activo: true } },
      include: { empresa: true, rol: true },
      orderBy: [{ idEmpresa: 'asc' }, { rol: { codigo: 'asc' } }],
    });
    const porEmpresa = new Map<number, EmpresaDisponible>();
    for (const a of asignaciones) {
      const ya = porEmpresa.get(a.empresa.idEmpresa);
      if (ya) {
        if (!ya.roles.includes(a.rol.codigo)) ya.roles.push(a.rol.codigo);
        continue;
      }
      porEmpresa.set(a.empresa.idEmpresa, {
        idEmpresa: a.empresa.idEmpresa,
        codigo: a.empresa.codigo,
        nombreComercial: a.empresa.nombreComercial,
        razonSocial: a.empresa.razonSocial,
        roles: [a.rol.codigo],
        colorMarca: a.empresa.colorMarca,
        logo: a.empresa.logo,
      });
    }
    return [...porEmpresa.values()];
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
    // Con varios roles gana el MÁS CORTO. Si ganara el más largo bastaría
    // sumar un rol permisivo para anular el control en toda la planta.
    // Los roles sin valor propio (null) no participan: son "no opino".
    let minutosDeRoles: number | null = null;
    for (const a of asignaciones) {
      roles.add(a.rol.codigo);
      for (const rp of a.rol.permisos) permisos.add(rp.permiso.codigo);
      const m = a.rol.minutosInactividad;
      if (m != null && (minutosDeRoles == null || m < minutosDeRoles))
        minutosDeRoles = m;
    }
    return {
      roles: [...roles],
      permisos: [...permisos],
      minutosDeRoles,
    };
  }

  /**
   * Minutos de inactividad que rigen para esta sesión.
   *
   * Cadena: lo del USUARIO gana sobre lo del rol, y si ninguno define nada
   * queda el default. El valor del usuario es la excepción puntual — así no hay
   * que crear un rol entero para una sola persona.
   *
   * `0` significa "nunca cerrar" y es un valor legítimo, no un vacío: por eso
   * la comparación es contra `null` y no un `||`, que lo trataría como falsy y
   * silenciosamente activaría el cierre en un rol de oficina.
   */
  private resolverMinutosInactividad(
    delUsuario: number | null | undefined,
    deRoles: number | null,
  ): number {
    if (delUsuario != null) return delUsuario;
    if (deRoles != null) return deRoles;
    return MINUTOS_INACTIVIDAD_DEFAULT;
  }

  private async emitirSesion(
    usuario: {
      idUsuario: number;
      username: string;
      email: string | null;
      nombreCompleto: string;
      // Obligatorio a propósito, no opcional: los tres llamadores arman este
      // objeto a mano y, siendo opcional, olvidarlo pasaba desapercibido y el
      // valor del usuario se perdía en silencio. Así el compilador los señala.
      minutosInactividad: number | null;
    },
    idEmpresa: number | null,
  ): Promise<SesionEmitida> {
    const empresasDisponibles = await this.empresasActivasDe(usuario.idUsuario);
    const { roles, permisos, minutosDeRoles } = idEmpresa
      ? await this.claimsParaEmpresa(usuario.idUsuario, idEmpresa)
      : { roles: [], permisos: [], minutosDeRoles: null };

    const payload: JwtPayload = {
      sub: usuario.idUsuario,
      username: usuario.username,
      idEmpresa,
      roles,
      permisos,
      // Viaja en el token y no en un endpoint aparte: el navegador ya lo tiene
      // desde el primer render, sin una llamada extra antes de poder contar.
      // ⚠️ Como consecuencia, cambiarlo tarda hasta 15 minutos en llegar a una
      // sesión abierta (hasta el próximo refresco) — igual que los permisos.
      minutosInactividad: this.resolverMinutosInactividad(
        usuario.minutosInactividad,
        minutosDeRoles,
      ),
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

  async login(username: string, password: string): Promise<SesionEmitida> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { username },
    });
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

    // Se pregunta solo cuando hay más de una EMPRESA. Tener varios roles en la
    // misma empresa no es una elección: se usan todos a la vez.
    const idEmpresa =
      empresasDisponibles.length === 1
        ? empresasDisponibles[0].idEmpresa
        : null;
    return this.emitirSesion(
      {
        idUsuario: usuario.idUsuario,
        username: usuario.username,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
        minutosInactividad: usuario.minutosInactividad,
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
        username: usuario.username,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
        minutosInactividad: usuario.minutosInactividad,
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
        username: usuario.username,
        email: usuario.email,
        nombreCompleto: usuario.nombreCompleto,
        minutosInactividad: usuario.minutosInactividad,
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
