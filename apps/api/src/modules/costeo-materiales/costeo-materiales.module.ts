import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoMaterialesController } from './costeo-materiales.controller';
import { CosteoMaterialesReporteService } from './costeo-materiales-reporte.service';
import { CosteoMaterialesService } from './costeo-materiales.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CosteoMaterialesController],
  providers: [CosteoMaterialesService, CosteoMaterialesReporteService],
  exports: [CosteoMaterialesService],
})
export class CosteoMaterialesModule {}
