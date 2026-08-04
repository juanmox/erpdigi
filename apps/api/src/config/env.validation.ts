import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerido'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET es requerido'),
  TC_FALLBACK: z.coerce.number().default(7.61812),
  // Por defecto sigue NODE_ENV (secure solo en producción), pero se puede forzar a
  // false para un despliegue de producción sin HTTPS (red interna, ver CLAUDE.md) —
  // con NODE_ENV=production y sin este override, el cookie Secure rompería el login
  // porque el navegador nunca lo manda de vuelta por HTTP plano.
  COOKIE_SECURE: z.coerce.boolean().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Variables de entorno inválidas:\n${parsed.error.toString()}`,
    );
  }
  return parsed.data;
}
