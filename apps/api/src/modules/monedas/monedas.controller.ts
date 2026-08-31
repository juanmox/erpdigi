import { Controller, Get, Query } from '@nestjs/common';
import { SoloAutenticado } from '../auth/decorators/solo-autenticado.decorator';
import { MonedasService } from './monedas.service';

@Controller('monedas')
export class MonedasController {
  constructor(private readonly monedasService: MonedasService) {}

  // Catálogo de referencia, sin datos sensibles.
  @SoloAutenticado()
  @Get()
  listar() {
    return this.monedasService.listar();
  }

  @SoloAutenticado()
  @Get('tasas-cambio')
  listarTasasCambio(
    @Query('idMonedaOrigen') idMonedaOrigen?: string,
    @Query('idMonedaDestino') idMonedaDestino?: string,
  ) {
    return this.monedasService.listarTasasCambio({
      idMonedaOrigen: idMonedaOrigen ? Number(idMonedaOrigen) : undefined,
      idMonedaDestino: idMonedaDestino ? Number(idMonedaDestino) : undefined,
    });
  }
}
