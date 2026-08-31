import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';

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
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
