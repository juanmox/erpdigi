import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoFacturacionController } from './costeo-facturacion.controller';
import { CosteoFacturacionService } from './costeo-facturacion.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CosteoFacturacionController],
  providers: [CosteoFacturacionService],
  exports: [CosteoFacturacionService],
})
export class CosteoFacturacionModule {}
