import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoOrdenesController } from './costeo-ordenes.controller';
import { CosteoOrdenesService } from './costeo-ordenes.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CosteoOrdenesController],
  providers: [CosteoOrdenesService],
  exports: [CosteoOrdenesService],
})
export class CosteoOrdenesModule {}
