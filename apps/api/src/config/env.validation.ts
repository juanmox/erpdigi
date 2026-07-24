import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerido'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET es requerido'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET es requerido'),
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
