import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EmpresaActual } from '../auth/decorators/empresa-actual.decorator';
import { SoloAutenticado } from '../auth/decorators/solo-autenticado.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { BiService } from './bi.service';

/**
 * Los dos endpoints son `@SoloAutenticado()` y NO `@RequirePermissions(...)`
 * por una razón concreta: `@RequirePermissions` exige TODOS los permisos que
 * lista, y cada tablero pide uno distinto (`ver` o `ver_financiero`). El
 * permiso se verifica dentro del servicio, tablero por tablero, y queda
 * escrito en `tableros.ts`.
 *
 * Antes de eso, ambos exigen el interruptor `plataforma.tableros.acceder`
 * (`PERMISO_ACCESO`): sin él el módulo no existe para ese usuario.
 */
@Controller('bi')
export class BiController {
  constructor(private readonly bi: BiService) {}

  /** Solo los tableros que el usuario puede ver. */
  @Get('tableros')
  @SoloAutenticado()
  listar(@CurrentUser() usuario: JwtPayload) {
    return this.bi.listar(usuario);
  }

  /** Acceso de corta vida a UN tablero, con la empresa de la sesión fijada. */
  @Post('token/:clave')
  @SoloAutenticado()
  token(
    @CurrentUser() usuario: JwtPayload,
    @EmpresaActual() idEmpresa: number,
    @Param('clave') clave: string,
  ) {
    return this.bi.emitirToken(usuario, idEmpresa, clave);
  }
}
