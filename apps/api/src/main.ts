import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { contextoPeticion } from './common/contexto-peticion';
import { ContextoUsuarioInterceptor } from './common/contexto-usuario.interceptor';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';
import { verificarRutasGateadas } from './common/verificar-rutas-gateadas';

// Rutas de preview de import Excel: reciben el .xlsx crudo como body (igual que 01_erp,
// `express.raw()` montado solo en estas rutas). Se registran antes que el `express.json()`
// global (ver bootstrap más abajo) para que tengan prioridad sin importar el Content-Type.
const RUTAS_IMPORT_EXCEL = [
  '/erp/api/recetas/insumos/importar/preview',
  '/erp/api/recetas/insumos/importar-altas/preview',
  '/erp/api/recetas/productos/importar-altas/preview',
  '/erp/api/recetas/desarrollos/importar/preview',
  '/erp/api/costeo/ordenes/importar/preview',
  '/erp/api/costeo/estandar/importar/preview',
  '/erp/api/costeo/rollos/importar/preview',
];

async function bootstrap() {
  // bodyParser: false para reemplazar los parsers JSON/urlencoded por
  // defecto de Nest (Express, límite de 100kb) por unos con un límite más
  // generoso — bug real encontrado con un import de altas de productos de
  // 1,281 filas: "request entity too large" (413) al aplicar, porque el
  // POST con las 1,281 filas en JSON superaba los 100kb por defecto.
  // Aplica a todos los endpoints "aplicar"/"altas" del proyecto, no solo a
  // productos, simplemente no se había topado el límite hasta ahora.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('erp/api');

  // `loopback` y no `true`: la IP reenviada se honra SOLO si la conexión viene
  // de Nginx, que corre en el mismo host (proxy_pass desde 127.0.0.1). Con
  // `true`, cualquiera que llegue directo al puerto de la API desde la red
  // podría mandar un X-Forwarded-For inventado y falsear quién hizo la acción
  // en la bitácora.
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;
  expressApp.set('trust proxy', 'loopback');

  // Deja la IP y el user agent al alcance de AuditoriaService sin que los 45
  // puntos que la llaman tengan que recibirlos y pasarlos — ver
  // common/contexto-peticion.ts. Va ANTES que todo lo demás para cubrir la
  // petición entera.
  app.use(
    (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      contextoPeticion.run(
        {
          ip: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
        },
        next,
      );
    },
  );

  app.use(cookieParser());
  // Las rutas de Excel se registran ANTES del parser JSON global a
  // propósito: Express aplica middleware en orden de registro, así que
  // estas rutas (matcheadas por path, `express.raw({ type: '*/*' })`)
  // quedan protegidas sin importar qué Content-Type mande el cliente —
  // bug real encontrado con el cliente mandando "application/json" por
  // error en una subida de archivo real (ver apps/web/src/lib/api.ts).
  for (const ruta of RUTAS_IMPORT_EXCEL) {
    app.use(ruta, express.raw({ type: '*/*', limit: '5mb' }));
  }
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ limit: '20mb', extended: true }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Después de los guards: ahí ya hay usuario autenticado para la bitácora.
  app.useGlobalInterceptors(new ContextoUsuarioInterceptor());
  // Antes de escuchar: si alguna ruta no declara su acceso, no se arranca.
  // Con el guard fail-closed devolvería 403 en producción; mejor un error
  // ruidoso acá, con el nombre de la ruta.
  await app.init();
  verificarRutasGateadas(app);
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
