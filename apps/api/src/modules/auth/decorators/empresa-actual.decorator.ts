import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtPayload } from '../types/jwt-payload.type';

interface RequestConUsuario extends Request {
  user: JwtPayload;
}

/**
 * La empresa de la sesión, ya resuelta y garantizada no nula.
 *
 * `JwtPayload.idEmpresa` es `number | null`: es null entre el login y la
 * selección de empresa, cuando el usuario tiene acceso a más de una. Todo lo
 * que consulte o escriba datos de Costeo necesita saber de qué empresa habla,
 * así que acá se corta con un 403 en vez de dejar pasar un `undefined` que
 * terminaría en un `where` sin filtro — o sea, viendo las órdenes de todas las
 * empresas, que es exactamente el bug que la separación por empresa arregla.
 *
 * Se usa como parámetro del handler (`@EmpresaActual() idEmpresa: number`) para
 * que sea imposible olvidarlo en silencio: si el servicio lo pide, el
 * controlador tiene que declararlo.
 */
export const EmpresaActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest<RequestConUsuario>();
    const idEmpresa = request.user?.idEmpresa;
    if (idEmpresa == null) {
      throw new ForbiddenException(
        'Seleccioná una empresa antes de operar en este módulo',
      );
    }
    return idEmpresa;
  },
);
