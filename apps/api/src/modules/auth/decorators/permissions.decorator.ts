import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permisosRequeridos';

export const RequirePermissions = (...permisos: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permisos);
