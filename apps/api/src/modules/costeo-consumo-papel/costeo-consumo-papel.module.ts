import { Module } from '@nestjs/common';
import { GoogleSheetsModule } from '../../common/google-sheets/google-sheets.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CosteoRollosModule } from '../costeo-rollos/costeo-rollos.module';
import { CosteoConsumoPapelController } from './costeo-consumo-papel.controller';
import { CosteoConsumoPapelService } from './costeo-consumo-papel.service';

@Module({
  // CosteoRollosModule: el encabezado de cada impresora muestra el rollo
  // montado, y ese cálculo vive en su servicio (una sola fuente del restante).
  imports: [AuditoriaModule, GoogleSheetsModule, CosteoRollosModule],
  controllers: [CosteoConsumoPapelController],
  providers: [CosteoConsumoPapelService],
})
export class CosteoConsumoPapelModule {}
