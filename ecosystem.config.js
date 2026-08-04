// Config de PM2 para producción. Un solo proceso — el frontend (apps/web) no
// necesita proceso propio, se sirve como estáticos vía Nginx (ver infra/nginx/).
//
// Uso en el servidor, después de `pnpm install && pnpm --filter @digitexsa-erp/api build`:
//   pm2 start ecosystem.config.js
//   pm2 save
//
// Para actualizar (después de git pull + build): pm2 restart digitexsa-api
//
// NestJS carga apps/api/.env automáticamente desde su cwd (ConfigModule.forRoot()
// sin envFilePath explícito busca `.env` en process.cwd()) — por eso `cwd` abajo
// apunta a apps/api, no a la raíz del repo.
module.exports = {
  apps: [
    {
      name: 'digitexsa-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
