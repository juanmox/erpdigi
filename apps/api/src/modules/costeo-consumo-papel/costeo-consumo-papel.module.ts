import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoConsumoPapelController } from './costeo-consumo-papel.controller';
import { CosteoConsumoPapelService } from './costeo-consumo-papel.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CosteoConsumoPapelController],
  providers: [CosteoConsumoPapelService],
})
export class CosteoConsumoPapelModule {}
