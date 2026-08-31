import { INestApplication, Logger, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../modules/auth/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../modules/auth/decorators/permissions.decorator';
import { SOLO_AUTENTICADO_KEY } from '../modules/auth/decorators/solo-autenticado.decorator';

/**
 * Recorre los controllers registrados y aborta el arranque si algún handler no
 * declara `@RequirePermissions`, `@SoloAutenticado` o `@Public`.
 *
 * Por qué existe: `PermissionsGuard` pasó a fail-closed (2026-08-31), así que
 * una ruta sin declarar ya no queda abierta — devuelve 403. Pero un 403 en
 * producción sobre una pantalla que debería funcionar es un bug tardío y
 * confuso. Esto lo adelanta al arranque, en desarrollo, nombrando la ruta.
 *
 * Es estricta a propósito (tira, no advierte): una ruta sin declaración es
 * siempre un descuido, nunca una decisión — para "sin permiso concreto" está
 * `@SoloAutenticado()`.
 *
 * Usa DiscoveryService y no el router de Express: los decoradores se pueden
 * poner **a nivel de clase** (`@RequirePermissions` sobre el `@Controller`,
 * como en usuarios y referencias), y desde el router solo se ve la función
 * handler, sin su clase. Una primera versión leía el router y reportaba 15
 * falsos positivos por exactamente eso.
 */
export function verificarRutasGateadas(app: INestApplication): void {
  const logger = new Logger('RutasGateadas');
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);

  const sinDeclarar: string[] = [];
  let declaradas = 0;

  for (const wrapper of discovery.getControllers()) {
    // `instance` viene tipado como `any` desde InstanceWrapper; se acota acá
    // para que el resto del recorrido quede tipado de verdad.
    const instance = wrapper.instance as Record<string, unknown> | undefined;
    const metatype = wrapper.metatype as
      (new (...args: never[]) => unknown) | undefined;
    if (!instance || !metatype) continue;

    const prefijo = reflector.get<string>(PATH_METADATA, metatype) ?? '';
    const prototipo = Object.getPrototypeOf(instance) as object;

    for (const nombre of scanner.getAllMethodNames(prototipo)) {
      const handler = instance[nombre];
      if (typeof handler !== 'function') continue;
      // Sin PATH_METADATA no es una ruta, es un método auxiliar del controller.
      const ruta = reflector.get<string>(PATH_METADATA, handler);
      if (ruta === undefined) continue;

      const objetivos = [handler, metatype] as never[];
      const permisos = reflector.getAllAndOverride<string[]>(
        PERMISSIONS_KEY,
        objetivos,
      );
      const esPublico = reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        objetivos,
      );
      const soloAuth = reflector.getAllAndOverride<boolean>(
        SOLO_AUTENTICADO_KEY,
        objetivos,
      );

      if ((permisos && permisos.length > 0) || esPublico || soloAuth) {
        declaradas++;
        continue;
      }
      const verbo = reflector.get<number>(METHOD_METADATA, handler);
      const nombreVerbo = RequestMethod[verbo] ?? '?';
      const path = `/${prefijo}${ruta ? `/${ruta}` : ''}`.replace(/\/+/g, '/');
      sinDeclarar.push(`${nombreVerbo} ${path}  (${metatype.name}.${nombre})`);
    }
  }

  if (sinDeclarar.length > 0) {
    const lista = [...new Set(sinDeclarar)].sort();
    logger.error(
      `${lista.length} ruta(s) sin declarar acceso:\n  ` + lista.join('\n  '),
    );
    throw new Error(
      'Hay rutas sin @RequirePermissions, @SoloAutenticado ni @Public. ' +
        'Con el guard fail-closed devolverían 403: declaralas antes de arrancar.',
    );
  }
  logger.log(`${declaradas} ruta(s) verificadas: todas declaran su acceso`);
}
