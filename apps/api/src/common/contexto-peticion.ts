import { AsyncLocalStorage } from 'node:async_hooks';

export interface ContextoPeticion {
  /** IP del cliente. Detrás de Nginx sale de X-Forwarded-For (ver main.ts). */
  ip: string | null;
  /** Navegador y sistema: lo más cercano a "desde qué computadora" que hay. */
  userAgent: string | null;
  /**
   * El username del actor, para guardarlo como TEXTO en la bitácora.
   *
   * Lo llena `ContextoUsuarioInterceptor` leyendo el JWT, **después** del
   * guard. Es mutable a propósito: el middleware que crea el contexto corre
   * antes de la autenticación, así que todavía no hay usuario.
   *
   * Por qué del contexto y no de una consulta en `registrar()`: `capturarLote`
   * registra UNA entrada por línea, así que un envío de 300 líneas haría 300
   * consultas de más para traer siempre el mismo nombre.
   */
  usuarioNombre?: string | null;
  /**
   * La empresa activa del token. Se llena igual que el nombre, por la misma
   * razón: medido el 2026-10-09, **solo 29 de 418** registros la traían —
   * nada más los de `usuario_empresa_rol`, el único servicio que la pasaba a
   * mano. Sin esto, filtrar la bitácora por empresa escondía el 93%.
   */
  idEmpresa?: number | null;
}

/**
 * Lleva la IP y el user agent de la petición en curso, para que
 * `AuditoriaService.registrar()` los escriba sin que cada servicio tenga que
 * recibirlos y pasarlos.
 *
 * ⚠️ Por qué AsyncLocalStorage y no un parámetro más: hay **45 llamadas** a
 * `registrar()` repartidas en 12 servicios, y ninguna tiene acceso al request.
 * Agregarlo como parámetro obligaría a inyectar el request en cada servicio y
 * a tocar los 45 puntos — y bastaría olvidar uno para que ese registro quedara
 * sin IP en silencio, que es justo el modo de falla que se quiere evitar.
 *
 * El fallback es `null`: si algo corre fuera de una petición HTTP (un seed, un
 * script), se registra igual pero sin IP. No se inventa una.
 */
export const contextoPeticion = new AsyncLocalStorage<ContextoPeticion>();

/** La IP y el user agent de la petición en curso, o nulls si no hay ninguna. */
export function contextoActual(): ContextoPeticion {
  return contextoPeticion.getStore() ?? { ip: null, userAgent: null };
}
