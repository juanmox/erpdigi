import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoEstandarController } from './costeo-estandar.controller';
import { CosteoEstandarService } from './costeo-estandar.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CosteoEstandarController],
  providers: [CosteoEstandarService],
  exports: [CosteoEstandarService],
})
export class CosteoEstandarModule {}
