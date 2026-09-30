import { Module } from '@nestjs/common';
import { CosteoReportesController } from './costeo-reportes.controller';
import { CosteoReportesService } from './costeo-reportes.service';

@Module({
  controllers: [CosteoReportesController],
  providers: [CosteoReportesService],
})
export class CosteoReportesModule {}
