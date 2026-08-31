import { SetMetadata } from '@nestjs/common';

export const SOLO_AUTENTICADO_KEY = 'soloAutenticado';

/**
 * Marca un endpoint que cualquier usuario autenticado puede usar, sin necesitar
 * ningún permiso concreto (ej. leer el propio perfil, elegir empresa).
 *
 * Existe porque `PermissionsGuard` pasó a ser **fail-closed** (2026-08-31): sin
 * una declaración explícita el guard deniega. Antes un endpoint sin decorador
 * quedaba abierto a cualquier autenticado, y un olvido en un controller nuevo
 * era un agujero silencioso — sin error, sin log, y las pruebas manuales no lo
 * detectaban porque quien prueba suele ser admin.
 *
 * El valor de este decorador es que la decisión queda escrita: al leer el
 * código se ve que "sin permiso" fue deliberado y no un descuido.
 *
 * No confundir con `@Public()`, que además saltea la autenticación.
 */
export const SoloAutenticado = () => SetMetadata(SOLO_AUTENTICADO_KEY, true);
