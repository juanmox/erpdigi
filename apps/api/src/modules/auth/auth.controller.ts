import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService, SesionEmitida } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { SeleccionarEmpresaDto } from './dto/seleccionar-empresa.dto';
import type { JwtPayload } from './types/jwt-payload.type';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/erp/api/auth';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure:
        this.config.get('COOKIE_SECURE') ??
        this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });
  }

  private respuesta(sesion: SesionEmitida) {
    return {
      accessToken: sesion.accessToken,
      usuario: sesion.usuario,
      idEmpresa: sesion.idEmpresa,
      empresasDisponibles: sesion.empresasDisponibles,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sesion = await this.authService.login(dto.username, dto.password);
    this.setRefreshCookie(res, sesion.refreshToken);
    return this.respuesta(sesion);
  }

  @Post('seleccionar-empresa')
  @HttpCode(200)
  async seleccionarEmpresa(
    @CurrentUser() usuario: JwtPayload,
    @Body() dto: SeleccionarEmpresaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sesion = await this.authService.seleccionarEmpresa(
      usuario.sub,
      dto.idEmpresa,
    );
    this.setRefreshCookie(res, sesion.refreshToken);
    return this.respuesta(sesion);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refrescar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedException('No hay sesión activa');
    }
    const sesion = await this.authService.refrescar(rawToken);
    this.setRefreshCookie(res, sesion.refreshToken);
    return this.respuesta(sesion);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (rawToken) {
      await this.authService.cerrarSesion(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() usuario: JwtPayload) {
    return usuario;
  }
}
