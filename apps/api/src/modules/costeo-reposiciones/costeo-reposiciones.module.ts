import { Module } from '@nestjs/common';
import { GoogleSheetsModule } from '../../common/google-sheets/google-sheets.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoReposicionesController } from './costeo-reposiciones.controller';
import { CosteoReposicionesService } from './costeo-reposiciones.service';

@Module({
  imports: [AuditoriaModule, GoogleSheetsModule],
  controllers: [CosteoReposicionesController],
  providers: [CosteoReposicionesService],
  exports: [CosteoReposicionesService],
})
export class CosteoReposicionesModule {}
