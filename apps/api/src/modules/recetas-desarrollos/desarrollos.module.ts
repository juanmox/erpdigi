import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { DesarrollosImportService } from './desarrollos-import.service';
import { DesarrollosController } from './desarrollos.controller';
import { DesarrollosService } from './desarrollos.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [DesarrollosController],
  providers: [DesarrollosService, DesarrollosImportService],
  exports: [DesarrollosService],
})
export class DesarrollosModule {}
