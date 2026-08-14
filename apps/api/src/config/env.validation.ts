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
  // Espejo de Reposiciones hacia Google Sheets (ver GoogleSheetsService) — los tres
  // opcionales a propósito: si faltan, el espejo simplemente se omite (nunca bloquea
  // el guardado real). IMPORTANTE: cualquier variable de entorno nueva DEBE
  // declararse acá o Zod la descarta en silencio (ConfigModule usa dotenv.parse(),
  // no dotenv.config() — nunca mutan process.env directo, solo lo que sobrevive a
  // este schema) — ya causó un bug real de "no pasa nada, sin error" con estas tres.
  GOOGLE_SHEETS_CREDENTIALS_PATH: z.string().optional(),
  GOOGLE_SHEETS_ID_REGISTRO: z.string().optional(),
  GOOGLE_SHEETS_ID_CONSUMOS: z.string().optional(),
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
