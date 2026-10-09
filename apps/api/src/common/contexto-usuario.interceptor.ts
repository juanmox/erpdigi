import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { contextoPeticion } from './contexto-peticion';
import type { JwtPayload } from '../modules/auth/types/jwt-payload.type';

/**
 * Copia el username del JWT al contexto de la petición, para que la bitácora
 * lo guarde como texto sin que cada servicio tenga que pasarlo.
 *
 * Va en un interceptor y no en el middleware que crea el contexto porque los
 * middlewares corren ANTES de los guards: ahí todavía no hay usuario
 * autenticado. El orden de Nest es middleware → guards → interceptores.
 */
@Injectable()
export class ContextoUsuarioInterceptor implements NestInterceptor {
  intercept(
    contexto: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const store = contextoPeticion.getStore();
    if (store) {
      const req = contexto.switchToHttp().getRequest<{ user?: JwtPayload }>();
      store.usuarioNombre = req?.user?.username ?? null;
      store.idEmpresa = req?.user?.idEmpresa ?? null;
    }
    return next.handle();
  }
}
