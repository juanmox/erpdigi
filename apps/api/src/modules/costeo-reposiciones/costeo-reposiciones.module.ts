import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoReposicionesController } from './costeo-reposiciones.controller';
import { CosteoReposicionesService } from './costeo-reposiciones.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CosteoReposicionesController],
  providers: [CosteoReposicionesService],
  exports: [CosteoReposicionesService],
})
export class CosteoReposicionesModule {}
