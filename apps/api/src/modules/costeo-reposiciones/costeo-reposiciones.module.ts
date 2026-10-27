import { Module } from '@nestjs/common';
import { GoogleSheetsModule } from '../../common/google-sheets/google-sheets.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoReposicionesController } from './costeo-reposiciones.controller';
import { CosteoReposicionesService } from './costeo-reposiciones.service';
import { PiezasController } from './piezas.controller';
import { PiezasService } from './piezas.service';

@Module({
  imports: [AuditoriaModule, GoogleSheetsModule],
  controllers: [CosteoReposicionesController, PiezasController],
  providers: [CosteoReposicionesService, PiezasService],
  exports: [CosteoReposicionesService],
})
export class CosteoReposicionesModule {}
