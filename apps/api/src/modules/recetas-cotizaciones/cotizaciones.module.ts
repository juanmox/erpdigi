import { Module } from '@nestjs/common';
import { TipoCambioModule } from '../recetas-tipo-cambio/tipo-cambio.module';
import { CotizacionesController } from './cotizaciones.controller';
import { CotizacionesService } from './cotizaciones.service';

@Module({
  imports: [TipoCambioModule],
  controllers: [CotizacionesController],
  providers: [CotizacionesService],
  exports: [CotizacionesService],
})
export class CotizacionesModule {}
