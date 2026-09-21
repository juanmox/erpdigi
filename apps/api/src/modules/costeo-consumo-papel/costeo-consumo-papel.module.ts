import { Module } from '@nestjs/common';
import { GoogleSheetsModule } from '../../common/google-sheets/google-sheets.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoConsumoPapelController } from './costeo-consumo-papel.controller';
import { CosteoConsumoPapelService } from './costeo-consumo-papel.service';

@Module({
  imports: [AuditoriaModule, GoogleSheetsModule],
  controllers: [CosteoConsumoPapelController],
  providers: [CosteoConsumoPapelService],
})
export class CosteoConsumoPapelModule {}
