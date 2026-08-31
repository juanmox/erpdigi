import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { SOLO_AUTENTICADO_KEY } from '../decorators/solo-autenticado.decorator';
import { JwtPayload } from '../types/jwt-payload.type';

interface RequestConUsuario extends Request {
  user?: JwtPayload;
}

/**
 * Guard de permisos, **fail-closed** desde 2026-08-31.
 *
 * Antes era fail-open: un endpoint sin `@RequirePermissions` devolvía `true` y
 * quedaba abierto a cualquier usuario autenticado. Con 91 endpoints ya gateados
 * no era explotable, pero el modo de falla era pésimo: olvidar el decorador en
 * un controller nuevo abría esa operación **sin ningún síntoma** — sin error,
 * sin log, y las pruebas manuales no lo detectan porque quien prueba suele ser
 * admin. De cara a Inventario/Compras/Ventas (Fase 3), que mueven stock y
 * dinero, el riesgo de un descuido así no valía la comodidad.
 *
 * Ahora cada endpoint debe declarar una de tres cosas, y todas se leen en el
 * código como una decisión deliberada:
 *   - `@RequirePermissions(...)` — exige permisos concretos.
 *   - `@SoloAutenticado()`       — basta con tener sesión.
 *   - `@Public()`                — ni siquiera pide sesión (login, refresh).
 *
 * Lo que no declara nada se deniega, y `verificarRutasGateadas()` (main.ts) ni
 * siquiera deja arrancar el servidor en ese caso: el olvido pasa a ser un error
 * ruidoso en desarrollo en vez de un agujero callado en producción.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const objetivos = [context.getHandler(), context.getClass()];

    // @Public() ya lo dejó pasar JwtAuthGuard; acá solo hay que no estorbar.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, objetivos)) {
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(SOLO_AUTENTICADO_KEY, objetivos)
    ) {
      return true;
    }

    const permisosRequeridos = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      objetivos,
    );

    // Sin declaración: se deniega. Este es el cambio respecto del fail-open.
    if (!permisosRequeridos || permisosRequeridos.length === 0) {
      throw new ForbiddenException(
        'Este endpoint no declara permisos requeridos',
      );
    }

    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    const permisosDelUsuario = new Set(request.user?.permisos ?? []);
    // OJO: la semántica es Y, no O — se exigen TODOS los permisos listados.
    // Hoy ningún endpoint declara más de uno, pero el frontend usa O para
    // decidir qué mostrar en la navegación; no confundir ambas.
    const tienePermiso = permisosRequeridos.every((p) =>
      permisosDelUsuario.has(p),
    );

    if (!tienePermiso) {
      throw new ForbiddenException(
        'No tiene permiso para realizar esta acción',
      );
    }
    return true;
  }
}
