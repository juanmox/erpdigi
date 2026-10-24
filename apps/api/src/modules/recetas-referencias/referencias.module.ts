import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CatalogosProductoController } from './catalogos-producto.controller';
import { CatalogosProductoService } from './catalogos-producto.service';
import { ReferenciasController } from './referencias.controller';
import { ReferenciasService } from './referencias.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [ReferenciasController, CatalogosProductoController],
  providers: [ReferenciasService, CatalogosProductoService],
  exports: [ReferenciasService, CatalogosProductoService],
})
export class ReferenciasModule {}
