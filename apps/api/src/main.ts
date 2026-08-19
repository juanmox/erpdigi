import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';

// Rutas de preview de import Excel: reciben el .xlsx crudo como body (igual que 01_erp,
// `express.raw()` montado solo en estas rutas, sin interferir con el `express.json()`
// global que usa el resto de la API).
const RUTAS_IMPORT_EXCEL = [
  '/erp/api/recetas/insumos/importar/preview',
  '/erp/api/recetas/insumos/importar-altas/preview',
  '/erp/api/recetas/productos/importar-altas/preview',
  '/erp/api/recetas/importar-recetas/preview',
  '/erp/api/costeo/ordenes/importar/preview',
  '/erp/api/costeo/estandar/importar/preview',
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('erp/api');
  app.use(cookieParser());
  for (const ruta of RUTAS_IMPORT_EXCEL) {
    app.use(ruta, express.raw({ type: '*/*', limit: '5mb' }));
  }
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
