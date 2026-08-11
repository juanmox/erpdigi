import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoRollosController } from './costeo-rollos.controller';
import { CosteoRollosService } from './costeo-rollos.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CosteoRollosController],
  providers: [CosteoRollosService],
  exports: [CosteoRollosService],
})
export class CosteoRollosModule {}
