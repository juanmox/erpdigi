import { Module } from '@nestjs/common';
import { MonedasController } from './monedas.controller';
import { MonedasService } from './monedas.service';

@Module({
  controllers: [MonedasController],
  providers: [MonedasService],
  exports: [MonedasService],
})
export class MonedasModule {}
